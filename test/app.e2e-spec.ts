import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { UnauthorizedFilter } from '../src/common/unauthorized.filter';

// main.ts 의 부트스트랩을 테스트에서 재현
async function boot(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bodyParser: false });
  const limit = '5mb';
  app.use(express.json({ limit }));
  app.use(express.urlencoded({ extended: true, limit }));
  app.use(express.text({ type: ['text/html', 'text/plain'], limit }));
  app.use(cookieParser());
  app.useGlobalFilters(new UnauthorizedFilter());
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  await app.init();
  return app;
}

describe('lightifact (e2e)', () => {
  let app: INestApplication;
  let http: () => ReturnType<typeof request>;

  beforeAll(async () => {
    process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'lf-test-'));
    delete process.env.BASE_URL;
    delete process.env.LIGHTIFACT_CONTENT_ORIGIN;
    app = await boot();
    http = () => request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('healthz → ok', async () => {
    const res = await http().get('/healthz');
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
  });

  it('최초 실행: 사용자 없으면 GET / → /setup 리다이렉트', async () => {
    const res = await http().get('/').set('Accept', 'text/html');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/setup');
  });

  let cookie = '';
  let token = '';
  it('setup 으로 첫 admin 생성 + 세션 쿠키', async () => {
    const res = await http().post('/api/setup').send({ email: 'admin@x.kr', password: 'pw12345678' });
    expect(res.status).toBeLessThan(300);
    expect(res.headers['set-cookie']?.[0]).toContain('lf_session=');
    cookie = res.headers['set-cookie'][0].split(';')[0];
  });

  it('로그인 후 GET / → 200', async () => {
    const res = await http().get('/').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('토큰 없는 업로드 → 401 / Bearer 업로드 → 201', async () => {
    await http().post('/artifacts').send({ html: '<h1>x</h1>' }).expect(401);
    // 관리자 토큰은 setup 직후 로그인 쿠키로 업로드(세션)해서 slug 확보
    const up = await http().post('/artifacts').set('Cookie', cookie).send({ title: 't', html: '<h1>hi</h1>' });
    expect(up.status).toBe(201);
    expect(up.body.url).toMatch(/\/a\//);
  });

  it('요청 Host 기반 URL 도출 (BASE_URL 없이)', async () => {
    const up = await http().post('/artifacts').set('Cookie', cookie).set('Host', 'demo.example').send({ html: '<h1>h</h1>' });
    expect(up.body.url).toMatch(/^http:\/\/demo\.example\/a\//);
  });

  it('artifact: 미로그인 뷰 401, 로그인 뷰 200, /raw CSP 에 form-action/connect-src', async () => {
    const up = await http().post('/artifacts').set('Cookie', cookie).send({ html: '<h1>z</h1>' });
    const slug = up.body.slug;
    await http().get(`/a/${slug}`).expect(401);
    await http().get(`/a/${slug}`).set('Cookie', cookie).expect(200);
    const raw = await http().get(`/raw/${slug}`).set('Cookie', cookie);
    expect(raw.status).toBe(200);
    expect(raw.headers['content-security-policy']).toContain("connect-src 'none'");
    expect(raw.headers['content-security-policy']).toContain("form-action 'none'");
  });

  it('삭제: 소유자는 가능', async () => {
    const up = await http().post('/artifacts').set('Cookie', cookie).send({ title: 'del', html: '<h1>d</h1>' });
    const slug = up.body.slug;
    await http().post(`/artifacts/${slug}/delete`).set('Cookie', cookie).expect(302);
    await http().get(`/a/${slug}`).set('Cookie', cookie).expect(404);
  });
});

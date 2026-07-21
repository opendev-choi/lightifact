import { Body, Controller, Get, Header, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ArtifactsService, RAW_CSP } from './artifacts.service';
import { UsersService } from '../users/users.service';
import { ViewService } from '../views/view.service';
import { SessionGuard, WriteGuard } from '../common/guards';
import { CurrentUser } from '../common/current-user.decorator';

@Controller()
export class ArtifactsController {
  constructor(
    private readonly artifacts: ArtifactsService,
    private readonly users: UsersService,
    private readonly view: ViewService,
  ) {}

  // 업로드: 세션 또는 Bearer API 토큰
  @Post('artifacts')
  @UseGuards(WriteGuard)
  create(
    @Body() body: unknown,
    @Query('title') qTitle: string | undefined,
    @CurrentUser() owner: string,
    @Res() res: Response,
  ): void {
    let html: string | undefined;
    let title = qTitle || '';
    if (typeof body === 'string') {
      html = body; // raw HTML (text/html)
    } else if (body && typeof body === 'object') {
      const b = body as { html?: string; title?: string };
      html = b.html;
      title = b.title ?? title;
    }
    if (!html || !html.trim()) {
      res.status(400).json({ error: 'html body is empty' });
      return;
    }
    const { slug, url } = this.artifacts.create(html, title, owner);
    res.status(201).json({ slug, url, owner });
  }

  // 목록 + 업로드 UI (로그인 필요)
  @Get()
  @UseGuards(SessionGuard)
  @Header('Content-Type', 'text/html; charset=utf-8')
  index(@CurrentUser() me: string): string {
    const u = this.users.get(me);
    return this.view.index(me, !!u?.admin, this.artifacts.list(), u?.apiToken ?? '');
  }

  // 덮어쓰기 (본인 소유 또는 admin) — slug·링크 유지
  @Put('artifacts/:slug')
  @UseGuards(WriteGuard)
  update(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Query('title') qTitle: string | undefined,
    @CurrentUser() me: string,
    @Res() res: Response,
  ): void {
    const meta = this.artifacts.meta(slug);
    if (!meta) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    if (meta.owner !== me && !this.users.get(me)?.admin) {
      res.status(403).json({ error: '권한 없음 (본인 소유 또는 admin만 수정 가능)' });
      return;
    }
    let html: string | undefined;
    let title = qTitle ?? meta.title;
    if (typeof body === 'string') {
      html = body;
    } else if (body && typeof body === 'object') {
      const b = body as { html?: string; title?: string };
      html = b.html;
      if (b.title !== undefined) title = b.title;
    }
    if (!html || !html.trim()) {
      res.status(400).json({ error: 'html body is empty' });
      return;
    }
    this.artifacts.update(slug, html, title);
    res.json({ slug, url: this.artifacts.shareUrl(slug), owner: meta.owner, updated: true });
  }

  // 삭제 (본인 소유 또는 admin)
  @Post('artifacts/:slug/delete')
  @UseGuards(SessionGuard)
  deleteArtifact(@Param('slug') slug: string, @CurrentUser() me: string, @Res() res: Response): void {
    const meta = this.artifacts.meta(slug);
    if (meta && (meta.owner === me || this.users.get(me)?.admin)) {
      this.artifacts.delete(slug);
    }
    res.redirect('/');
  }

  // 뷰어 (sandboxed iframe)
  @Get('a/:slug')
  @UseGuards(SessionGuard)
  viewer(@Param('slug') slug: string, @Res() res: Response): void {
    const meta = this.artifacts.meta(slug);
    if (!meta) {
      res.status(404).type('text/html').send(this.view.message('Not found', '404', '해당 artifact를 찾을 수 없습니다.'));
      return;
    }
    res.type('text/html').send(this.view.viewer(meta));
  }

  // 원본 (strict CSP, iframe 전용)
  @Get('raw/:slug')
  @UseGuards(SessionGuard)
  raw(@Param('slug') slug: string, @Res() res: Response): void {
    const html = this.artifacts.has(slug) ? this.artifacts.html(slug) : null;
    if (html === null) {
      res.status(404).send('not found');
      return;
    }
    res.setHeader('Content-Security-Policy', RAW_CSP);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(html);
  }
}

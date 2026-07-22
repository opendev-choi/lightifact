import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { UnauthorizedFilter } from './common/unauthorized.filter';

async function bootstrap(): Promise<void> {
  // 기본 bodyParser 끄고 직접 등록 (artifact HTML 대응: 큰 limit + text/html)
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const limit = '5mb';
  app.use(express.json({ limit }));
  app.use(express.urlencoded({ extended: true, limit }));
  app.use(express.text({ type: ['text/html', 'text/plain'], limit }));
  app.use(cookieParser());
  app.useGlobalFilters(new UnauthorizedFilter());
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.disable('x-powered-by');
  expressApp.set('trust proxy', true); // ALB X-Forwarded-* 신뢰 (요청 기반 base URL 도출)

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 4321);
  const baseUrl = config.get<string>('BASE_URL', `http://localhost:${port}`);
  await app.listen(port);
  new Logger('lightifact').log(`🧩 lightifact → ${baseUrl}`);
}

void bootstrap();

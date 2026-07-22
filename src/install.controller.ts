import { Controller, Get, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 설치 파일(스킬/룰)을 앱이 직접 서빙 — canonical 도메인을 런타임 BASE_URL 로 치환.
// → 도메인이 바뀌어도 values.yaml baseUrl 한 곳만 고치면 설치 파일이 전부 따라온다.
const CANONICAL = 'https://lightifact.cardoc.kr';

@Controller('install')
export class InstallController {
  private readonly baseUrl: string;
  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('BASE_URL', 'http://localhost:4321');
  }

  private serve(res: Response, relPath: string, contentType: string): void {
    try {
      const raw = readFileSync(join(process.cwd(), relPath), 'utf8');
      res.type(contentType).send(raw.split(CANONICAL).join(this.baseUrl));
    } catch {
      res.status(404).send('not found');
    }
  }

  @Get('AGENTS.md')
  agents(@Res() res: Response): void {
    this.serve(res, 'AGENTS.md', 'text/markdown; charset=utf-8');
  }

  @Get('skill/SKILL.md')
  skill(@Res() res: Response): void {
    this.serve(res, '.claude/skills/lightifact/SKILL.md', 'text/markdown; charset=utf-8');
  }

  @Get('skill/share.mjs')
  share(@Res() res: Response): void {
    this.serve(res, '.claude/skills/lightifact/share.mjs', 'text/javascript; charset=utf-8');
  }
}

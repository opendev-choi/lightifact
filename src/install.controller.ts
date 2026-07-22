import { Controller, Get, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requestBaseUrl } from './common/base-url';

// 설치 파일(스킬/룰)을 앱이 직접 서빙 — placeholder 를 요청 호스트 기반 URL 로 치환.
// → BASE_URL 세팅 없이도, 접속한 호스트 기준으로 설치 파일이 일관되게 나간다.
const PLACEHOLDER = '__LIGHTIFACT_URL__';

@Controller('install')
export class InstallController {
  private render(req: Request, res: Response, relPath: string, contentType: string): void {
    try {
      const raw = readFileSync(join(process.cwd(), relPath), 'utf8');
      res.type(contentType).send(raw.split(PLACEHOLDER).join(requestBaseUrl(req)));
    } catch {
      res.status(404).send('not found');
    }
  }

  @Get('AGENTS.md')
  agents(@Req() req: Request, @Res() res: Response): void {
    this.render(req, res, 'AGENTS.md', 'text/markdown; charset=utf-8');
  }

  @Get('skill/SKILL.md')
  skill(@Req() req: Request, @Res() res: Response): void {
    this.render(req, res, '.claude/skills/lightifact/SKILL.md', 'text/markdown; charset=utf-8');
  }

  @Get('skill/share.mjs')
  share(@Req() req: Request, @Res() res: Response): void {
    this.render(req, res, '.claude/skills/lightifact/share.mjs', 'text/javascript; charset=utf-8');
  }
}

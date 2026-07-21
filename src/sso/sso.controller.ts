import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { SsoService } from './sso.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { SessionService } from '../auth/session.service';
import { ViewService } from '../views/view.service';
import { AdminGuard, SessionGuard } from '../common/guards';

@Controller()
export class SsoController {
  constructor(
    private readonly sso: SsoService,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly session: SessionService,
    private readonly view: ViewService,
  ) {}

  @Get('oauth2/start')
  start(@Res() res: Response): void {
    if (!this.sso.configured()) {
      res.redirect('/login');
      return;
    }
    res.redirect(this.sso.authUrl());
  }

  @Get('oauth2/callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response): Promise<void> {
    if (!this.sso.configured() || !code) {
      res.redirect('/login');
      return;
    }
    try {
      const email = await this.sso.exchange(code, state);
      if (!this.users.get(email)) {
        if (!this.settings.sso.autoJoin) {
          res
            .status(403)
            .type('text/html')
            .send(this.view.message('가입 필요', '가입되지 않은 계정', '자동 가입이 꺼져 있습니다. 관리자에게 초대를 요청하세요.'));
          return;
        }
        this.users.upsert(email, null, { sso: true }); // 허용 도메인 자동 가입
      }
      res.setHeader('Set-Cookie', this.session.cookieHeader(this.session.create(email)));
      res.redirect('/');
    } catch (e) {
      res
        .status(403)
        .type('text/html')
        .send(this.view.message('로그인 실패', '로그인 실패', (e as Error).message));
    }
  }

  @Post('api/settings/sso')
  @UseGuards(SessionGuard, AdminGuard)
  saveSso(
    @Body() body: { enabled?: string; clientId?: string; clientSecret?: string; allowedDomain?: string; autoJoin?: string },
    @Res() res: Response,
  ): void {
    this.settings.updateSso({
      enabled: body.enabled === 'on',
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      allowedDomain: body.allowedDomain,
      autoJoin: body.autoJoin === 'on',
    });
    res.redirect('/settings');
  }
}

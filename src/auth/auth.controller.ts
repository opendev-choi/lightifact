import { Body, Controller, Get, Header, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { UsersService } from '../users/users.service';
import { PasswordService } from './password.service';
import { SessionService, SESSION_COOKIE } from './session.service';
import { safeNext } from '../common/safe-next';
import { isSecure } from '../common/base-url';
import { SettingsService } from '../settings/settings.service';
import { ViewService } from '../views/view.service';

@Controller()
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly session: SessionService,
    private readonly settings: SettingsService,
    private readonly view: ViewService,
  ) {}

  @Get('login')
  @Header('Content-Type', 'text/html; charset=utf-8')
  login(@Query('next') next: string): string {
    return this.view.login(this.settings.ssoConfigured(), safeNext(next), this.settings.passwordLoginAllowed());
  }

  @Post('api/login')
  apiLogin(@Body() body: { email?: string; password?: string }, @Req() req: Request, @Res() res: Response): void {
    if (!this.settings.passwordLoginAllowed()) {
      res.status(403).json({ error: '이 워크스페이스는 Google 로그인만 허용합니다' });
      return;
    }
    const email = (body.email || '').toLowerCase().trim();
    const user = this.users.get(email);
    if (!user || !this.passwords.verify(body.password || '', user)) {
      res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
      return;
    }
    res.setHeader('Set-Cookie', this.session.cookieHeader(this.session.create(email), isSecure(req)));
    res.json({ ok: true, email });
  }

  @Get('setup')
  @Header('Content-Type', 'text/html; charset=utf-8')
  setup(): string {
    return this.view.setup();
  }

  @Post('api/setup')
  apiSetup(@Body() body: { email?: string; password?: string }, @Req() req: Request, @Res() res: Response): void {
    if (this.users.count() > 0) {
      res.status(403).json({ error: '이미 초기화됨' });
      return;
    }
    const email = (body.email || '').toLowerCase().trim();
    if (!email || (body.password || '').length < 8) {
      res.status(400).json({ error: '이메일 / 8자 이상 비밀번호 필요' });
      return;
    }
    this.users.upsert(email, body.password!, { admin: true });
    res.setHeader('Set-Cookie', this.session.cookieHeader(this.session.create(email), isSecure(req)));
    res.json({ ok: true });
  }

  @Get('logout')
  logout(@Req() req: Request, @Res() res: Response): void {
    this.session.destroy((req as any).cookies?.[SESSION_COOKIE]);
    res.setHeader('Set-Cookie', this.session.clearHeader(isSecure(req)));
    res.redirect('/login');
  }

  @Get('invite/:token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  invite(@Param('token') token: string): string {
    const inv = this.users.getInvite(token);
    if (!inv) return this.view.message('초대 만료', '초대가 유효하지 않습니다', '만료되었거나 이미 사용됨.');
    return this.view.invite(token, inv.email);
  }

  @Post('api/invite/accept')
  acceptInvite(@Body() body: { token?: string; password?: string }, @Req() req: Request, @Res() res: Response): void {
    if ((body.password || '').length < 8) {
      res.status(400).json({ error: '비밀번호 8자 이상' });
      return;
    }
    const email = this.users.acceptInvite(body.token || '', body.password!);
    if (!email) {
      res.status(400).json({ error: '초대가 유효하지 않습니다' });
      return;
    }
    res.setHeader('Set-Cookie', this.session.cookieHeader(this.session.create(email), isSecure(req)));
    res.json({ ok: true });
  }
}

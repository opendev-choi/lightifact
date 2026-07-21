import { Body, Controller, Get, Header, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { UsersService } from './users.service';
import { SettingsService } from '../settings/settings.service';
import { ViewService } from '../views/view.service';
import { AdminGuard, SessionGuard } from '../common/guards';
import { CurrentUser } from '../common/current-user.decorator';

@Controller()
@UseGuards(SessionGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    private readonly view: ViewService,
  ) {}

  // ── 내 계정 (모든 사용자) ──
  @Get('account')
  @Header('Content-Type', 'text/html; charset=utf-8')
  account(@CurrentUser() me: string): string {
    return this.view.account(me, this.users.get(me)!);
  }

  @Post('api/account/token')
  regenToken(@CurrentUser() me: string, @Res() res: Response): void {
    this.users.regenerateToken(me);
    res.redirect('/account');
  }

  // ── 설정 (admin 전용) ──
  @Get('settings')
  @UseGuards(AdminGuard)
  @Header('Content-Type', 'text/html; charset=utf-8')
  settingsPage(@CurrentUser() me: string): string {
    return this.view.settings(me, this.users.list(), this.users.listInvites(), this.settings.sso);
  }

  @Post('api/users')
  @UseGuards(AdminGuard)
  addUser(@Body() body: { email?: string; password?: string; admin?: string }, @Res() res: Response): void {
    const email = (body.email || '').toLowerCase().trim();
    if (!email || !body.password) {
      res.status(400).json({ error: 'email / password 필요' });
      return;
    }
    this.users.upsert(email, body.password, { admin: body.admin === 'on' });
    res.redirect('/settings');
  }

  @Post('api/users/delete')
  @UseGuards(AdminGuard)
  deleteUser(@CurrentUser() me: string, @Body() body: { email?: string }, @Res() res: Response): void {
    const email = (body.email || '').toLowerCase().trim();
    if (email && email !== me) this.users.delete(email);
    res.redirect('/settings');
  }

  @Post('api/invite')
  @UseGuards(AdminGuard)
  invite(@Body() body: { email?: string }, @Res() res: Response): void {
    const email = (body.email || '').toLowerCase().trim();
    if (email) this.users.createInvite(email);
    res.redirect('/settings');
  }

  @Post('api/invite/revoke')
  @UseGuards(AdminGuard)
  revokeInvite(@Body() body: { token?: string }, @Res() res: Response): void {
    if (body.token) this.users.revokeInvite(body.token);
    res.redirect('/settings');
  }
}

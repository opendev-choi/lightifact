import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { SessionService } from '../auth/session.service';

// Google OAuth code flow + userinfo (별도 라이브러리 없이 fetch 로).
// redirect_uri 는 요청 호스트 기반 base URL 로 구성 (BASE_URL 세팅 불필요).
@Injectable()
export class SsoService {
  constructor(
    private readonly settings: SettingsService,
    private readonly session: SessionService,
  ) {}

  configured(): boolean {
    return this.settings.ssoConfigured();
  }

  // Google 로그인 시작 URL (state 로 CSRF 방지 + 로그인 후 복귀 next 보관)
  authUrl(baseUrl: string, next = '/'): string {
    const p = new URLSearchParams({
      client_id: this.settings.sso.clientId,
      redirect_uri: `${baseUrl}/oauth2/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state: this.session.createOauthState(next),
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
  }

  // code → { email, next } (허용 도메인 검증). 실패 시 예외.
  async exchange(baseUrl: string, code: string, state: string): Promise<{ email: string; next: string }> {
    const st = this.session.consumeOauthState(state);
    if (!st.valid) throw new Error('invalid oauth state');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.settings.sso.clientId,
        client_secret: this.settings.sso.clientSecret,
        redirect_uri: `${baseUrl}/oauth2/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) throw new Error('token exchange failed');
    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const info = (await infoRes.json()) as { email?: string };
    const email = (info.email || '').toLowerCase();
    const dom = this.settings.sso.allowedDomain?.trim();
    if (!email || (dom && !email.endsWith(`@${dom}`))) {
      throw new Error(`허용되지 않은 계정 (${dom || '?'} 도메인만 가능)`);
    }
    return { email, next: st.next };
  }
}

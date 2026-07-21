import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'lf_session';
const TTL_MS = 1000 * 60 * 60 * 12; // 12h

// 무상태 서명 세션: base64url(payload).hmac
@Injectable()
export class SessionService {
  private readonly secret: string;
  readonly ttlSeconds = TTL_MS / 1000;
  readonly secure: boolean;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('SESSION_SECRET', 'dev-insecure-session-secret');
    this.secure = (config.get<string>('BASE_URL') || '').startsWith('https://');
  }

  sign(email: string): string {
    const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + TTL_MS })).toString('base64url');
    const sig = createHmac('sha256', this.secret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  // 서명 검증 후 email 반환 (만료/위조 시 null). 사용자 존재 검증은 호출측에서.
  verify(cookie?: string): string | null {
    if (!cookie) return null;
    const [payload, sig] = cookie.split('.');
    if (!payload || !sig) return null;
    const expected = createHmac('sha256', this.secret).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (Date.now() > exp) return null;
      return email as string;
    } catch {
      return null;
    }
  }

  cookieHeader(value: string, maxAgeSeconds = this.ttlSeconds): string {
    return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${this.secure ? '; Secure' : ''}`;
  }

  clearHeader(): string {
    return this.cookieHeader('', 0);
  }
}

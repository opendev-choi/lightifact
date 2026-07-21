import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { DbService } from '../db/db.service';

export const SESSION_COOKIE = 'lf_session';
const TTL_MS = 1000 * 60 * 60 * 12; // 12h
const OAUTH_STATE_TTL_MS = 1000 * 60 * 10; // 10m

// 서버측 세션: 랜덤 토큰을 DB 에 저장 (무상태 서명 아님 → 시크릿 불필요, revocable).
@Injectable()
export class SessionService {
  readonly ttlSeconds = TTL_MS / 1000;
  readonly secure: boolean;

  constructor(
    private readonly db: DbService,
    config: ConfigService,
  ) {
    this.secure = (config.get<string>('BASE_URL') || '').startsWith('https://');
  }

  create(email: string): string {
    const token = randomBytes(32).toString('hex');
    this.db.db
      .prepare('INSERT INTO sessions (token, email, exp) VALUES (?, ?, ?)')
      .run(token, email, Date.now() + TTL_MS);
    return token;
  }

  verify(token?: string): string | null {
    if (!token) return null;
    const row = this.db.db.prepare('SELECT email, exp FROM sessions WHERE token = ?').get(token) as
      | { email: string; exp: number }
      | undefined;
    if (!row) return null;
    if (Date.now() > row.exp) {
      this.destroy(token);
      return null;
    }
    return row.email;
  }

  destroy(token?: string): void {
    if (token) this.db.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  // ── OAuth state (CSRF 방지, 단명) + 로그인 후 복귀 경로(next) ──
  createOauthState(next = '/'): string {
    const state = randomBytes(24).toString('hex');
    this.db.db
      .prepare('INSERT INTO oauth_states (state, next, exp) VALUES (?, ?, ?)')
      .run(state, next, Date.now() + OAUTH_STATE_TTL_MS);
    return state;
  }

  consumeOauthState(state?: string): { valid: boolean; next: string } {
    if (!state) return { valid: false, next: '/' };
    const row = this.db.db.prepare('SELECT next, exp FROM oauth_states WHERE state = ?').get(state) as
      | { next: string; exp: number }
      | undefined;
    if (row) this.db.db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    return { valid: !!row && Date.now() <= row.exp, next: row?.next || '/' };
  }

  cookieHeader(value: string, maxAgeSeconds = this.ttlSeconds): string {
    return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${this.secure ? '; Secure' : ''}`;
  }

  clearHeader(): string {
    return this.cookieHeader('', 0);
  }
}

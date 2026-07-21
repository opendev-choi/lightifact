import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DbService } from '../db/db.service';
import { PasswordService } from '../auth/password.service';
import { Invite, User } from '../common/types';

const INVITE_TTL_MS = 1000 * 60 * 60 * 72; // 72h

interface UserRow {
  email: string;
  salt: string | null;
  hash: string | null;
  admin: number;
  api_token: string;
  sso: number;
}

function toUser(row: UserRow): User {
  return {
    salt: row.salt ?? undefined,
    hash: row.hash ?? undefined,
    admin: !!row.admin,
    apiToken: row.api_token,
    sso: !!row.sso,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly db: DbService,
    private readonly passwords: PasswordService,
  ) {}

  private get sql() {
    return this.db.db;
  }

  count(): number {
    return (this.sql.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  }

  get(email: string): User | undefined {
    const row = this.sql.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as UserRow | undefined;
    return row ? toUser(row) : undefined;
  }

  list(): Array<{ email: string } & User> {
    const rows = this.sql.prepare('SELECT * FROM users ORDER BY created_at').all() as UserRow[];
    return rows.map((r) => ({ email: r.email, ...toUser(r) }));
  }

  upsert(email: string, password: string | null, opts: { admin?: boolean; sso?: boolean } = {}): User {
    const key = email.toLowerCase().trim();
    const existing = this.sql.prepare('SELECT * FROM users WHERE email = ?').get(key) as UserRow | undefined;
    const creds = password ? this.passwords.hash(password) : { salt: existing?.salt ?? null, hash: existing?.hash ?? null };
    const admin = opts.admin ?? (existing ? !!existing.admin : false);
    const sso = opts.sso ?? (existing ? !!existing.sso : false);
    const apiToken = existing?.api_token ?? this.passwords.newApiToken();
    this.sql
      .prepare(
        `INSERT INTO users (email, salt, hash, admin, api_token, sso, created_at)
         VALUES (@email, @salt, @hash, @admin, @apiToken, @sso, @createdAt)
         ON CONFLICT(email) DO UPDATE SET salt=@salt, hash=@hash, admin=@admin, sso=@sso`,
      )
      .run({
        email: key,
        salt: creds.salt,
        hash: creds.hash,
        admin: admin ? 1 : 0,
        apiToken,
        sso: sso ? 1 : 0,
        createdAt: Date.now(), // ON CONFLICT 시 created_at 은 갱신 안 함
      });
    return this.get(key)!;
  }

  delete(email: string): void {
    this.sql.prepare('DELETE FROM users WHERE email = ?').run(email.toLowerCase());
  }

  regenerateToken(email: string): string | null {
    const token = this.passwords.newApiToken();
    const res = this.sql.prepare('UPDATE users SET api_token = ? WHERE email = ?').run(token, email.toLowerCase());
    return res.changes ? token : null;
  }

  findByApiToken(token: string): string | null {
    const row = this.sql.prepare('SELECT email FROM users WHERE api_token = ?').get(token) as { email: string } | undefined;
    return row?.email ?? null;
  }

  // ── 초대 ──
  private pruneInvites(): void {
    this.sql.prepare('DELETE FROM invites WHERE exp < ?').run(Date.now());
  }

  createInvite(email: string): string {
    const token = randomBytes(24).toString('hex');
    this.sql.prepare('INSERT INTO invites (token, email, exp) VALUES (?, ?, ?)').run(token, email.toLowerCase().trim(), Date.now() + INVITE_TTL_MS);
    return token;
  }

  listInvites(): Array<{ token: string } & Invite> {
    this.pruneInvites();
    return this.sql.prepare('SELECT token, email, exp FROM invites').all() as Array<{ token: string } & Invite>;
  }

  getInvite(token: string): Invite | null {
    this.pruneInvites();
    const row = this.sql.prepare('SELECT email, exp FROM invites WHERE token = ?').get(token) as Invite | undefined;
    return row ?? null;
  }

  revokeInvite(token: string): void {
    this.sql.prepare('DELETE FROM invites WHERE token = ?').run(token);
  }

  acceptInvite(token: string, password: string): string | null {
    const inv = this.getInvite(token);
    if (!inv) return null;
    this.upsert(inv.email, password, { admin: false });
    this.revokeInvite(token);
    return inv.email;
  }
}

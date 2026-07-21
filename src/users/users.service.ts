import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { StoreService } from '../store/store.service';
import { PasswordService } from '../auth/password.service';
import { Invite, User } from '../common/types';

const USERS_FILE = 'users.json';
const INVITES_FILE = 'invites.json';
const INVITE_TTL_MS = 1000 * 60 * 60 * 72; // 72h

@Injectable()
export class UsersService {
  private users: Record<string, User>;
  private invites: Record<string, Invite>;

  constructor(
    private readonly store: StoreService,
    private readonly passwords: PasswordService,
  ) {
    this.users = this.store.readJson<Record<string, User>>(USERS_FILE, {});
    this.invites = this.store.readJson<Record<string, Invite>>(INVITES_FILE, {});
  }

  private persistUsers() {
    this.store.writeJson(USERS_FILE, this.users);
  }
  private persistInvites() {
    this.store.writeJson(INVITES_FILE, this.invites);
  }

  count(): number {
    return Object.keys(this.users).length;
  }
  get(email: string): User | undefined {
    return this.users[email.toLowerCase()];
  }
  list(): Array<{ email: string } & User> {
    return Object.entries(this.users).map(([email, u]) => ({ email, ...u }));
  }

  upsert(email: string, password: string | null, opts: { admin?: boolean; sso?: boolean } = {}): User {
    const key = email.toLowerCase().trim();
    const existing = this.users[key];
    const user: User = {
      admin: opts.admin ?? existing?.admin ?? false,
      sso: opts.sso ?? existing?.sso ?? false,
      apiToken: existing?.apiToken ?? this.passwords.newApiToken(),
      salt: existing?.salt,
      hash: existing?.hash,
    };
    if (password) {
      const { salt, hash } = this.passwords.hash(password);
      user.salt = salt;
      user.hash = hash;
    }
    this.users[key] = user;
    this.persistUsers();
    return user;
  }

  delete(email: string): void {
    delete this.users[email.toLowerCase()];
    this.persistUsers();
  }

  regenerateToken(email: string): string | null {
    const u = this.get(email);
    if (!u) return null;
    u.apiToken = this.passwords.newApiToken();
    this.persistUsers();
    return u.apiToken;
  }

  findByApiToken(token: string): string | null {
    const entry = Object.entries(this.users).find(([, u]) => u.apiToken === token);
    return entry ? entry[0] : null;
  }

  // ── 초대 ──
  private pruneInvites() {
    let changed = false;
    for (const [t, v] of Object.entries(this.invites)) {
      if (Date.now() > v.exp) {
        delete this.invites[t];
        changed = true;
      }
    }
    if (changed) this.persistInvites();
  }

  createInvite(email: string): string {
    const token = randomBytes(24).toString('hex');
    this.invites[token] = { email: email.toLowerCase().trim(), exp: Date.now() + INVITE_TTL_MS };
    this.persistInvites();
    return token;
  }

  listInvites(): Array<{ token: string } & Invite> {
    this.pruneInvites();
    return Object.entries(this.invites).map(([token, v]) => ({ token, ...v }));
  }

  getInvite(token: string): Invite | null {
    this.pruneInvites();
    return this.invites[token] ?? null;
  }

  revokeInvite(token: string): void {
    delete this.invites[token];
    this.persistInvites();
  }

  // 초대 수락 → 일반 계정 생성
  acceptInvite(token: string, password: string): string | null {
    const inv = this.getInvite(token);
    if (!inv) return null;
    this.upsert(inv.email, password, { admin: false });
    this.revokeInvite(token);
    return inv.email;
  }
}

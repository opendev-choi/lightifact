import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { SsoSettings } from '../common/types';

const DEFAULT_SSO: SsoSettings = { enabled: false, clientId: '', clientSecret: '', allowedDomain: '' };

@Injectable()
export class SettingsService {
  constructor(private readonly db: DbService) {}

  private read<T>(key: string, fallback: T): T {
    const row = this.db.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown): void {
    this.db.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  get sso(): SsoSettings {
    return { ...DEFAULT_SSO, ...this.read<Partial<SsoSettings>>('sso', {}) };
  }

  ssoConfigured(): boolean {
    const s = this.sso;
    return s.enabled && !!s.clientId && !!s.clientSecret;
  }

  updateSso(patch: Partial<SsoSettings>): void {
    const current = this.sso;
    const next: SsoSettings = {
      enabled: patch.enabled ?? false,
      clientId: (patch.clientId ?? '').trim(),
      // clientSecret 빈 값이면 기존 유지 (마스킹 폼 대응)
      clientSecret: (patch.clientSecret || current.clientSecret || '').trim(),
      allowedDomain: (patch.allowedDomain ?? '').trim(),
    };
    this.write('sso', next);
  }
}

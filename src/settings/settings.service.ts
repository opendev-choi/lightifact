import { Injectable } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { Settings, SsoSettings } from '../common/types';

const SETTINGS_FILE = 'settings.json';
const DEFAULTS: Settings = {
  sso: { enabled: false, clientId: '', clientSecret: '', allowedDomain: '' },
};

@Injectable()
export class SettingsService {
  private settings: Settings;

  constructor(private readonly store: StoreService) {
    this.settings = this.store.readJson<Settings>(SETTINGS_FILE, DEFAULTS);
    this.settings.sso = { ...DEFAULTS.sso, ...this.settings.sso };
  }

  get sso(): SsoSettings {
    return this.settings.sso;
  }

  ssoConfigured(): boolean {
    const s = this.settings.sso;
    return s.enabled && !!s.clientId && !!s.clientSecret;
  }

  updateSso(patch: Partial<SsoSettings>): void {
    // clientSecret 이 빈 값이면 기존 유지 (마스킹된 폼 대응)
    const next: SsoSettings = {
      enabled: patch.enabled ?? false,
      clientId: (patch.clientId ?? '').trim(),
      clientSecret: (patch.clientSecret || this.settings.sso.clientSecret || '').trim(),
      allowedDomain: (patch.allowedDomain ?? '').trim(),
    };
    this.settings.sso = next;
    this.store.writeJson(SETTINGS_FILE, this.settings);
  }
}

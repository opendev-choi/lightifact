export interface User {
  salt?: string;
  hash?: string;
  admin: boolean;
  apiToken: string;
  sso: boolean;
}

export interface Invite {
  email: string;
  exp: number;
}

export interface SsoSettings {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  allowedDomain: string;
  // 허용 도메인 계정을 SSO 로그인 시 즉시 자동 가입시킬지. off 면 기존/초대 사용자만 로그인 가능.
  autoJoin: boolean;
  // SSO 전용 모드. on 이면 로그인 화면에서 id/pw 폼 제거 + 비밀번호 로그인 차단(SSO 설정된 경우만 적용).
  ssoOnly: boolean;
}

export interface Settings {
  sso: SsoSettings;
}

export interface ArtifactMeta {
  slug: string;
  title: string;
  bytes: number;
  owner: string;
  visibility: 'public' | 'private';
}

// Express Request 에 붙는 인증 컨텍스트
export interface AuthedRequest {
  userEmail?: string;
  user?: User;
  cookies: Record<string, string>;
  headers: Record<string, string | undefined>;
  method: string;
}

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
}

export interface Settings {
  sso: SsoSettings;
}

export interface ArtifactMeta {
  slug: string;
  title: string;
  bytes: number;
  owner: string;
}

// Express Request 에 붙는 인증 컨텍스트
export interface AuthedRequest {
  userEmail?: string;
  user?: User;
  cookies: Record<string, string>;
  headers: Record<string, string | undefined>;
  method: string;
}

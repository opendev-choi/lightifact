import { Request } from 'express';

// 요청 Host 기반으로 서비스 base URL 을 도출 (BASE_URL 세팅 불필요).
// ALB/프록시 뒤에서는 X-Forwarded-Proto/Host 를 신뢰(trust proxy).
// BASE_URL env 가 있으면 그걸 우선(명시적 override).
export function requestBaseUrl(req: Request): string {
  const override = process.env.BASE_URL;
  if (override) return override;
  const xfProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0].trim();
  const proto = xfProto || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0].trim() || req.headers.host;
  return host ? `${proto}://${host}` : 'http://localhost:4321';
}

export function isSecure(req: Request): boolean {
  return requestBaseUrl(req).startsWith('https://');
}

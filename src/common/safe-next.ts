// 로그인 후 복귀 경로 검증 — 오픈 리다이렉트 방지 (사이트 내부 경로만 허용).
export function safeNext(next?: string): string {
  if (!next) return '/';
  // 반드시 '/' 로 시작하는 상대경로 + '//'(프로토콜 상대) 금지
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

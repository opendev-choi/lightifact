// artifact 원본(/raw)을 격리 오리진에서 서빙하기 위한 설정.
// LIGHTIFACT_CONTENT_ORIGIN 미설정 → same-origin(현행). 설정 시:
//   - 뷰어 iframe/새탭이 그 오리진의 /raw 를 가리킴
//   - /raw 는 그 오리진(호스트)에서만 서빙, 메인 오리진에선 404
//   - 격리 오리진엔 세션 쿠키가 없으므로 /raw 접근은 추측불가 slug(capability)로 게이트
export function contentOrigin(): string | undefined {
  const v = process.env.LIGHTIFACT_CONTENT_ORIGIN;
  return v && v.trim() ? v.trim().replace(/\/+$/, '') : undefined;
}

export function contentHost(): string | undefined {
  const o = contentOrigin();
  if (!o) return undefined;
  try {
    return new URL(o).host;
  } catch {
    return undefined;
  }
}

// 요청이 격리(content) 호스트로 들어왔는지
export function isContentHost(reqHost: string | undefined): boolean {
  const ch = contentHost();
  return !!ch && !!reqHost && reqHost.split(',')[0].trim() === ch;
}

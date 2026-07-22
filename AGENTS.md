# AGENTS.md — lightifact (사내 artifact 공유)

이 지침은 Codex·Antigravity 등 `AGENTS.md`를 읽는 에이전트용이다.
(Claude Code는 `.claude/skills/lightifact` 스킬을 대신 사용)

## 언제
사용자가 "아티팩트로 만들어서 공유해줘", "이거 공유해줘", "share this", "공유 링크 뽑아줘"처럼
방금 만든 HTML/페이지를 남과 공유(또는 기존 것 수정)할 링크를 원할 때.

## 어떻게
1. **self-contained HTML**을 만든다 — 외부 CDN/스크립트/폰트 없이 CSS·JS는 inline, 이미지는 data URI.
   (lightifact는 strict CSP + sandbox iframe으로 렌더하므로 외부 리소스는 차단된다.)
2. 업로드 — 환경변수 `LIGHTIFACT_TOKEN`(사용자가 `__LIGHTIFACT_URL__/account`에서 발급) 사용, 사내망/VPN 필요:
   ```bash
   curl -s -X POST __LIGHTIFACT_URL__/artifacts \
     -H "Authorization: Bearer $LIGHTIFACT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"title":"<제목>","html":"<HTML 전체 문자열>"}'
   ```
   응답 JSON의 `url`이 공유 링크다. 그 URL을 사용자에게 전달한다.
3. **기존 것 수정**(같은 링크 유지, 본인 소유만): 위와 동일하되
   `PUT __LIGHTIFACT_URL__/artifacts/<slug>`.

## 주의
- 토큰 없으면 401. `export LIGHTIFACT_TOKEN=lf_...` 필요.
- self-contained가 아니면 리소스가 CSP로 차단되어 깨진다.
- 읽기·쓰기 모두 로그인 필요(사내 서비스). 외부 노출 금지.

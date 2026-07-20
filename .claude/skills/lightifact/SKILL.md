---
name: lightifact
description: 생성한 HTML artifact를 로컬 lightifact 서비스에 올려 공유 링크를 발급한다. 사용자가 "이거 공유해줘", "artifact 링크 만들어줘", "share this", "공유 링크 뽑아줘" 처럼 방금 만든 HTML/페이지를 남과 공유할 링크를 원할 때 사용한다.
---

# Artifact Share

HTML 한 덩어리를 `lightifact` 서비스에 업로드하고 공유 URL을 돌려준다.
DB·인증 없는 초경량 서비스이므로, 링크를 아는 사람은 누구나 브라우저에서 열람할 수 있다.

## 전제
- 서비스 위치: `/Users/jonghyeokchoi/orca/projects/lightifact`
- 기본 주소: `http://localhost:4321` (환경변수 `BASE_URL`로 변경 가능)

## 절차

### 1. 서버가 떠 있는지 확인하고, 없으면 백그라운드로 기동
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/ || \
  (cd /Users/jonghyeokchoi/orca/projects/lightifact && node server.mjs &)
```
방금 기동했다면 1초 정도 기다린 뒤 다음 단계로 넘어간다.

### 2. 공유할 HTML을 파일로 저장
공유 대상 HTML을 임시 파일(예: 스크래치패드)에 쓴다. self-contained HTML이어야 한다
(외부 CDN/스크립트/폰트는 CSP로 차단되므로 CSS/JS는 inline, 이미지는 data URI로 넣을 것).

### 3. 업로드 → 공유 URL 발급
번들된 헬퍼를 쓴다:
```bash
node /Users/jonghyeokchoi/orca/projects/lightifact/.claude/skills/lightifact/share.mjs <html파일경로> "제목"
```
헬퍼는 `{ "slug": "...", "url": "http://localhost:4321/a/..." }` 를 출력한다.

curl로 직접 올려도 된다:
```bash
curl -s -X POST "http://localhost:4321/artifacts?title=제목" \
  -H "Content-Type: text/html" --data-binary @<html파일경로>
```

### 4. 결과 전달
발급된 `url`을 사용자에게 그대로 전달한다. 뷰어(`/a/:slug`)는 artifact를 sandboxed iframe으로
안전하게 렌더링하며, `/raw/:slug`는 원본을 새 탭에서 연다.

## 주의
- 인증이 없으므로 민감한 내용은 올리지 말 것. 사내 공유가 목적이면 서비스를 사내망/별도 서브도메인에 배포.
- 삭제 기능은 없다. 지우려면 `lightifact/data/<slug>.html` 과 `<slug>.json` 을 직접 제거.

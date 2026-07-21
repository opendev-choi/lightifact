---
name: lightifact
description: 생성한 HTML artifact를 사내 lightifact 서비스에 올려 공유 링크를 발급한다. 사용자가 "이거 공유해줘", "artifact 링크 만들어줘", "아티팩트로 만들어서 공유해줘", "share this", "공유 링크 뽑아줘" 처럼 방금 만든 HTML/페이지를 남과 공유(또는 기존 것 수정)할 링크를 원할 때 사용한다.
allowed-tools: Write, Bash(node *), Bash(curl *)
---

# lightifact

HTML 한 덩어리를 사내 `lightifact` 서비스에 업로드하고 공유 URL을 돌려준다.
링크를 아는 사람은 사내망/VPN에서 브라우저로 열람할 수 있다.

## 전제
- 배포 주소: `https://lightifact.cardoc.kr` (사내망/VPN only, 읽기·쓰기 전부 로그인 필요)
- 업로드 인증: 환경변수 `LIGHTIFACT_TOKEN` = 본인 **API 토큰**(웹 `/settings` 에서 확인).
  share.mjs 가 Bearer 헤더로 자동 전송. 미설정이면 401 → 토큰을 export 할 것.
- 로컬 테스트 시: `LIGHTIFACT_URL=http://localhost:4321`
- 이 스킬은 `~/.claude/skills/lightifact/` 에 설치되어 있다 (share.mjs 동봉).

## 절차

### 1. 공유할 HTML을 파일로 저장
공유 대상 HTML을 임시 파일(예: 스크래치패드)에 쓴다. **self-contained HTML**이어야 한다
(외부 CDN/스크립트/폰트는 CSP로 차단되므로 CSS/JS는 inline, 이미지는 data URI로 넣을 것).

### 2. 업로드 → 공유 URL 발급
동봉된 헬퍼를 쓴다 (`<skill-dir>` 은 이 스킬의 base 디렉터리):
```bash
node <skill-dir>/share.mjs <html파일경로> "제목"
```
헬퍼는 `{ "slug": "...", "url": "https://lightifact.cardoc.kr/a/..." }` 를 출력한다.

**기존 artifact 수정(덮어쓰기, 같은 링크 유지)** — 사용자가 "이거 고쳐서 업데이트해줘" 처럼
이미 공유한 것을 바꾸길 원할 때. 기존 URL의 `slug` 를 넘긴다:
```bash
node <skill-dir>/share.mjs <html파일경로> "제목" --update <slug>
```
(본인 소유 또는 admin 만 가능. 링크는 그대로, 내용만 갱신된다.)

curl로 직접 올려도 된다:
```bash
curl -s -X POST "https://lightifact.cardoc.kr/artifacts?title=제목" \
  -H "Content-Type: text/html" --data-binary @<html파일경로>          # 생성
curl -s -X PUT  "https://lightifact.cardoc.kr/artifacts/<slug>?title=제목" \
  -H "Content-Type: text/html" --data-binary @<html파일경로>          # 수정(덮어쓰기)
```

### 3. 결과 전달
발급된 `url`을 사용자에게 그대로 전달한다. 뷰어(`/a/:slug`)는 artifact를 sandboxed iframe으로
안전하게 렌더링하며, `/raw/:slug`는 원본을 새 탭에서 연다.

## 주의
- 인증이 없으므로(사내망 격리에만 의존) 민감 정보는 올리지 말 것.
- 삭제는 서버 관리자가 PVC의 `data/<slug>.*` 파일을 제거해야 한다 (UI 삭제 기능 없음).
- 연결 안 되면 VPN/사내망 상태부터 확인.

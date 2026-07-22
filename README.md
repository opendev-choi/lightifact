# 🧩 lightifact

self-contained HTML artifact를 올리면 **sandboxed iframe + strict CSP**로 격리 렌더해 링크로 공유하는 경량 서비스.
**NestJS + TypeScript**, 서버렌더 UI, 저장은 **SQLite 파일 하나**(무DB 서버).

## 실행 (로컬)
```bash
npm install
npm run build && npm start        # 또는: npm run start:dev
# http://localhost:4321 → 첫 접속 시 /setup 에서 관리자 계정 생성 → 로그인
```
주입할 시크릿 없음 — 로그인/세션/SSO 전부 앱 내부(SQLite)에서 관리. 서비스 URL은 요청 호스트에서 자동 도출(원하면 `BASE_URL` 로 override).

## 인증
- **읽기·쓰기 전부 로그인 필요.** email + password (또는 설정 시 Google SSO).
- 최초 실행 시 `/setup` 에서 첫 관리자 생성 → admin 이 `/settings` 에서 사용자 추가·초대·SSO 관리.
- 일반 사용자는 관리 기능 없음. 본인 API 토큰은 `/account` 에서 확인.
- 에이전트 업로드는 사용자별 **API 토큰**(Bearer). 세션=DB 저장 랜덤 토큰(revocable), 비밀번호=scrypt.

## 엔드포인트
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/artifacts` | HTML 업로드(raw 또는 `{title,html}` JSON) → slug/URL |
| PUT | `/artifacts/:slug` | 수정(본인/admin, 링크 유지) |
| GET | `/a/:slug` | sandboxed iframe 뷰어 |
| GET | `/raw/:slug` | strict CSP 원본 (iframe 전용) |
| GET | `/` | 목록(페이지네이션·필터) + 온보딩 |
| GET | `/install/*` | 에이전트용 스킬/룰 설치 파일 서빙 |
| GET | `/healthz` | health check |

## 구조 (NestJS 모듈)
`auth`(로그인/셋업/초대·세션·scrypt) · `users` · `settings`(SSO) · `sso`(Google OAuth) ·
`artifacts`(업로드/뷰어/수정/삭제/CSP) · `db`(SQLite) · `views`(서버렌더) · `install`(에이전트 설치 파일 서빙).

## 저장 / 격리
- 저장: **SQLite** `data/lightifact.db` (사용자·세션·초대·설정·artifact).
- 격리: artifact는 `sandbox` iframe + strict CSP → 외부 네트워크 요청 전부 차단(Claude Artifacts와 같은 철학). self-contained HTML만 정상 동작.

## 에이전트 연동
로그인 후 메인 화면의 온보딩에서 쓰는 에이전트(Claude Code / Codex / Antigravity)를 고르면 설치 프롬프트를 제공한다.
Claude Code는 `.claude/skills/lightifact` 스킬, 그 외는 `AGENTS.md` 규칙을 사용.

> 배포/운영 문서는 내부 인프라 저장소에서 관리한다.

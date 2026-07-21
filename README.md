# 🧩 lightifact

HTML artifact를 올리고 **sandboxed iframe**으로 공유하는 경량 서비스.
**NestJS + TypeScript**, 서버렌더 UI, 저장은 파일시스템(무DB).

## 실행 (로컬)
```bash
npm install
npm run build && SESSION_SECRET=dev-secret-key npm start   # 또는: npm run start:dev
# http://localhost:4321 → 첫 접속 시 /setup 에서 관리자 계정 생성 → 로그인
```

## 인증
- **읽기·쓰기 전부 로그인 필요.** email+password (또는 설정 시 Google SSO).
- **최초 실행 시 `/setup` 화면**에서 첫 관리자 생성. 이후 admin 이 `/settings` 에서 사용자 추가·초대·SSO 관리.
- 일반 사용자는 관리 기능 없음. 본인 API 토큰은 `/account` 에서 확인.
- 에이전트 업로드는 사용자별 **API 토큰**(Bearer).
- 세션=서명 쿠키(HMAC, 무상태), 비밀번호=scrypt. 저장은 `users.json`/`settings.json`/`invites.json`(PVC).

## 구조 (NestJS 모듈)
`auth`(로그인/셋업/초대·세션·scrypt) · `users`(사용자/초대) · `settings`(SSO 설정) ·
`sso`(Google OAuth) · `artifacts`(업로드/뷰어/CSP) · `store`(JSON 파일 저장) · `views`(서버렌더).
config는 `@nestjs/config` + Joi 검증(`SESSION_SECRET` 등).

## 사용
- 웹: 로그인 → HTML 붙여넣고 "공유 링크 생성"
- API(업로드):
  ```bash
  curl -X POST "http://localhost:4321/artifacts?title=제목" \
    -H "Authorization: Bearer <API토큰>" \
    -H "Content-Type: text/html" --data-binary @page.html
  # → { "slug": "...", "url": ".../a/...", "owner": "..." }
  ```

## 엔드포인트
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/artifacts` | HTML 업로드(raw 또는 `{title,html}` JSON) → slug/URL |
| GET | `/a/:slug` | sandboxed iframe 뷰어 |
| GET | `/raw/:slug` | strict CSP 걸린 원본 (iframe src 전용) |
| GET | `/` | 목록 + 업로드 폼 |
| GET | `/healthz` | k8s probe (200 `ok`) |

## 팀 배포 (사내 EKS)
ArgoCD + Helm chart로 `https://lightifact.cardoc.kr` (VPN/사내망) 에 배포한다.
Helm chart는 `internal-gitops/internal-tools/lightifact/` 에 준비됨.
전체 절차(ECR 빌드/푸시 → gitops 머지 → 확인)는 **[DEPLOY.md](./DEPLOY.md)** 참고.

## 스킬 설치 (팀원 각자 1회)
```bash
bash .claude/skills/lightifact/install.sh   # → ~/.claude/skills/lightifact/
```
설치 후 어느 프로젝트에서든 "이거 공유해줘" / `/lightifact` 로 사용. 기본 대상은 배포 URL,
로컬은 `export LIGHTIFACT_URL=http://localhost:4321`.

## 저장 / 격리
- 저장: `data/<slug>.html` + `<slug>.json` (파일시스템, DB 없음)
- 격리: artifact는 `sandbox` iframe + strict CSP로 렌더 → 외부 네트워크 요청 전부 차단
  (Claude Artifacts와 동일한 철학). self-contained HTML만 정상 동작.

## 알아둘 것
- 읽기·쓰기 전부 로그인 필요(세션). 그래도 사내망 유지 권장, 외부 노출 금지.
- 완전한 origin 격리를 원하면 `/raw`를 **별도 서브도메인**으로 서빙할 것.
- Claude Code 스킬: `.claude/skills/lightifact` (`/lightifact`로 호출)

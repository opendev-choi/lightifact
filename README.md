# 🧩 lightifact

DB·인증 없이 HTML artifact를 올리고 **sandboxed iframe**으로 공유하는 초경량 서비스.
의존성 0개 (Node 내장 모듈만 사용).

## 실행
```bash
node server.mjs          # http://localhost:4321
PORT=8080 node server.mjs # 포트 변경
BASE_URL=https://artifacts.example.com node server.mjs # 공개 URL 지정
```

## 사용
- 웹: `http://localhost:4321` 접속 → HTML 붙여넣고 "공유 링크 생성"
- API:
  ```bash
  curl -X POST "http://localhost:4321/artifacts?title=제목" \
    -H "Content-Type: text/html" --data-binary @page.html
  # → { "slug": "...", "url": "http://localhost:4321/a/..." }
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
ArgoCD + Kustomize로 `https://lightifact.cardoc.kr` (VPN/사내망) 에 배포한다.
gitops 매니페스트는 `internal-gitops/internal-tools/lightifact/` 에 준비됨.
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
- 인증 없음 → 링크 아는 사람은 누구나 열람. 민감 정보 금지.
- 완전한 origin 격리를 원하면 `/raw`를 **별도 서브도메인**으로 서빙할 것.
- Claude Code 스킬: `.claude/skills/lightifact` (`/lightifact`로 호출)

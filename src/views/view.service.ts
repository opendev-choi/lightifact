import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ArtifactMeta, Invite, User } from '../common/types';
import { SsoSettings } from '../common/types';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

type Mode = 'login' | 'viewer' | 'app';

@Injectable()
export class ViewService {
  private readonly baseUrl: string;
  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('BASE_URL', 'http://localhost:4321');
  }

  // ── 레이아웃 ──
  layout(title: string, body: string, mode: Mode = 'app'): string {
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>${BASE_CSS}${MODE_CSS[mode] ?? ''}</style></head><body>${body}</body></html>`;
  }

  // ── 로그인 / 셋업 / 초대 ──
  login(ssoOn: boolean): string {
    const body = `<div class="card"><h1>🧩 lightifact</h1>
      <form id="lf"><input name="email" type="email" placeholder="이메일" required autofocus>
      <input name="password" type="password" placeholder="비밀번호" required><button>로그인</button>
      <div class="err" id="err"></div></form>
      ${ssoOn ? '<div class="or">또는</div><a class="ghost" href="/oauth2/start">Google로 로그인</a>' : ''}</div>
      ${submitScript('lf', '/api/login', '/')}`;
    return this.layout('로그인', body, 'login');
  }

  setup(): string {
    const body = `<div class="card"><h1>🧩 lightifact 시작 설정</h1>
      <p class="hint">첫 관리자 계정을 만드세요.</p>
      <form id="lf"><input name="email" type="email" placeholder="관리자 이메일" required autofocus>
      <input name="password" type="password" placeholder="비밀번호 (8자 이상)" minlength="8" required>
      <button>관리자 생성</button><div class="err" id="err"></div></form>
      ${submitScript('lf', '/api/setup', '/settings')}`;
    return this.layout('시작 설정', body, 'login');
  }

  invite(token: string, email: string): string {
    const body = `<div class="card"><h1>🧩 lightifact 가입</h1><p class="hint">${esc(email)}</p>
      <form id="lf"><input type="hidden" name="token" value="${esc(token)}">
      <input name="password" type="password" placeholder="비밀번호 설정 (8자 이상)" minlength="8" required autofocus>
      <button>가입 완료</button><div class="err" id="err"></div></form>
      ${submitScript('lf', '/api/invite/accept', '/')}`;
    return this.layout('가입', body, 'login');
  }

  message(title: string, heading: string, text: string): string {
    return this.layout(title, `<div class="card"><h1>${esc(heading)}</h1><p class="hint">${esc(text)}</p></div>`, 'login');
  }

  // ── 앱 화면 ──
  private bar(me: string, admin: boolean): string {
    return `<header class="bar"><b>🧩 lightifact</b><span class="sp"></span>
      <span class="who">${esc(me)}</span><a href="/account">내 계정</a>${admin ? '<a href="/settings">설정</a>' : ''}<a href="/logout">로그아웃</a></header>`;
  }

  index(me: string, admin: boolean, items: ArtifactMeta[]): string {
    const list = items.length
      ? items.map((m) => `<li><a href="/a/${esc(m.slug)}">${esc(m.title)}</a> <code>${esc(m.slug.slice(0, 8))}</code> <span class="who">${esc(m.owner)}</span></li>`).join('')
      : '<li class="empty">아직 artifact가 없습니다.</li>';
    const body = `${this.bar(me, admin)}<div class="wrap">
      <form id="up"><input name="title" placeholder="제목 (선택)">
      <textarea name="html" placeholder="self-contained HTML 붙여넣기..." required></textarea>
      <button>공유 링크 생성</button></form><div id="result"></div>
      <h2>목록</h2><ul class="list">${list}</ul></div>
      <script>document.getElementById('up').addEventListener('submit',async(e)=>{e.preventDefault();const f=e.target;
      const r=await fetch('/artifacts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:f.title.value,html:f.html.value})});
      const j=await r.json();document.getElementById('result').innerHTML=j.url?('생성됨: <a href="'+j.url+'">'+j.url+'</a>'):('에러: '+(j.error||''));
      if(j.url)setTimeout(()=>location.reload(),800);});</script>`;
    return this.layout('lightifact', body, 'app');
  }

  viewer(meta: ArtifactMeta): string {
    const body = `<header><a href="/" class="back">← 목록</a><span class="title">${esc(meta.title)}</span>
      <span class="who">${esc(meta.owner)}</span><a href="/raw/${esc(meta.slug)}" target="_blank">새 탭 ↗</a></header>
      <iframe src="/raw/${esc(meta.slug)}" sandbox="allow-scripts allow-popups allow-forms" title="${esc(meta.title)}"></iframe>`;
    return this.layout(meta.title, body, 'viewer');
  }

  account(me: string, user: User): string {
    const body = `${this.bar(me, user.admin)}<div class="wrap"><h2>내 계정</h2>
      <p>이메일: <b>${esc(me)}</b>${user.admin ? ' · <span class="tag">admin</span>' : ''}</p>
      <h3>API 토큰 (에이전트 업로드용)</h3><p><code class="tok">${esc(user.apiToken)}</code></p>
      <form method="post" action="/api/account/token" onsubmit="return confirm('재발급하면 기존 토큰이 무효화됩니다.')"><button>토큰 재발급</button></form>
      <p class="hint">스킬에서 <code>export LIGHTIFACT_TOKEN=&lt;위 토큰&gt;</code> 로 사용.</p></div>`;
    return this.layout('내 계정', body, 'app');
  }

  settings(me: string, users: Array<{ email: string } & User>, invites: Array<{ token: string } & Invite>, sso: SsoSettings): string {
    const userRows = users.map((u) => `<tr><td>${esc(u.email)}</td><td>${u.admin ? '✔' : ''}</td><td>${u.sso ? 'SSO' : 'pw'}</td>
      <td><form method="post" action="/api/users/delete" onsubmit="return confirm('삭제?')"><input type="hidden" name="email" value="${esc(u.email)}"><button ${u.email === me ? 'disabled' : ''}>삭제</button></form></td></tr>`).join('');
    const inviteRows = invites.length
      ? invites.map((i) => `<tr><td>${esc(i.email)}</td><td><code>${esc(this.baseUrl)}/invite/${esc(i.token)}</code></td>
        <td><form method="post" action="/api/invite/revoke"><input type="hidden" name="token" value="${esc(i.token)}"><button>취소</button></form></td></tr>`).join('')
      : '<tr><td colspan="3" class="empty">대기 중인 초대 없음</td></tr>';
    const body = `<header class="bar"><a href="/">← lightifact</a><span class="sp"></span><a href="/account">내 계정</a><span class="who">${esc(me)}</span><a href="/logout">로그아웃</a></header>
      <div class="wrap"><h2>사용자</h2>
      <table><tr><th>이메일</th><th>admin</th><th>방식</th><th></th></tr>${userRows}</table>
      <h3>초대 (링크 발급 → 본인이 비밀번호 설정, 일반 계정)</h3>
      <form method="post" action="/api/invite" class="row"><input name="email" type="email" placeholder="초대할 이메일" required><button>초대 링크 생성</button></form>
      <table><tr><th>초대 이메일</th><th>링크 (전달)</th><th></th></tr>${inviteRows}</table>
      <h3>직접 추가 (비밀번호 지정)</h3>
      <form method="post" action="/api/users" class="row"><input name="email" type="email" placeholder="email" required>
      <input name="password" type="password" placeholder="password" required><label><input type="checkbox" name="admin"> admin</label><button>추가</button></form>
      <h2>SSO (Google)</h2>
      <form method="post" action="/api/settings/sso">
      <label><input type="checkbox" name="enabled" ${sso.enabled ? 'checked' : ''}> SSO 활성화 (로그인 화면에 Google 버튼)</label>
      <input name="clientId" placeholder="Google Client ID" value="${esc(sso.clientId)}">
      <input name="clientSecret" type="password" placeholder="Google Client Secret ${sso.clientSecret ? '(설정됨 — 변경 시 입력)' : ''}">
      <input name="allowedDomain" placeholder="허용 도메인 (예: cardoc.kr, 비우면 전체)" value="${esc(sso.allowedDomain)}">
      <button>저장</button></form>
      <p class="hint">리디렉션 URI: <code>${esc(this.baseUrl)}/oauth2/callback</code> 를 Google 콘솔에 등록하세요.</p></div>`;
    return this.layout('설정', body, 'app');
  }
}

function submitScript(formId: string, action: string, onOk: string): string {
  return `<script>document.getElementById('${formId}').addEventListener('submit',async(e)=>{e.preventDefault();const f=e.target;const b={};new FormData(f).forEach((v,k)=>b[k]=v);
    const r=await fetch('${action}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
    if(r.ok)location.href='${onOk}';else{const j=await r.json().catch(()=>({}));document.getElementById('err').textContent=(j.message||j.error||'실패');}});</script>`;
}

const BASE_CSS = `:root{color-scheme:light dark}*{box-sizing:border-box}
body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,system-ui,sans-serif}
a{color:#4571ff} code{font-size:12px;color:#888} .who{color:#888;font-size:12px} .empty{color:#888} .hint{color:#888;font-size:12px}
.tag{font-size:11px;padding:1px 8px;border-radius:999px;background:#4571ff22;color:#4571ff}`;

const MODE_CSS: Record<Mode, string> = {
  login: `body{display:grid;place-items:center;min-height:100vh}.card{width:300px;text-align:center}
    .card h1{font-size:22px}form{display:flex;flex-direction:column;gap:8px}
    input{padding:10px;border:1px solid #8886;border-radius:8px;background:transparent;color:inherit;font:inherit}
    button{padding:10px;border:0;border-radius:8px;background:#4571ff;color:#fff;font-weight:600;cursor:pointer}
    .or{color:#888;margin:14px 0;font-size:13px}.ghost{display:block;padding:10px;border:1px solid #8886;border-radius:8px;text-decoration:none;color:inherit}
    .err{color:#e5484d;font-size:13px;min-height:16px}`,
  viewer: `body{display:flex;flex-direction:column;height:100vh}
    header{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid #8883}
    header .title{font-weight:600;flex:1}header a{color:#4571ff;text-decoration:none;font-size:13px}iframe{flex:1;border:0}`,
  app: `.bar{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid #8883}
    .bar .sp{flex:1}.bar a{color:#4571ff;text-decoration:none;font-size:13px}
    .wrap{max-width:820px;margin:0 auto;padding:24px 20px}h2{font-size:16px;margin-top:28px}h3{font-size:14px;margin-top:20px}
    form{display:flex;flex-direction:column;gap:8px}.row{flex-direction:row;flex-wrap:wrap;align-items:center}
    input,textarea{padding:9px;border:1px solid #8886;border-radius:8px;background:transparent;color:inherit;font:inherit}
    textarea{min-height:150px;font-family:ui-monospace,monospace}
    button{padding:9px 14px;border:0;border-radius:8px;background:#4571ff;color:#fff;font-weight:600;cursor:pointer}
    table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #8882}
    .list{list-style:none;padding:0}.list li{padding:8px 0;border-bottom:1px solid #8882}
    #result{margin:10px 0;font-size:14px}.tok{font-size:13px;word-break:break-all}`,
};

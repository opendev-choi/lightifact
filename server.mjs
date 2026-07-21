import { createServer } from 'node:http';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const PORT = Number(process.env.PORT || 4321);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const SECURE = BASE_URL.startsWith('https://');

// 세션 서명 키. 프로덕션에선 env(SESSION_SECRET) 필수. 미설정 시 개발용 고정키.
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-insecure-session-secret';
const SESSION_TTL = 1000 * 60 * 60 * 12; // 12h

const USERS_FILE = join(DATA_DIR, 'users.json');
const SETTINGS_FILE = join(DATA_DIR, 'settings.json');

if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });

// ── 저장소 (무DB: PVC의 JSON) ─────────────────────────────────
function loadJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}
const saveJson = (file, obj) => writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');

const INVITES_FILE = join(DATA_DIR, 'invites.json');
let users = loadJson(USERS_FILE, {});       // email → { salt, hash, admin, apiToken, sso }
let invites = loadJson(INVITES_FILE, {});   // token → { email, exp }
let settings = loadJson(SETTINGS_FILE, {
  sso: { enabled: false, clientId: '', clientSecret: '', allowedDomain: '' },
});

const hasUsers = () => Object.keys(users).length > 0;
const INVITE_TTL = 1000 * 60 * 60 * 72; // 72h

// ── 비밀번호 (scrypt, 내장) ───────────────────────────────────
function hashPassword(pw, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(pw, salt, 64).toString('hex') };
}
function verifyPassword(pw, user) {
  if (!user?.hash) return false;
  const h = scryptSync(pw, user.salt, 64).toString('hex');
  const a = Buffer.from(h), b = Buffer.from(user.hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
function upsertUser(email, pw, opts = {}) {
  const existing = users[email] || {};
  users[email] = {
    ...existing,
    ...(pw ? hashPassword(pw) : {}),
    admin: opts.admin ?? existing.admin ?? false,
    apiToken: existing.apiToken || ('lf_' + randomBytes(24).toString('hex')),
    sso: opts.sso ?? existing.sso ?? false,
  };
  saveJson(USERS_FILE, users);
  return users[email];
}

// ── 세션 (서명 쿠키, 무상태) ──────────────────────────────────
const b64u = (s) => Buffer.from(s).toString('base64url');
const unb64u = (s) => Buffer.from(s, 'base64url').toString('utf8');
function signSession(email) {
  const payload = b64u(JSON.stringify({ email, exp: Date.now() + SESSION_TTL }));
  const sig = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifySession(cookie) {
  if (!cookie) return null;
  const [payload, sig] = cookie.split('.');
  if (!payload || !sig) return null;
  const expect = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { email, exp } = JSON.parse(unb64u(payload));
    if (Date.now() > exp || !users[email]) return null;
    return email;
  } catch { return null; }
}
function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => {
    const i = c.indexOf('='); return i < 0 ? ['', ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
  }).filter(([k]) => k));
}
function sessionUser(req) { return verifySession(parseCookies(req).lf_session); }
// 쓰기 인증: 세션(브라우저) 또는 Bearer apiToken(에이전트)
function writeUser(req) {
  const s = sessionUser(req);
  if (s) return s;
  const m = /^Bearer\s+(.+)$/.exec(req.headers.authorization || '');
  if (m) return Object.keys(users).find((e) => users[e].apiToken === m[1]) || null;
  return null;
}
function setSessionCookie(res, email) {
  res.setHeader('Set-Cookie',
    `lf_session=${signSession(email)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}${SECURE ? '; Secure' : ''}`);
}

// ── artifact HTML CSP (외부 네트워크 차단) ────────────────────
const RAW_CSP = [
  "default-src 'none'", "script-src 'unsafe-inline' 'unsafe-eval'", "style-src 'unsafe-inline'",
  "img-src data: blob:", "font-src data:", "media-src data: blob:", "connect-src 'none'", "frame-ancestors 'self'",
].join('; ');

const slugPath = (slug) => join(DATA_DIR, `${slug}.html`);
const metaPath = (slug) => join(DATA_DIR, `${slug}.json`);
const isValidSlug = (s) => /^[a-zA-Z0-9-]{6,64}$/.test(s);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const json = (res, status, obj, headers = {}) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json', ...headers });
const redirect = (res, loc) => send(res, 302, '', { Location: loc });

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readForm(req) {
  const raw = await readBody(req);
  const ctype = req.headers['content-type'] || '';
  if (ctype.includes('application/json')) { try { return JSON.parse(raw); } catch { return {}; } }
  return Object.fromEntries(new URLSearchParams(raw));
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── 인증 라우트 ───────────────────────────────────────────────
async function apiLogin(req, res) {
  const { email = '', password = '' } = await readForm(req);
  const e = email.toLowerCase().trim();
  if (!verifyPassword(password, users[e])) return json(res, 401, { error: '이메일 또는 비밀번호가 올바르지 않습니다' });
  setSessionCookie(res, e);
  json(res, 200, { ok: true, email: e });
}
function logout(req, res) {
  res.setHeader('Set-Cookie', `lf_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE ? '; Secure' : ''}`);
  redirect(res, '/login');
}

// ── 최초 실행: admin 셋업 ─────────────────────────────────────
function serveSetup(req, res) {
  if (hasUsers()) return redirect(res, '/login');
  const body = `<div class="login"><h1>🧩 lightifact 시작 설정</h1>
    <p class="hint">첫 관리자 계정을 만드세요.</p>
    <form id="lf"><input name="email" type="email" placeholder="관리자 이메일" required autofocus>
    <input name="password" type="password" placeholder="비밀번호 (8자 이상)" minlength="8" required>
    <button>관리자 생성</button><div id="err"></div></form></div>
    <script>document.getElementById('lf').addEventListener('submit',async(e)=>{e.preventDefault();const f=e.target;
    const r=await fetch('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.email.value,password:f.password.value})});
    if(r.ok)location.href='/settings';else{const j=await r.json();document.getElementById('err').textContent=j.error||'실패';}});</script>`;
  send(res, 200, page('시작 설정', body, 'login'), { 'Content-Type': 'text/html; charset=utf-8' });
}
async function apiSetup(req, res) {
  if (hasUsers()) return json(res, 403, { error: '이미 초기화됨' });
  const { email = '', password = '' } = await readForm(req);
  const e = email.toLowerCase().trim();
  if (!e || password.length < 8) return json(res, 400, { error: '이메일/8자 이상 비밀번호 필요' });
  upsertUser(e, password, { admin: true });
  setSessionCookie(res, e);
  json(res, 200, { ok: true });
}

// ── 초대 (admin 이 발급 → 초대받은 사람이 비번 설정) ──────────
function pruneInvites() {
  let changed = false;
  for (const [t, v] of Object.entries(invites)) if (Date.now() > v.exp) { delete invites[t]; changed = true; }
  if (changed) saveJson(INVITES_FILE, invites);
}
async function apiInvite(req, res, me) {
  if (!users[me].admin) return json(res, 403, { error: 'admin only' });
  const { email = '' } = await readForm(req);
  const e = email.toLowerCase().trim();
  if (!e) return json(res, 400, { error: 'email 필요' });
  const token = randomBytes(24).toString('hex');
  invites[token] = { email: e, exp: Date.now() + INVITE_TTL };
  saveJson(INVITES_FILE, invites);
  redirect(res, '/settings');
}
async function apiRevokeInvite(req, res, me) {
  if (!users[me].admin) return json(res, 403, { error: 'admin only' });
  const { token = '' } = await readForm(req);
  delete invites[token]; saveJson(INVITES_FILE, invites);
  redirect(res, '/settings');
}
function serveInvite(req, res, token) {
  pruneInvites();
  const inv = invites[token];
  if (!inv) return send(res, 404, page('초대 만료', '<div class="login"><h1>초대가 유효하지 않습니다</h1><p>만료되었거나 이미 사용됨.</p></div>', 'login'));
  const body = `<div class="login"><h1>🧩 lightifact 가입</h1>
    <p class="hint">${esc(inv.email)}</p>
    <form id="lf"><input type="hidden" name="token" value="${esc(token)}">
    <input name="password" type="password" placeholder="비밀번호 설정 (8자 이상)" minlength="8" required autofocus>
    <button>가입 완료</button><div id="err"></div></form></div>
    <script>document.getElementById('lf').addEventListener('submit',async(e)=>{e.preventDefault();const f=e.target;
    const r=await fetch('/api/invite/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:f.token.value,password:f.password.value})});
    if(r.ok)location.href='/';else{const j=await r.json();document.getElementById('err').textContent=j.error||'실패';}});</script>`;
  send(res, 200, page('가입', body, 'login'), { 'Content-Type': 'text/html; charset=utf-8' });
}
async function apiInviteAccept(req, res) {
  pruneInvites();
  const { token = '', password = '' } = await readForm(req);
  const inv = invites[token];
  if (!inv) return json(res, 400, { error: '초대가 유효하지 않습니다' });
  if (password.length < 8) return json(res, 400, { error: '비밀번호 8자 이상' });
  upsertUser(inv.email, password, { admin: false });
  delete invites[token]; saveJson(INVITES_FILE, invites);
  setSessionCookie(res, inv.email);
  json(res, 200, { ok: true });
}

// ── 내 계정 (모든 사용자: 본인 API 토큰 확인/재발급) ──────────
function serveAccount(req, res, me) {
  const u = users[me];
  const body = `<header class="bar"><a href="/">← lightifact</a><span class="sp"></span>
    <span class="who">${esc(me)}${u.admin ? ' · admin' : ''}</span><a href="/logout">로그아웃</a></header>
    <div class="wrap"><h2>내 계정</h2>
    <p>이메일: <b>${esc(me)}</b></p>
    <h3>API 토큰 (에이전트 업로드용)</h3>
    <p><code>${esc(u.apiToken)}</code></p>
    <form method="post" action="/api/account/token" onsubmit="return confirm('토큰을 재발급하면 기존 토큰은 무효화됩니다.')"><button>토큰 재발급</button></form>
    <p class="hint">스킬에서 <code>export LIGHTIFACT_TOKEN=&lt;위 토큰&gt;</code> 로 사용.</p>
    </div>`;
  send(res, 200, page('내 계정', body, 'app'), { 'Content-Type': 'text/html; charset=utf-8' });
}
function apiRegenToken(req, res, me) {
  users[me].apiToken = 'lf_' + randomBytes(24).toString('hex');
  saveJson(USERS_FILE, users);
  redirect(res, '/account');
}

// ── SSO (Google OAuth code flow + userinfo) ───────────────────
function ssoConfigured() { const s = settings.sso; return s.enabled && s.clientId && s.clientSecret; }
function ssoStart(req, res) {
  if (!ssoConfigured()) return redirect(res, '/login');
  const state = signSession('sso-state');
  const p = new URLSearchParams({
    client_id: settings.sso.clientId, redirect_uri: `${BASE_URL}/oauth2/callback`,
    response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account',
  });
  redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}
async function ssoCallback(req, res, url) {
  if (!ssoConfigured()) return redirect(res, '/login');
  const code = url.searchParams.get('code');
  if (!code || verifySession(url.searchParams.get('state')) !== 'sso-state') return send(res, 400, 'invalid oauth state');
  try {
    const tok = await (await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: settings.sso.clientId, client_secret: settings.sso.clientSecret,
        redirect_uri: `${BASE_URL}/oauth2/callback`, grant_type: 'authorization_code',
      }),
    })).json();
    const info = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })).json();
    const email = (info.email || '').toLowerCase();
    const dom = settings.sso.allowedDomain?.trim();
    if (!email || (dom && !email.endsWith(`@${dom}`))) return send(res, 403, page('접근 거부', `<h1>접근 거부</h1><p>${esc(dom)} 도메인 계정만 로그인할 수 있습니다.</p>`));
    if (!users[email]) { upsertUser(email, null, { sso: true }); }  // SSO 사용자 자동 생성(비번 없음)
    setSessionCookie(res, email);
    redirect(res, '/');
  } catch (e) { send(res, 502, `SSO 실패: ${esc(e.message)}`); }
}

// ── 설정(admin) ───────────────────────────────────────────────
async function apiAddUser(req, res, me) {
  if (!users[me].admin) return json(res, 403, { error: 'admin only' });
  const { email = '', password = '', admin } = await readForm(req);
  const e = email.toLowerCase().trim();
  if (!e || !password) return json(res, 400, { error: 'email/password 필요' });
  upsertUser(e, password, { admin: admin === 'on' || admin === true });
  redirect(res, '/settings');
}
async function apiDeleteUser(req, res, me) {
  if (!users[me].admin) return json(res, 403, { error: 'admin only' });
  const { email = '' } = await readForm(req);
  const e = email.toLowerCase().trim();
  if (e === me) return json(res, 400, { error: '자기 자신은 삭제 불가' });
  delete users[e]; saveJson(USERS_FILE, users);
  redirect(res, '/settings');
}
async function apiSaveSso(req, res, me) {
  if (!users[me].admin) return json(res, 403, { error: 'admin only' });
  const f = await readForm(req);
  settings.sso = {
    enabled: f.enabled === 'on' || f.enabled === true,
    clientId: (f.clientId || '').trim(),
    clientSecret: (f.clientSecret || settings.sso.clientSecret || '').trim(),
    allowedDomain: (f.allowedDomain || '').trim(),
  };
  saveJson(SETTINGS_FILE, settings);
  redirect(res, '/settings');
}

// ── artifact 생성/조회 ────────────────────────────────────────
async function createArtifact(req, res, url) {
  const owner = writeUser(req);
  if (!owner) return json(res, 401, { error: 'unauthorized: 로그인 또는 API 토큰 필요' }, { 'WWW-Authenticate': 'Bearer realm="lightifact"' });
  const raw = await readBody(req);
  const ctype = req.headers['content-type'] || '';
  let html, title = url.searchParams.get('title') || '';
  if (ctype.includes('application/json')) {
    try { const j = JSON.parse(raw); html = j.html; title = j.title ?? title; }
    catch { return json(res, 400, { error: 'invalid json' }); }
  } else if (ctype.includes('application/x-www-form-urlencoded')) {
    const f = Object.fromEntries(new URLSearchParams(raw)); html = f.html; title = f.title ?? title;
  } else {
    html = raw; // raw HTML 본문 (curl --data-binary)
  }
  if (!html || !String(html).trim()) return json(res, 400, { error: 'html body is empty' });
  const slug = randomUUID();
  await writeFile(slugPath(slug), html, 'utf8');
  await writeFile(metaPath(slug), JSON.stringify({ slug, title: title || 'Untitled artifact', bytes: Buffer.byteLength(html), owner }), 'utf8');
  json(res, 201, { slug, url: `${BASE_URL}/a/${slug}`, owner });
}
async function serveRaw(req, res, slug) {
  if (!isValidSlug(slug) || !existsSync(slugPath(slug))) return send(res, 404, 'not found');
  send(res, 200, await readFile(slugPath(slug), 'utf8'), { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': RAW_CSP });
}
async function serveViewer(req, res, slug) {
  if (!isValidSlug(slug) || !existsSync(metaPath(slug))) return send(res, 404, page('Not found', '<h1>404</h1>'));
  const meta = JSON.parse(await readFile(metaPath(slug), 'utf8'));
  const body = `<header><a href="/" class="back">← 목록</a><span class="title">${esc(meta.title)}</span>
    <span class="who">${esc(meta.owner || '')}</span><a href="/raw/${slug}" target="_blank" class="open">새 탭 ↗</a></header>
    <iframe src="/raw/${slug}" sandbox="allow-scripts allow-popups allow-forms" title="${esc(meta.title)}"></iframe>`;
  send(res, 200, page(meta.title, body, 'viewer'), { 'Content-Type': 'text/html; charset=utf-8' });
}
async function serveIndex(req, res, me) {
  const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.json') && !['users.json', 'settings.json'].includes(f));
  const items = [];
  for (const f of files) { try { items.push(JSON.parse(await readFile(join(DATA_DIR, f), 'utf8'))); } catch {} }
  const list = items.length
    ? items.map((m) => `<li><a href="/a/${m.slug}">${esc(m.title)}</a> <code>${m.slug.slice(0, 8)}</code> <span class="who">${esc(m.owner || '')}</span></li>`).join('')
    : '<li class="empty">아직 artifact가 없습니다.</li>';
  const admin = users[me]?.admin;
  const body = `<header class="bar"><b>🧩 lightifact</b><span class="sp"></span>
    <span class="who">${esc(me)}</span><a href="/account">내 계정</a>${admin ? '<a href="/settings">설정</a>' : ''}<a href="/logout">로그아웃</a></header>
    <div class="wrap"><form id="up"><input name="title" placeholder="제목 (선택)"/>
    <textarea name="html" placeholder="self-contained HTML 붙여넣기..." required></textarea>
    <button>공유 링크 생성</button></form><div id="result"></div>
    <h2>목록</h2><ul class="list">${list}</ul></div>
    <script>document.getElementById('up').addEventListener('submit',async(e)=>{e.preventDefault();const f=e.target;
    const r=await fetch('/artifacts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:f.title.value,html:f.html.value})});
    const j=await r.json();document.getElementById('result').innerHTML=j.url?('생성됨: <a href="'+j.url+'">'+j.url+'</a>'):('에러: '+(j.error||''));
    if(j.url)setTimeout(()=>location.reload(),800);});</script>`;
  send(res, 200, page('lightifact', body, 'app'), { 'Content-Type': 'text/html; charset=utf-8' });
}
function serveSettings(req, res, me) {
  if (!users[me].admin) return send(res, 403, page('접근 거부', '<div class="wrap"><h1>403</h1><p>관리자만 접근 가능</p></div>', 'app'));
  pruneInvites();
  const rows = Object.entries(users).map(([e, u]) => `<tr><td>${esc(e)}</td>
    <td>${u.admin ? '✔' : ''}</td><td>${u.sso ? 'SSO' : 'pw'}</td>
    <td><form method="post" action="/api/users/delete" onsubmit="return confirm('삭제?')">
    <input type="hidden" name="email" value="${esc(e)}"><button ${e === me ? 'disabled' : ''}>삭제</button></form></td></tr>`).join('');
  const inviteRows = Object.entries(invites).map(([t, v]) => `<tr><td>${esc(v.email)}</td>
    <td><code>${esc(BASE_URL)}/invite/${esc(t)}</code></td>
    <td><form method="post" action="/api/invite/revoke"><input type="hidden" name="token" value="${esc(t)}"><button>취소</button></form></td></tr>`).join('')
    || '<tr><td colspan="3" class="empty">대기 중인 초대 없음</td></tr>';
  const s = settings.sso;
  const body = `<header class="bar"><a href="/">← lightifact</a><span class="sp"></span><a href="/account">내 계정</a><span class="who">${esc(me)}</span><a href="/logout">로그아웃</a></header>
    <div class="wrap"><h2>사용자</h2>
    <table><tr><th>이메일</th><th>admin</th><th>방식</th><th></th></tr>${rows}</table>
    <h3>초대 (링크 발급 → 본인이 비밀번호 설정, 일반 계정)</h3>
    <form method="post" action="/api/invite" class="row">
      <input name="email" type="email" placeholder="초대할 이메일" required><button>초대 링크 생성</button></form>
    <table><tr><th>초대 이메일</th><th>링크 (전달)</th><th></th></tr>${inviteRows}</table>
    <h3>직접 추가 (비밀번호 지정)</h3>
    <form method="post" action="/api/users" class="row">
      <input name="email" type="email" placeholder="email" required><input name="password" type="password" placeholder="password" required>
      <label><input type="checkbox" name="admin"> admin</label><button>추가</button></form>
    <h2>SSO (Google)</h2>
    <form method="post" action="/api/settings/sso">
      <label><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}> SSO 활성화 (로그인 화면에 Google 버튼)</label>
      <input name="clientId" placeholder="Google Client ID" value="${esc(s.clientId)}">
      <input name="clientSecret" type="password" placeholder="Google Client Secret ${s.clientSecret ? '(설정됨 — 변경 시 입력)' : ''}">
      <input name="allowedDomain" placeholder="허용 도메인 (예: cardoc.kr, 비우면 전체)" value="${esc(s.allowedDomain)}">
      <button>저장</button></form>
    <p class="hint">리디렉션 URI: <code>${esc(BASE_URL)}/oauth2/callback</code> 를 Google 콘솔에 등록하세요.</p>
    </div>`;
  send(res, 200, page('설정', body, 'app'), { 'Content-Type': 'text/html; charset=utf-8' });
}
function serveLogin(req, res) {
  const sso = ssoConfigured();
  const body = `<div class="login"><h1>🧩 lightifact</h1>
    <form id="lf"><input name="email" type="email" placeholder="이메일" required autofocus>
    <input name="password" type="password" placeholder="비밀번호" required><button>로그인</button>
    <div id="err"></div></form>
    ${sso ? '<div class="or">또는</div><a class="google" href="/oauth2/start">Google로 로그인</a>' : ''}</div>
    <script>document.getElementById('lf').addEventListener('submit',async(e)=>{e.preventDefault();const f=e.target;
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.email.value,password:f.password.value})});
    if(r.ok)location.href='/';else{const j=await r.json();document.getElementById('err').textContent=j.error||'로그인 실패';}});</script>`;
  send(res, 200, page('로그인', body, 'login'), { 'Content-Type': 'text/html; charset=utf-8' });
}

function page(title, body, mode = 'app') {
  const css = {
    login: `body{display:grid;place-items:center;min-height:100vh;margin:0} .login{width:300px;text-align:center}
      .login h1{font-size:22px} form{display:flex;flex-direction:column;gap:8px} .or{color:#888;margin:14px 0;font-size:13px}
      .google{display:block;padding:10px;border:1px solid #8886;border-radius:8px;text-decoration:none;color:inherit}
      #err{color:#e5484d;font-size:13px;min-height:16px}`,
    viewer: `body{display:flex;flex-direction:column;height:100vh;margin:0}
      header{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid #8883}
      header .title{font-weight:600;flex:1} header a{color:#4571ff;text-decoration:none;font-size:13px} iframe{flex:1;border:0}`,
    app: `.bar{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid #8883}
      .bar .sp{flex:1} .bar a{color:#4571ff;text-decoration:none;font-size:13px} .who{color:#888;font-size:12px}
      .wrap{max-width:820px;margin:0 auto;padding:24px 20px} h2{font-size:16px;margin-top:28px}
      form{display:flex;flex-direction:column;gap:8px} .row{flex-direction:row;flex-wrap:wrap;align-items:center}
      input,textarea{padding:9px;border:1px solid #8886;border-radius:8px;background:transparent;color:inherit;font:inherit}
      textarea{min-height:150px;font-family:ui-monospace,monospace} button{padding:9px 14px;border:0;border-radius:8px;background:#4571ff;color:#fff;font-weight:600;cursor:pointer}
      table{width:100%;border-collapse:collapse;font-size:13px} th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #8882} code{font-size:11px;color:#888}
      .list{list-style:none;padding:0} .list li{padding:8px 0;border-bottom:1px solid #8882} .empty{color:#888}
      #result{margin:10px 0;font-size:14px} .hint{color:#888;font-size:12px} a{color:#4571ff}`,
  }[mode] || '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(title)}</title><style>:root{color-scheme:light dark}*{box-sizing:border-box}
    body{font:15px/1.5 -apple-system,system-ui,sans-serif}${css}</style></head><body>${body}</body></html>`;
}

// ── 라우터 ────────────────────────────────────────────────────
const OPEN = new Set(['/healthz', '/login', '/api/login', '/oauth2/start', '/oauth2/callback']);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, BASE_URL);
    const path = url.pathname, method = req.method;

    if (method === 'GET' && path === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });

    // 최초 실행: 사용자가 없으면 셋업으로 유도
    if (!hasUsers()) {
      if (method === 'GET' && path === '/setup') return serveSetup(req, res);
      if (method === 'POST' && path === '/api/setup') return await apiSetup(req, res);
      if (path.startsWith('/api/')) return json(res, 401, { error: 'not initialized' });
      return redirect(res, '/setup');
    }

    if (method === 'GET' && path === '/setup') return redirect(res, '/login');
    if (method === 'GET' && path === '/login') return serveLogin(req, res);
    if (method === 'POST' && path === '/api/login') return await apiLogin(req, res);
    if (method === 'GET' && path === '/oauth2/start') return ssoStart(req, res);
    if (method === 'GET' && path === '/oauth2/callback') return await ssoCallback(req, res, url);
    if (method === 'GET' && path === '/logout') return logout(req, res);

    // 초대 수락 (미로그인 오픈)
    let m;
    if (method === 'GET' && (m = path.match(/^\/invite\/([a-f0-9]+)$/))) return serveInvite(req, res, m[1]);
    if (method === 'POST' && path === '/api/invite/accept') return await apiInviteAccept(req, res);

    // POST /artifacts: 세션 또는 Bearer 토큰 (writeUser 내부 처리)
    if (method === 'POST' && path === '/artifacts') return await createArtifact(req, res, url);

    // 그 외 전부 세션 로그인 필요
    const me = sessionUser(req);
    if (!me) {
      if (path.startsWith('/api/') || method !== 'GET') return json(res, 401, { error: 'login required' });
      return redirect(res, '/login');
    }
    if (method === 'GET' && path === '/') return await serveIndex(req, res, me);
    if (method === 'GET' && path === '/account') return serveAccount(req, res, me);
    if (method === 'POST' && path === '/api/account/token') return apiRegenToken(req, res, me);
    if (method === 'GET' && path === '/settings') return serveSettings(req, res, me);
    if (method === 'POST' && path === '/api/users') return await apiAddUser(req, res, me);
    if (method === 'POST' && path === '/api/users/delete') return await apiDeleteUser(req, res, me);
    if (method === 'POST' && path === '/api/invite') return await apiInvite(req, res, me);
    if (method === 'POST' && path === '/api/invite/revoke') return await apiRevokeInvite(req, res, me);
    if (method === 'POST' && path === '/api/settings/sso') return await apiSaveSso(req, res, me);
    if (method === 'GET' && (m = path.match(/^\/raw\/([^/]+)$/))) return await serveRaw(req, res, m[1]);
    if (method === 'GET' && (m = path.match(/^\/a\/([^/]+)$/))) return await serveViewer(req, res, m[1]);
    send(res, 404, 'not found');
  } catch (err) {
    json(res, 500, { error: String(err.message || err) });
  }
});
server.listen(PORT, () => console.log(`🧩 lightifact → ${BASE_URL}${SECURE ? '' : '  (insecure/dev)'}`));

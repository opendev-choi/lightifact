import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const PORT = Number(process.env.PORT || 4321);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });

// artifact HTML은 외부 네트워크를 못 쓰게 막는다 (Claude Artifacts와 동일한 철학).
const RAW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "frame-ancestors 'self'",
].join('; ');

const slugPath = (slug) => join(DATA_DIR, `${slug}.html`);
const metaPath = (slug) => join(DATA_DIR, `${slug}.json`);
const isValidSlug = (s) => /^[a-zA-Z0-9-]{6,64}$/.test(s);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// ---- POST /artifacts : HTML 업로드 → slug/URL 반환 ----
async function createArtifact(req, res, url) {
  const raw = await readBody(req);
  let html = raw;
  let title = url.searchParams.get('title') || '';
  const ctype = req.headers['content-type'] || '';
  if (ctype.includes('application/json')) {
    try {
      const j = JSON.parse(raw);
      html = j.html ?? '';
      title = j.title ?? title;
    } catch { return send(res, 400, JSON.stringify({ error: 'invalid json' }), { 'Content-Type': 'application/json' }); }
  }
  if (!html || !html.trim()) {
    return send(res, 400, JSON.stringify({ error: 'html body is empty' }), { 'Content-Type': 'application/json' });
  }
  const slug = randomUUID();
  await writeFile(slugPath(slug), html, 'utf8');
  await writeFile(metaPath(slug), JSON.stringify({
    slug, title: title || 'Untitled artifact', bytes: Buffer.byteLength(html),
  }), 'utf8');
  const shareUrl = `${BASE_URL}/a/${slug}`;
  send(res, 201, JSON.stringify({ slug, url: shareUrl }), { 'Content-Type': 'application/json' });
}

// ---- GET /raw/:slug : CSP 걸린 원본 HTML (iframe 안에서만 로드됨) ----
async function serveRaw(req, res, slug) {
  if (!isValidSlug(slug) || !existsSync(slugPath(slug))) return send(res, 404, 'not found');
  const html = await readFile(slugPath(slug), 'utf8');
  send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': RAW_CSP });
}

// ---- GET /a/:slug : sandboxed iframe 뷰어 ----
async function serveViewer(req, res, slug) {
  if (!isValidSlug(slug) || !existsSync(metaPath(slug))) return send(res, 404, page('Not found', '<h1>404</h1><p>해당 artifact를 찾을 수 없습니다.</p>'));
  const meta = JSON.parse(await readFile(metaPath(slug), 'utf8'));
  const body = `
    <header>
      <a href="/" class="back">← 목록</a>
      <span class="title">${esc(meta.title)}</span>
      <a href="/raw/${slug}" target="_blank" class="open">새 탭에서 열기 ↗</a>
    </header>
    <iframe src="/raw/${slug}" sandbox="allow-scripts allow-popups allow-forms" title="${esc(meta.title)}"></iframe>`;
  send(res, 200, page(meta.title, body, true), { 'Content-Type': 'text/html; charset=utf-8' });
}

// ---- GET / : 목록 + 업로드 폼 ----
async function serveIndex(req, res) {
  const files = (await readdir(DATA_DIR)).filter((f) => f.endsWith('.json'));
  const items = [];
  for (const f of files) {
    try { items.push(JSON.parse(await readFile(join(DATA_DIR, f), 'utf8'))); } catch {}
  }
  const list = items.length
    ? items.map((m) => `<li><a href="/a/${m.slug}">${esc(m.title)}</a> <code>${m.slug.slice(0, 8)}</code></li>`).join('')
    : '<li class="empty">아직 artifact가 없습니다.</li>';
  const body = `
    <h1>🧩 lightifact</h1>
    <form id="up">
      <input name="title" placeholder="제목 (선택)" />
      <textarea name="html" placeholder="여기에 HTML 붙여넣기..." required></textarea>
      <button type="submit">공유 링크 생성</button>
    </form>
    <div id="result"></div>
    <h2>목록</h2>
    <ul class="list">${list}</ul>
    <script>
      const f = document.getElementById('up');
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = await fetch('/artifacts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: f.title.value, html: f.html.value }),
        });
        const j = await r.json();
        if (j.url) {
          document.getElementById('result').innerHTML =
            '생성됨: <a href="' + j.url + '">' + j.url + '</a>';
          setTimeout(() => location.reload(), 800);
        } else {
          document.getElementById('result').textContent = '에러: ' + (j.error || 'unknown');
        }
      });
    </script>`;
  send(res, 200, page('lightifact', body), { 'Content-Type': 'text/html; charset=utf-8' });
}

function page(title, body, viewer = false) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 -apple-system, system-ui, sans-serif; }
  ${viewer ? `
  body { display: flex; flex-direction: column; height: 100vh; }
  header { display: flex; align-items: center; gap: 16px; padding: 10px 16px; border-bottom: 1px solid #8883; }
  header .title { font-weight: 600; flex: 1; }
  header a { color: #4571ff; text-decoration: none; font-size: 13px; }
  iframe { flex: 1; width: 100%; border: 0; }
  ` : `
  body { max-width: 760px; margin: 0 auto; padding: 32px 20px; }
  h1 { font-size: 24px; } h2 { font-size: 16px; margin-top: 32px; }
  form { display: flex; flex-direction: column; gap: 8px; }
  input, textarea { padding: 10px; border: 1px solid #8886; border-radius: 8px; background: transparent; color: inherit; font: inherit; }
  textarea { min-height: 160px; font-family: ui-monospace, monospace; }
  button { padding: 10px; border: 0; border-radius: 8px; background: #4571ff; color: #fff; font-weight: 600; cursor: pointer; }
  #result { margin: 12px 0; font-size: 14px; }
  .list { list-style: none; padding: 0; } .list li { padding: 8px 0; border-bottom: 1px solid #8882; }
  .list code { color: #888; font-size: 12px; } .empty { color: #888; }
  a { color: #4571ff; }
  `}
</style></head><body>${body}</body></html>`;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, BASE_URL);
    const path = url.pathname;
    if (req.method === 'POST' && path === '/artifacts') return await createArtifact(req, res, url);
    if (req.method === 'GET' && path === '/') return await serveIndex(req, res);
    let m;
    if (req.method === 'GET' && (m = path.match(/^\/raw\/([^/]+)$/))) return await serveRaw(req, res, m[1]);
    if (req.method === 'GET' && (m = path.match(/^\/a\/([^/]+)$/))) return await serveViewer(req, res, m[1]);
    send(res, 404, 'not found');
  } catch (err) {
    send(res, 500, JSON.stringify({ error: String(err.message || err) }), { 'Content-Type': 'application/json' });
  }
});

server.listen(PORT, () => console.log(`🧩 lightifact → ${BASE_URL}`));

#!/usr/bin/env node
// 사용법:
//   생성: node share.mjs <html파일경로> [제목]
//   수정: node share.mjs <html파일경로> [제목] --update <slug>   (같은 링크 유지, 덮어쓰기)
// 대상 서버: 환경변수 LIGHTIFACT_URL (없으면 사내 배포 URL). 로컬: LIGHTIFACT_URL=http://localhost:4321
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const upIdx = args.indexOf('--update');
const slug = upIdx >= 0 ? args[upIdx + 1] : '';
const positional = args.filter((a, i) => a !== '--update' && !(upIdx >= 0 && i === upIdx + 1));
const [filePath, title = ''] = positional;

const BASE_URL = process.env.LIGHTIFACT_URL || process.env.BASE_URL || '__LIGHTIFACT_URL__';
const TOKEN = process.env.LIGHTIFACT_TOKEN || '';

if (!filePath) {
  console.error('사용법: node share.mjs <html파일경로> [제목] [--update <slug>]');
  process.exit(1);
}

const headers = { 'Content-Type': 'application/json' };
if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

const html = await readFile(filePath, 'utf8');
const endpoint = slug ? `${BASE_URL}/artifacts/${slug}` : `${BASE_URL}/artifacts`;
const method = slug ? 'PUT' : 'POST';

const res = await fetch(endpoint, {
  method,
  headers,
  body: JSON.stringify({ title, html }),
}).catch((e) => {
  console.error(`${slug ? '수정' : '업로드'} 실패: ${BASE_URL} 에 연결할 수 없음 (${e.message})`);
  console.error('사내망/VPN 연결을 확인하거나, 로컬이면 LIGHTIFACT_URL=http://localhost:4321 를 지정하세요.');
  process.exit(1);
});
const json = await res.json();
if (!res.ok) {
  console.error(`${slug ? '수정' : '업로드'} 실패:`, json.error || res.status);
  if (res.status === 401) console.error('→ 토큰을 환경변수에 넣으세요: export LIGHTIFACT_TOKEN=<your-token>');
  if (res.status === 403) console.error('→ 본인 소유(또는 admin) artifact 만 수정할 수 있습니다.');
  process.exit(1);
}
console.log(JSON.stringify(json, null, 2));

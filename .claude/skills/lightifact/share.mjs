#!/usr/bin/env node
// 사용법: node share.mjs <html파일경로> [제목]
// 대상 서버: 환경변수 LIGHTIFACT_URL (없으면 사내 배포 URL) 사용.
//            로컬 개발 시:  LIGHTIFACT_URL=http://localhost:4321 node share.mjs ...
import { readFile } from 'node:fs/promises';

const [, , filePath, title = ''] = process.argv;
const BASE_URL = process.env.LIGHTIFACT_URL || process.env.BASE_URL || 'https://lightifact.cardoc.kr';
const TOKEN = process.env.LIGHTIFACT_TOKEN || '';

if (!filePath) {
  console.error('사용법: node share.mjs <html파일경로> [제목]');
  process.exit(1);
}

const headers = { 'Content-Type': 'application/json' };
if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

const html = await readFile(filePath, 'utf8');
const res = await fetch(`${BASE_URL}/artifacts`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ title, html }),
}).catch((e) => {
  console.error(`업로드 실패: ${BASE_URL} 에 연결할 수 없음 (${e.message})`);
  console.error('사내망/VPN 연결을 확인하거나, 로컬이면 LIGHTIFACT_URL=http://localhost:4321 를 지정하세요.');
  process.exit(1);
});
const json = await res.json();
if (!res.ok) {
  console.error('업로드 실패:', json.error || res.status);
  if (res.status === 401) {
    console.error('→ 발급받은 토큰을 환경변수에 넣으세요: export LIGHTIFACT_TOKEN=<your-token>');
  }
  process.exit(1);
}
console.log(JSON.stringify(json, null, 2));

#!/usr/bin/env node
// 사용법: node share.mjs <html파일경로> [제목]
import { readFile } from 'node:fs/promises';

const [, , filePath, title = ''] = process.argv;
const BASE_URL = process.env.BASE_URL || 'http://localhost:4321';

if (!filePath) {
  console.error('사용법: node share.mjs <html파일경로> [제목]');
  process.exit(1);
}

const html = await readFile(filePath, 'utf8');
const res = await fetch(`${BASE_URL}/artifacts`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title, html }),
});
const json = await res.json();
if (!res.ok) {
  console.error('업로드 실패:', json.error || res.status);
  process.exit(1);
}
console.log(JSON.stringify(json, null, 2));

// Скачивает подписанный XPI прямо с AMO — без ожидания, которое web-ext
// устраивает после подписи. Ключи берутся из окружения (WEB_EXT_API_KEY /
// WEB_EXT_API_SECRET) и никуда не печатаются.
//
//   node scripts/fetch-signed.mjs [версия]
//
// Без аргумента берётся version из package.json.

import { createHmac } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const GUID = 'tollgate@kolombet.dev';
const OUT_DIR = '.output/signed';

const b64 = (raw) => Buffer.from(raw).toString('base64url');

function makeJwt(issuer, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ iss: issuer, jti: String(now), iat: now, exp: now + 60 }));
  const input = `${header}.${payload}`;
  return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
}

const issuer = process.env.WEB_EXT_API_KEY;
const secret = process.env.WEB_EXT_API_SECRET;
if (!issuer || !secret) {
  console.error('Нет WEB_EXT_API_KEY / WEB_EXT_API_SECRET в окружении.');
  process.exit(1);
}

const wanted =
  process.argv[2] ?? JSON.parse(await readFile('package.json', 'utf8')).version;
const auth = () => ({ Authorization: `JWT ${makeJwt(issuer, secret)}` });

const listUrl =
  `https://addons.mozilla.org/api/v5/addons/addon/${GUID}/versions/` +
  '?filter=all_with_unlisted&page_size=25';
const list = await fetch(listUrl, { headers: auth() });
if (!list.ok) {
  console.error(`AMO ответил ${list.status}: ${(await list.text()).slice(0, 200)}`);
  process.exit(1);
}

const version = (await list.json()).results.find((v) => v.version === wanted);
if (!version) {
  console.error(`Версии ${wanted} на AMO нет — сначала подпиши: npm run sign:firefox`);
  process.exit(1);
}
if (version.file?.status !== 'public') {
  console.error(`Версия ${wanted} ещё не подписана (статус файла: ${version.file?.status}).`);
  process.exit(1);
}

const file = await fetch(version.file.url, { headers: auth() });
if (!file.ok) {
  console.error(`Скачивание не удалось: ${file.status}`);
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
const path = `${OUT_DIR}/tollgate_timer-${wanted}.xpi`;
await writeFile(path, Buffer.from(await file.arrayBuffer()));
console.log(`Готово: ${path}`);

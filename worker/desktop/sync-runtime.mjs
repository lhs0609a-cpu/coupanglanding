/**
 * 공유 워커 라이브러리(../../lib)와 예제 워크플로를 desktop/runtime/ 으로 복사.
 * dev 실행/패키징 직전에 돌려, 메인 프로세스가 앱 디렉토리 내부(runtime/)에서만
 * import 하도록 한다(electron-builder 가 외부 경로를 번들하지 못하는 문제 회피).
 */
import { mkdir, copyFile, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const libSrc = join(here, '..', 'lib');
const wfSrc = join(here, '..', 'workflows');
const runtime = join(here, 'runtime');
const wfDst = join(runtime, 'workflows');

await mkdir(runtime, { recursive: true });
await mkdir(wfDst, { recursive: true });

for (const f of await readdir(libSrc)) {
  if (f.endsWith('.mjs')) await copyFile(join(libSrc, f), join(runtime, f));
}

// lib/data/ (카테고리 인덱스·임베딩) 도 복사 — category-candidates-mini.mjs 가
// join(here,'data',...) 로 읽으므로, 빠지면 runtime 실행 시 ENOENT 로 즉사한다.
try {
  const dataSrc = join(libSrc, 'data');
  const dataDst = join(runtime, 'data');
  await mkdir(dataDst, { recursive: true });
  for (const f of await readdir(dataSrc)) {
    const s = await stat(join(dataSrc, f));
    if (s.isFile()) await copyFile(join(dataSrc, f), join(dataDst, f));
  }
} catch (e) {
  console.warn('[sync-runtime] lib/data 복사 실패:', e.message);
}
for (const f of await readdir(wfSrc)) {
  if (f.endsWith('.example.json')) await copyFile(join(wfSrc, f), join(wfDst, f));
}

// 올인원 CLI(run-folder.mjs)도 runtime/ 에 복사 — './lib/X' → './X' 로 경로 재작성
// (runtime/ 에는 lib 파일들이 평면 배치되므로). 통합앱 올인원 모듈이 packaged 에서도 실행 가능.
try {
  const rf = await readFile(join(here, '..', 'run-folder.mjs'), 'utf-8');
  await writeFile(join(runtime, 'run-folder.mjs'), rf.replace(/from '\.\/lib\//g, "from './"), 'utf-8');
} catch (e) {
  console.warn('[sync-runtime] run-folder.mjs 복사 생략:', e.message);
}

// ── 검증: 깨진 runtime/ 이 그대로 패키징되는 것을 막는다 ──────────────────
//   v0.2.40 이 data/ 와 local-cutout.mjs 없이 배포돼 올인원이 ENOENT 로 즉사했다.
//   여기서 실패시키면 `npm run dist` 가 멈추므로 같은 사고가 재발하지 않는다.
{
  const missing = [];

  // 1) run-folder.mjs 가 import 하는 로컬 모듈이 전부 runtime/ 에 있는가
  const rfOut = await readFile(join(runtime, 'run-folder.mjs'), 'utf-8').catch(() => '');
  for (const m of rfOut.matchAll(/from '\.\/([\w.-]+\.mjs)'/g)) {
    if (!(await stat(join(runtime, m[1])).catch(() => null))) missing.push(m[1]);
  }

  // 2) 카테고리 인덱스 — 없으면 generateBatch 가 통째로 throw
  for (const f of ['data/coupang-cat-index.json']) {
    if (!(await stat(join(runtime, f)).catch(() => null))) missing.push(f);
  }

  if (missing.length) {
    console.error(`[sync-runtime] ❌ runtime/ 불완전 — 누락: ${missing.join(', ')}`);
    process.exit(1);
  }
}

console.log('runtime/ 동기화 완료 (검증 통과)');

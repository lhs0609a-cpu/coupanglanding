/**
 * 공유 워커 라이브러리(../../lib)와 예제 워크플로를 desktop/runtime/ 으로 복사.
 * dev 실행/패키징 직전에 돌려, 메인 프로세스가 앱 디렉토리 내부(runtime/)에서만
 * import 하도록 한다(electron-builder 가 외부 경로를 번들하지 못하는 문제 회피).
 */
import { mkdir, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
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

console.log('runtime/ 동기화 완료');

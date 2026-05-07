#!/usr/bin/env node
// 모든 src/app/api/**/route.ts 의 console.error 호출 다음 줄에
// `void logSystemError({ source, error }).catch(() => {});` 자동 삽입.
//
// idempotent: 이미 logSystemError 호출이 있는 catch 블록은 건너뜀.
// fire-and-forget: silently fails 보장하므로 await 안 함.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();

function listRouteFiles() {
  const out = execSync('git ls-files src/app/api', { cwd: ROOT, encoding: 'utf8' });
  return out
    .split('\n')
    .filter((f) => f.endsWith('/route.ts') || f.endsWith('/route.tsx'))
    .map((f) => path.join(ROOT, f));
}

function deriveSource(filePath) {
  // src/app/api/foo/bar/route.ts → 'foo/bar'
  const rel = path.relative(path.join(ROOT, 'src/app/api'), filePath).replace(/\\/g, '/');
  return rel.replace(/\/route\.tsx?$/, '');
}

function ensureImport(content) {
  if (/from\s+['"]@\/lib\/utils\/system-log['"]/.test(content)) return content;
  // 마지막 import 가 끝나는 (from '...' ; 줄) 위치를 찾는다 — multi-line import 안전 처리
  const lines = content.split('\n');
  let lastImportEndIdx = -1;
  let inImport = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inImport && /^\s*import\s/.test(line)) {
      inImport = true;
    }
    if (inImport && /from\s+['"`][^'"`]+['"`]\s*;?\s*$/.test(line)) {
      lastImportEndIdx = i;
      inImport = false;
    } else if (inImport && /^\s*import\s.+from\s+['"`][^'"`]+['"`]/.test(line)) {
      // single-line import (open & close on same line)
      lastImportEndIdx = i;
      inImport = false;
    }
  }
  if (lastImportEndIdx < 0) {
    return `import { logSystemError } from '@/lib/utils/system-log';\n` + content;
  }
  return [
    ...lines.slice(0, lastImportEndIdx + 1),
    `import { logSystemError } from '@/lib/utils/system-log';`,
    ...lines.slice(lastImportEndIdx + 1),
  ].join('\n');
}

// console.error(...err...) 패턴을 찾고, 다음 줄이 logSystemError 가 아니면 삽입
function injectCalls(content, source) {
  const lines = content.split('\n');
  const out = [];
  let injected = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);

    // console.error('...', err) 또는 console.error('...:', err) 같은 호출
    const m = line.match(/console\.error\(([^)]*)\)/);
    if (!m) continue;

    const args = m[1];
    // err 변수명 추출 (마지막 인자)
    const argParts = args.split(',').map((s) => s.trim());
    const last = argParts[argParts.length - 1];
    // 변수명만 (식별자) — 함수 호출/문자열은 skip
    const errVarMatch = last && /^[a-zA-Z_$][\w$]*$/.test(last) ? last : null;
    if (!errVarMatch) continue;
    if (!/err|error|e$/i.test(errVarMatch)) continue;

    // 이미 다음 줄에 logSystemError 가 있으면 skip
    const nextLine = lines[i + 1] || '';
    if (/logSystemError|logSystemWarn|logSystemInfo/.test(nextLine)) continue;
    // 같은 줄에 이미 있어도 skip
    if (/logSystemError/.test(line)) continue;

    // 인덴테이션 매칭
    const indent = line.match(/^(\s*)/)?.[1] || '';

    // fire-and-forget
    out.push(
      `${indent}void logSystemError({ source: '${source}', error: ${errVarMatch} }).catch(() => {});`,
    );
    injected++;
  }

  return { content: out.join('\n'), injected };
}

function main() {
  const files = listRouteFiles();
  let totalInjected = 0;
  let filesTouched = 0;
  let skipped = 0;
  let errored = 0;

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8');
      const source = deriveSource(file);
      const { content: injected, injected: count } = injectCalls(content, source);
      if (count === 0) {
        skipped++;
        continue;
      }
      const withImport = ensureImport(injected);
      writeFileSync(file, withImport, 'utf8');
      totalInjected += count;
      filesTouched++;
      console.log(`+ ${path.relative(ROOT, file)} (+${count})`);
    } catch (err) {
      errored++;
      console.error(`! ${path.relative(ROOT, file)} — ${err.message}`);
    }
  }

  console.log(`\nDone. files=${filesTouched} injected=${totalInjected} skipped=${skipped} errored=${errored} total=${files.length}`);
}

main();

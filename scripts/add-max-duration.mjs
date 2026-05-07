#!/usr/bin/env node
// Adds `export const maxDuration = 30;` to every src/app/api/**/route.ts that
// doesn't already declare it. Idempotent — safe to re-run.
//
// 무한 로딩 방어 — Vercel Hobby/Pro 기본 limit 보다 짧게 설정해서 hang 시 504 응답.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_MAX_DURATION = 30;

function listRouteFiles() {
  // Use git ls-files to avoid Node fs recursive issues with Korean paths
  const out = execSync('git ls-files src/app/api', { cwd: ROOT, encoding: 'utf8' });
  return out
    .split('\n')
    .filter((f) => f.endsWith('/route.ts') || f.endsWith('/route.tsx'))
    .map((f) => path.join(ROOT, f));
}

function alreadyHasMaxDuration(content) {
  return /export\s+const\s+maxDuration\s*=/.test(content);
}

function addMaxDuration(content, value) {
  // Insert after the last top-level import block, before any export/code.
  const lines = content.split('\n');
  let lastImportIdx = -1;
  let inMultilineImport = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inMultilineImport) {
      if (/[}'"`]\s*from\s+['"`].+['"`]\s*;?\s*$/.test(line) || /^[^a-zA-Z]*from\s/.test(line)) {
        lastImportIdx = i;
      }
      if (/from\s+['"`].+['"`]\s*;?\s*$/.test(line)) inMultilineImport = false;
      continue;
    }
    if (/^\s*import\s/.test(line)) {
      lastImportIdx = i;
      // Multiline import — opens with `{` and doesn't close on same line
      if (/\{/.test(line) && !/\}/.test(line)) inMultilineImport = true;
      continue;
    }
    // After imports, stop scanning at first non-empty / non-comment line
    if (line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*')) {
      break;
    }
  }

  const insertAt = lastImportIdx + 1;
  const insertion = ['', `export const maxDuration = ${value};`, ''];
  return [...lines.slice(0, insertAt), ...insertion, ...lines.slice(insertAt)].join('\n');
}

function main() {
  const files = listRouteFiles();
  let added = 0;
  let skipped = 0;
  let errored = 0;

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8');
      if (alreadyHasMaxDuration(content)) {
        skipped++;
        continue;
      }
      // Skip files that don't define route handlers (extreme edge — defensive)
      if (!/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)/.test(content)) {
        skipped++;
        continue;
      }
      const updated = addMaxDuration(content, DEFAULT_MAX_DURATION);
      writeFileSync(file, updated, 'utf8');
      added++;
      console.log(`+ ${path.relative(ROOT, file)}`);
    } catch (err) {
      errored++;
      console.error(`! ${path.relative(ROOT, file)} — ${err.message}`);
    }
  }

  console.log(`\nDone. added=${added} skipped=${skipped} errored=${errored} total=${files.length}`);
}

main();

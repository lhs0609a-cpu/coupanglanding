#!/usr/bin/env node
/**
 * 생성된 카테고리 풀을 메인 seo-keyword-pools.json에 머지
 *
 * - generated.json (자동생성)을 읽어 categoryPools에 추가
 * - 기존 수작업 199개는 절대 덮어쓰지 않음
 * - universalModifiers, synonymGroups 등 다른 키는 보존
 * - 백업: seo-keyword-pools.backup.json
 *
 * 사용법:
 *   node scripts/merge-category-pools.mjs
 *   node scripts/merge-category-pools.mjs --dry-run
 */

import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'src/lib/megaload/data');
const POOLS_FILE = join(DATA_DIR, 'seo-keyword-pools.json');
const GENERATED_FILE = join(DATA_DIR, 'seo-keyword-pools.generated.json');
const BACKUP_FILE = join(DATA_DIR, 'seo-keyword-pools.backup.json');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const main = JSON.parse(await readFile(POOLS_FILE, 'utf8'));
  const generated = JSON.parse(await readFile(GENERATED_FILE, 'utf8'));

  const existing = main.categoryPools || {};
  const existingKeys = new Set(Object.keys(existing));
  const generatedKeys = Object.keys(generated);

  const toAdd = generatedKeys.filter(k => !existingKeys.has(k));
  const conflicts = generatedKeys.filter(k => existingKeys.has(k));

  console.log(`[stats] 메인 파일 카테고리: ${existingKeys.size}개`);
  console.log(`[stats] 생성된 카테고리: ${generatedKeys.length}개`);
  console.log(`[stats] 신규 머지: ${toAdd.length}개`);
  console.log(`[stats] 기존 보존(머지 스킵): ${conflicts.length}개`);

  if (DRY_RUN) {
    console.log('\n[dry-run] 머지 안 함. 신규 카테고리 샘플 5개:');
    for (const k of toAdd.slice(0, 5)) {
      console.log(`  ${k}`);
      console.log(`    generic: ${generated[k].generic.slice(0, 4).join(', ')}...`);
      console.log(`    features: ${generated[k].features.slice(0, 4).join(', ')}...`);
    }
    return;
  }

  // 백업
  await copyFile(POOLS_FILE, BACKUP_FILE);
  console.log(`[backup] ${BACKUP_FILE} 생성`);

  // 머지
  const merged = { ...existing };
  for (const k of toAdd) merged[k] = generated[k];

  const out = { ...main, categoryPools: merged };
  await writeFile(POOLS_FILE, JSON.stringify(out, null, 2));
  console.log(`[done] ${POOLS_FILE} 머지 완료 — 총 ${Object.keys(merged).length}개 카테고리`);
}

main().catch(err => { console.error('[fatal]', err); process.exit(1); });

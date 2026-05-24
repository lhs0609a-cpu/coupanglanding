// ============================================================
// DB 마이그레이션 러너
// supabase/migration_*.sql 을 파일명 순서대로·중복 없이 Postgres 에 적용한다.
//
// 사용:
//   DATABASE_URL=postgresql://... node scripts/migrate.mjs            # 미적용 마이그레이션 실행
//   DATABASE_URL=postgresql://... node scripts/migrate.mjs --baseline # 전부 "적용됨"으로 표시(실행 X)
//   DATABASE_URL=postgresql://... node scripts/migrate.mjs --dry-run  # 무엇을 적용할지 미리보기만
//
// DATABASE_URL: Supabase → Project Settings → Database → Connection string (URI, 비번 포함).
//   .vercel/.env.production.local 에 넣어두면 아래처럼 로드해서 쓸 수도 있음:
//   node -r dotenv/config ... (또는 직접 export)
//
// 동작:
//   - _migrations(name, applied_at) 이력 테이블을 만들어 적용한 파일을 기록.
//   - 다음 실행 땐 _migrations 에 없는 파일만 실행(파일명 오름차순).
//   - 각 마이그레이션은 트랜잭션으로 감싸 실패 시 롤백 + 즉시 중단(부분 적용 방지).
//
// ⚠️ 기존에 수동 적용한 마이그레이션이 많은 DB 에 처음 도입할 때:
//   이미 적용된 것까지 재실행되지 않도록 --baseline 으로 현재 파일들을 "적용됨"으로 표시한 뒤
//   새 마이그레이션부터 일반 실행하는 걸 권장. (이 프로젝트 마이그레이션은 대부분 idempotent
//   - IF NOT EXISTS / OR REPLACE / DROP IF EXISTS - 라 그냥 실행해도 대체로 안전하지만,
//     안전을 위해 baseline 권장.)
// ============================================================

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const args = new Set(process.argv.slice(2));
const BASELINE = args.has('--baseline');
const DRY = args.has('--dry-run');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('✗ DATABASE_URL 환경변수가 없습니다.');
  console.error('  Supabase → Project Settings → Database → Connection string(URI) 을');
  console.error('  DATABASE_URL 로 설정한 뒤 다시 실행하세요.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const migDir = join(here, '..', 'supabase');

const files = (await readdir(migDir))
  .filter((f) => /^migration_.*\.sql$/i.test(f))
  .sort((a, b) => a.localeCompare(b));

if (files.length === 0) {
  console.log('적용할 마이그레이션 파일(supabase/migration_*.sql)이 없습니다.');
  process.exit(0);
}

const { Client } = pg;
// Supabase 는 TLS 필요. self-signed 체인 이슈 회피를 위해 rejectUnauthorized:false.
const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const applied = new Set((await client.query('SELECT name FROM _migrations')).rows.map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));

  if (BASELINE) {
    if (pending.length === 0) { console.log('이미 모든 파일이 기록돼 있습니다.'); }
    for (const f of pending) {
      await client.query('INSERT INTO _migrations(name) VALUES($1) ON CONFLICT DO NOTHING', [f]);
      console.log('  baseline ✓', f);
    }
    console.log(`\nbaseline 완료: ${pending.length}건을 "적용됨"으로 표시(실행 안 함).`);
    process.exit(0);
  }

  if (pending.length === 0) { console.log('적용할 새 마이그레이션이 없습니다. (모두 최신)'); process.exit(0); }

  console.log(`적용 대상 ${pending.length}건:`);
  pending.forEach((f) => console.log('  -', f));
  if (DRY) { console.log('\n--dry-run: 실제 실행 안 함.'); process.exit(0); }

  let n = 0;
  for (const f of pending) {
    const sql = await readFile(join(migDir, f), 'utf8');
    process.stdout.write(`적용 중: ${f} ... `);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations(name) VALUES($1)', [f]);
      await client.query('COMMIT');
      console.log('✓');
      n++;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.log('✗');
      console.error(`\n실패: ${f}\n  ${e.message}`);
      console.error('  (해당 마이그레이션을 고치거나, 이미 적용된 거면 --baseline 으로 표시 후 다시 실행)');
      process.exit(1);
    }
  }
  console.log(`\n완료: ${n}건 적용.`);
} finally {
  await client.end();
}

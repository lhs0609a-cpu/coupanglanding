/**
 * 기존 등록 상품의 sourceUrl 일괄 업데이트 스크립트
 *
 * sh_products.raw_data.sourceFolder 경로에서 product_summary.txt를 읽어
 * URL을 추출하고 raw_data.sourceUrl에 저장한다.
 *
 * 사용법: node scripts/backfill-source-urls.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// .env.local 수동 파싱 (dotenv 의존성 없이)
const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수 필요');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n🔧 sourceUrl 일괄 업데이트 ${DRY_RUN ? '(DRY RUN)' : ''}\n`);

  // 1. sourceUrl이 없는 상품 조회
  const { data: products, error } = await supabase
    .from('sh_products')
    .select('id, product_name, raw_data')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ DB 조회 실패:', error.message);
    process.exit(1);
  }

  const targets = products.filter(p => {
    const raw = p.raw_data;
    return raw && !raw.sourceUrl && raw.sourceFolder;
  });

  console.log(`총 상품: ${products.length}개, sourceUrl 없는 상품: ${targets.length}개\n`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const product of targets) {
    const raw = product.raw_data;
    const sourceFolder = raw.sourceFolder;
    const summaryPath = path.join(sourceFolder, 'product_summary.txt');

    // product_summary.txt 읽기
    if (!fs.existsSync(summaryPath)) {
      console.log(`  ⏭ ${product.product_name} — product_summary.txt 없음 (${sourceFolder})`);
      notFound++;
      continue;
    }

    try {
      const text = fs.readFileSync(summaryPath, 'utf-8');
      const urlMatch = text.match(/URL:\s*(https?:\/\/\S+)/i);

      if (!urlMatch) {
        console.log(`  ⏭ ${product.product_name} — URL 패턴 없음`);
        skipped++;
        continue;
      }

      const sourceUrl = urlMatch[1];

      if (DRY_RUN) {
        console.log(`  ✅ [DRY] ${product.product_name} → ${sourceUrl}`);
        updated++;
        continue;
      }

      // raw_data에 sourceUrl 추가 (기존 필드 유지)
      const newRawData = { ...raw, sourceUrl };
      const { error: updateErr } = await supabase
        .from('sh_products')
        .update({ raw_data: newRawData })
        .eq('id', product.id);

      if (updateErr) {
        console.log(`  ❌ ${product.product_name} — 업데이트 실패: ${updateErr.message}`);
        skipped++;
      } else {
        console.log(`  ✅ ${product.product_name} → ${sourceUrl}`);
        updated++;
      }
    } catch (err) {
      console.log(`  ❌ ${product.product_name} — 읽기 실패: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n📊 결과: 업데이트 ${updated}개, 스킵 ${skipped}개, 파일없음 ${notFound}개`);
  if (DRY_RUN) console.log('   (DRY RUN — 실제 DB 변경 없음. --dry-run 제거 후 재실행)');
}

main().catch(console.error);

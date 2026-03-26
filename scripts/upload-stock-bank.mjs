#!/usr/bin/env node
/**
 * 큐레이션 스톡 이미지 뱅크 업로드 스크립트
 *
 * 사용법:
 *   node scripts/upload-stock-bank.mjs [--category apple] [--dry-run]
 *
 * stock-image-bank/{fruit}/ 폴더의 .jpg 파일을 Supabase Storage에 업로드하고
 * stock_image_bank 테이블에 INSERT합니다.
 *
 * 이미 존재하는 storage_path는 스킵 (멱등).
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BANK_DIR = path.join(ROOT, 'stock-image-bank');
const BUCKET = 'product-images';

// .env.local에서 환경 변수 읽기
function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local 파일이 없습니다.');
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// 카테고리 매핑 (stock-image-categories.ts와 동일)
const CATEGORY_INFO = {
  apple:      { label: '사과',     pathPrefix: '식품>신선식품>과일류>과일>사과' },
  pear:       { label: '배',       pathPrefix: '식품>신선식품>과일류>과일>배' },
  mandarin:   { label: '감귤',     pathPrefix: '식품>신선식품>과일류>과일>감귤' },
  grape:      { label: '포도',     pathPrefix: '식품>신선식품>과일류>과일>포도' },
  watermelon: { label: '수박',     pathPrefix: '식품>신선식품>과일류>과일>수박' },
  strawberry: { label: '딸기',     pathPrefix: '식품>신선식품>과일류>과일>딸기' },
  peach:      { label: '복숭아',   pathPrefix: '식품>신선식품>과일류>과일>복숭아' },
  mango:      { label: '망고',     pathPrefix: '식품>신선식품>과일류>과일>망고' },
  banana:     { label: '바나나',   pathPrefix: '식품>신선식품>과일류>과일>바나나' },
  kiwi:       { label: '키위',     pathPrefix: '식품>신선식품>과일류>과일>키위' },
  chamoe:     { label: '참외',     pathPrefix: '식품>신선식품>과일류>과일>참외' },
  cherry:     { label: '체리',     pathPrefix: '식품>신선식품>과일류>과일>체리' },
  blueberry:  { label: '블루베리', pathPrefix: '식품>신선식품>과일류>과일>블루베리' },
};

async function main() {
  loadEnv();

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const catIdx = args.indexOf('--category');
  const filterCategory = catIdx !== -1 ? args[catIdx + 1] : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 .env.local에 없습니다.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // 폴더 순회
  if (!fs.existsSync(BANK_DIR)) {
    console.error(`stock-image-bank/ 폴더가 없습니다: ${BANK_DIR}`);
    process.exit(1);
  }

  const folders = fs.readdirSync(BANK_DIR).filter(f => {
    const fullPath = path.join(BANK_DIR, f);
    return fs.statSync(fullPath).isDirectory();
  });

  let totalUploaded = 0;
  let totalSkipped = 0;

  for (const folder of folders) {
    if (filterCategory && folder !== filterCategory) continue;

    const info = CATEGORY_INFO[folder];
    if (!info) {
      console.warn(`⚠ 알 수 없는 카테고리 폴더: ${folder} (스킵)`);
      continue;
    }

    const folderPath = path.join(BANK_DIR, folder);
    const files = fs.readdirSync(folderPath)
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort();

    console.log(`\n📂 ${folder} (${info.label}) — ${files.length}장`);

    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      const storagePath = `megaload/stock-bank/${folder}/${filename}`;
      const filePath = path.join(folderPath, filename);

      // 이미 존재하는지 확인
      const { data: existing } = await supabase
        .from('stock_image_bank')
        .select('id')
        .eq('storage_path', storagePath)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`  ⏭ ${filename} (이미 존재)`);
        totalSkipped++;
        continue;
      }

      if (dryRun) {
        console.log(`  🔍 [DRY-RUN] ${filename} → ${storagePath}`);
        totalUploaded++;
        continue;
      }

      // Storage 업로드
      const fileBuffer = fs.readFileSync(filePath);
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error(`  ❌ ${filename} 업로드 실패:`, uploadError.message);
        continue;
      }

      // 공개 URL 생성
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(storagePath);

      const cdnUrl = urlData.publicUrl;

      // DB INSERT
      const { error: insertError } = await supabase
        .from('stock_image_bank')
        .insert({
          category_key: folder,
          category_label: info.label,
          category_path_prefix: info.pathPrefix,
          storage_path: storagePath,
          cdn_url: cdnUrl,
          original_filename: filename,
          sort_order: i,
        });

      if (insertError) {
        console.error(`  ❌ ${filename} DB 삽입 실패:`, insertError.message);
        continue;
      }

      console.log(`  ✅ ${filename} → ${cdnUrl}`);
      totalUploaded++;
    }
  }

  console.log(`\n📊 완료: ${totalUploaded}장 업로드, ${totalSkipped}장 스킵${dryRun ? ' (DRY-RUN)' : ''}`);
}

main().catch(err => {
  console.error('❌ 에러:', err);
  process.exit(1);
});

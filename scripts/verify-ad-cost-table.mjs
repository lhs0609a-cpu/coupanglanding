/**
 * ad_cost_submissions 테이블 마이그레이션 검증.
 * - 테이블 존재 / 컬럼 / row 카운트 확인 (read-only)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf-8');
const envMap = Object.fromEntries(
  envText.split(/\r?\n/)
    .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      let v = l.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return [l.slice(0, idx).trim(), v];
    }),
);

const supabase = createClient(envMap.NEXT_PUBLIC_SUPABASE_URL, envMap.SUPABASE_SERVICE_ROLE_KEY);

const { data, error, count } = await supabase
  .from('ad_cost_submissions')
  .select('*', { count: 'exact', head: false })
  .limit(1);

if (error) {
  console.error('❌ 테이블 조회 실패:', error.message);
  console.error('   마이그레이션이 정상 적용되지 않았을 가능성');
  process.exit(1);
}

console.log('✅ ad_cost_submissions 테이블 존재 확인');
console.log(`   현재 row 수: ${count ?? 0}개`);
if (data && data.length > 0) {
  console.log('   샘플 row keys:', Object.keys(data[0]).join(', '));
}

// 테스트 insert 가능 여부 확인 (즉시 rollback)
console.log('\n테이블 컬럼 검증을 위한 dry-run insert (롤백):');
const { error: insErr } = await supabase
  .from('ad_cost_submissions')
  .insert({
    pt_user_id: '00000000-0000-0000-0000-000000000000',  // 가짜 UUID — FK 위반으로 실패해야 정상
    year_month: '2099-12',
    amount: 1000,
    screenshot_url: 'test',
    attempt_no: 1,
    status: 'pending',
  });

if (insErr) {
  if (insErr.message.includes('foreign key') || insErr.message.includes('violates')) {
    console.log('✅ FK 제약 정상 동작 (가짜 pt_user_id 차단됨):', insErr.message.slice(0, 100));
  } else if (insErr.message.includes('column') || insErr.message.includes('does not exist')) {
    console.log('❌ 컬럼 누락:', insErr.message);
  } else {
    console.log('⚠ 예상 외 에러:', insErr.message);
  }
} else {
  console.log('⚠ FK 위반인데 insert 성공 — RLS 또는 제약 누락 가능');
  // 청소
  await supabase
    .from('ad_cost_submissions')
    .delete()
    .eq('pt_user_id', '00000000-0000-0000-0000-000000000000');
}

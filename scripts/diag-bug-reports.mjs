import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1].trim().replace(/^["']|["']$/g, '');
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));

console.log('=== sh_bug_reports 테이블 진단 ===');

// 1. 전체 카운트
const { count, error: cErr } = await sb
  .from('sh_bug_reports')
  .select('*', { count: 'exact', head: true });
if (cErr) { console.error('count err:', cErr); process.exit(1); }
console.log('총 레코드 수:', count);

// 2. 최근 5건
const { data: recent } = await sb
  .from('sh_bug_reports')
  .select('id, megaload_user_id, title, status, created_at')
  .order('created_at', { ascending: false })
  .limit(5);
console.log('\n최근 5건:');
for (const r of recent || []) {
  console.log(`  ${r.created_at?.slice(0,16)} | ${r.status} | ${r.title?.slice(0,40)}`);
}

// 3. 활성 사용자별 카운트
const { data: byUser } = await sb
  .from('sh_bug_reports')
  .select('megaload_user_id');
const counts = {};
for (const r of byUser || []) counts[r.megaload_user_id] = (counts[r.megaload_user_id] || 0) + 1;
console.log('\n사용자별 카운트:');
for (const [u, c] of Object.entries(counts)) console.log(`  ${u.slice(0,8)}: ${c}건`);

// 4. RLS 정책 확인
console.log('\n=== megaload_users 카운트 ===');
const { count: muCount } = await sb.from('megaload_users').select('*', { count: 'exact', head: true });
console.log('megaload_users:', muCount);

// 5. messages
const { count: mCount } = await sb.from('sh_bug_report_messages').select('*', { count: 'exact', head: true });
console.log('sh_bug_report_messages:', mCount);

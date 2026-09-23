/**
 * 아카데미 영상 챕터 업로드 — **로컬에서만 돈다.**
 *
 *   node scripts/academy-video-upload.mjs <클립폴더>
 *
 * 원본(`등록자료.mp4`)은 구글 Meet 화면공유 녹화라 그대로는 못 쓴다.
 * 화면 안에 또 브라우저가 들어 있어서 북마크바·탭 제목·작업표시줄에
 * 수강생의 개인 흔적이 그대로 남는다. ffmpeg 로 안쪽 앱 영역만 잘라낸 뒤
 * 전사본 타임코드로 스텝별 클립을 만들어 여기로 올린다.
 *
 *   ffmpeg -ss <start> -to <end> -i 원본.mp4 -vf "crop=1312:450:14:150" ... <스텝키>.mp4
 *
 * ★ 버킷은 **비공개**다. 실제 수강생 통화 녹화이므로 URL 만 알면 아무나 보는 상태로
 *   두지 않는다. 서빙은 /api/academy/video/[stepKey] 가 로그인 확인 후 서명 URL 로 준다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'academy-video';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z]/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없습니다.'); process.exit(1); }

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) { console.error('사용법: node scripts/academy-video-upload.mjs <클립폴더>'); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });

// 버킷이 없으면 만든다. public:false — 서명 URL 로만 접근한다.
const { data: buckets } = await sb.storage.listBuckets();
if (!buckets?.some((b) => b.name === BUCKET)) {
  const { error } = await sb.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: '50MB',
    allowedMimeTypes: ['video/mp4'],
  });
  if (error) { console.error('버킷 생성 실패:', error.message); process.exit(1); }
  console.log(`버킷 생성: ${BUCKET} (비공개)`);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mp4'));
if (files.length === 0) { console.error('mp4 가 없습니다:', dir); process.exit(1); }

for (const f of files) {
  const body = fs.readFileSync(path.join(dir, f));
  const { error } = await sb.storage.from(BUCKET).upload(f, body, {
    contentType: 'video/mp4',
    upsert: true,          // 다시 자르면 덮어쓴다
  });
  console.log(error ? `  ✗ ${f} — ${error.message}` : `  ✓ ${f} (${(body.length / 1024 / 1024).toFixed(1)}MB)`);
}

console.log('\n완료. 서빙은 /api/academy/video/[stepKey] 가 서명 URL 로 처리합니다.');

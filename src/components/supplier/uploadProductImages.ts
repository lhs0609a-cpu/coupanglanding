import { createClient } from '@/lib/supabase/client';

const BUCKET = 'product-images';
const typeToExt = (t: string) =>
  t === 'image/png' ? 'png' : t === 'image/webp' ? 'webp' : t === 'image/gif' ? 'gif' : 'jpg';

function nameOf(f: File, i: number): string {
  if (f.name && /\.[a-z0-9]+$/i.test(f.name)) return f.name;
  return `image-${i}.${typeToExt(f.type)}`;
}

/** 브라우저 → Supabase 스토리지 직접 업로드(서명 URL). 성공한 public URL 배열 반환. */
export async function uploadProductImages(files: File[]): Promise<string[]> {
  const imgs = files.filter((f) => f.type.startsWith('image/'));
  if (imgs.length === 0) return [];

  const meta = imgs.map((f, i) => ({ name: nameOf(f, i), size: f.size, type: f.type }));
  const res = await fetch('/api/supplier/product-image/upload-url', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: meta }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '업로드 준비 실패');
  const uploads: { path: string; token: string; publicUrl: string }[] = data.uploads || [];

  const supabase = createClient();
  const urls: string[] = [];
  for (let i = 0; i < imgs.length; i++) {
    const u = uploads[i];
    if (!u) break;
    const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(u.path, u.token, imgs[i]);
    if (!error) urls.push(u.publicUrl);
  }
  return urls;
}

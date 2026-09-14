import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import sharp from 'sharp';

export const maxDuration = 30;
const MAX_BYTES = 20 * 1024 * 1024;

/** Read only images belonging to a catalog row; never accept an arbitrary client URL. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const id = request.nextUrl.searchParams.get('id') || '';
  const group = request.nextUrl.searchParams.get('group') || '';
  const rawIndex = request.nextUrl.searchParams.get('index') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['main', 'detail', 'review'].includes(group) || !/^\d{1,4}$/.test(rawIndex)) {
    return NextResponse.json({ error: '잘못된 이미지 요청입니다.' }, { status: 400 });
  }
  const service = await createServiceClient();
  const { data, error } = await service.from('sh_naver_sourcing_products')
    .select('images, thumb, detail_status').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: '카탈로그 조회 실패' }, { status: 500 });
  if (!data || data.detail_status !== 'done') return NextResponse.json({ error: '준비된 상품이 없습니다.' }, { status: 404 });
  const groups = data.images as { main?: string[]; detail?: string[]; review?: string[] } | null;
  const urls = group === 'main' ? (groups?.main?.length ? groups.main : [data.thumb])
    : group === 'detail' ? groups?.detail : groups?.review;
  const url = urls?.[Number(rawIndex)];
  if (typeof url !== 'string') return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 404 });
  try {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.port || target.username || target.password
      || !['.pstatic.net', '.naver.net', '.naver.com'].some((suffix) => target.hostname.endsWith(suffix))) {
      return NextResponse.json({ error: '지원하지 않는 이미지 주소입니다.' }, { status: 400 });
    }
    const proxy = (process.env.COUPANG_PROXY_URL || '').replace(/\/proxy\/?$/, '').replace(/\/$/, '');
    const response = await fetch(proxy ? `${proxy}/naver-image` : url, {
      ...(proxy ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Proxy-Secret': process.env.COUPANG_PROXY_SECRET || process.env.PROXY_SECRET || '' },
        body: JSON.stringify({ url }),
      } : { headers: { Referer: 'https://shopping.naver.com/' } }),
      redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok || !response.body) throw new Error('이미지 다운로드 실패');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('이미지 용량 초과'); }
      chunks.push(value);
    }
    // Decode and normalize so an upstream HTML/SVG response cannot be served as an image.
    const output = await sharp(Buffer.concat(chunks), { limitInputPixels: 80_000_000 })
      .rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    return new NextResponse(new Uint8Array(output), { headers: {
      'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch {
    return NextResponse.json({ error: '이미지를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }
}

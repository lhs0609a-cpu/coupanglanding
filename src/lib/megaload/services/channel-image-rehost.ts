/**
 * 채널 이미지 재호스팅 — 자체호스팅 채널(네이버 등)용
 *
 * 원본 URL 들을 채널 이미지서버에 업로드하고 (원본→채널 URL) 맵 반환.
 * 캐시(sh_channel_image_assets) 우선 — 같은 원본은 재업로드 안 함.
 * 채널별 실패는 격리(맵에서 누락 → 호출측 swap 이 원본 URL 사용).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BaseAdapter } from '../adapters/base.adapter';
import type { Channel } from '../types';

function hashUrl(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** HTML 에서 <img src> URL 추출 */
export function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) urls.push(m[1]);
  return urls;
}

export async function rehostImages(
  supabase: SupabaseClient,
  adapter: BaseAdapter,
  opts: { megaloadUserId: string; channel: Channel; urls: string[] },
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(opts.urls.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)))];
  if (unique.length === 0) return map;

  // 캐시 일괄 조회
  const hashes = unique.map(hashUrl);
  const { data: cached } = await supabase
    .from('sh_channel_image_assets')
    .select('source_hash, hosted_url')
    .eq('megaload_user_id', opts.megaloadUserId)
    .eq('channel', opts.channel)
    .in('source_hash', hashes);

  const cacheByHash = new Map<string, string>();
  for (const row of (cached || []) as Array<Record<string, unknown>>) {
    cacheByHash.set(row.source_hash as string, row.hosted_url as string);
  }

  for (const url of unique) {
    const h = hashUrl(url);
    const hit = cacheByHash.get(h);
    if (hit) {
      map.set(url, hit);
      continue;
    }
    try {
      const hosted = await adapter.uploadImage(url);
      if (hosted && hosted !== url) {
        map.set(url, hosted);
        await supabase.from('sh_channel_image_assets').upsert(
          {
            megaload_user_id: opts.megaloadUserId,
            channel: opts.channel,
            source_hash: h,
            source_url: url,
            hosted_url: hosted,
          },
          { onConflict: 'megaload_user_id,channel,source_hash' },
        );
      }
    } catch (e) {
      // 실패 → 맵에 안 넣음(원본 URL 사용). 다음 사이클에 재시도.
      console.error(
        `[channel-image-rehost] ${opts.channel} 업로드 실패 ${url.slice(0, 60)}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return map;
}

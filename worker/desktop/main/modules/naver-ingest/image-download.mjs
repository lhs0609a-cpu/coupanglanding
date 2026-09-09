import sharp from 'sharp';

const PROFILES = {
  main_: { side: 1200, quality: 88 },
  detail_: { side: 1000, quality: 88 },
  review_: { side: 800, quality: 82 },
};

// Headers and the complete body share one deadline; cap decoded pixels as well as bytes.
export async function downloadImage(url, prefix, { signal, timeoutMs = 30_000, maxBytes = 24_000_000 } = {}) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('지원하지 않는 이미지 주소');
  const timed = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timed]) : timed;
  const res = await fetch(parsed, { signal: requestSignal });
  if (!res.ok) { await res.body?.cancel(); throw new Error(`HTTP ${res.status}`); }
  if (Number(res.headers.get('content-length')) > maxBytes) {
    await res.body?.cancel();
    throw new Error('이미지 다운로드 용량 초과');
  }
  const chunks = [];
  let bytes = 0;
  if (!res.body) throw new Error('빈 이미지 응답');
  for await (const chunk of res.body) {
    requestSignal.throwIfAborted();
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('이미지 다운로드 용량 초과');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  const img = sharp(raw, { limitInputPixels: 80_000_000, failOn: 'error' }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height || !['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff'].includes(meta.format)) {
    throw new Error('유효하지 않은 상품 이미지');
  }
  const profile = PROFILES[prefix] || PROFILES.main_;
  // 긴 상세페이지의 글자는 가로 폭을 유지한다. 대표/리뷰만 양쪽 변을 제한한다.
  const resize = prefix === 'detail_'
    ? { width: profile.side, withoutEnlargement: true }
    : { width: profile.side, height: profile.side, fit: 'inside', withoutEnlargement: true };
  const buf = await img.resize(resize).flatten({ background: '#ffffff' }).jpeg({ quality: profile.quality, mozjpeg: true }).toBuffer();
  requestSignal.throwIfAborted();
  return { buf, ext: 'jpg', savedBytes: raw.length - buf.length };
}

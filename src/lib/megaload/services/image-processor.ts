import { createServiceClient } from '@/lib/supabase/server';
import { randomUUID } from 'crypto';

export interface ProcessedImage {
  originalUrl: string;
  cdnUrl?: string;
  width: number;
  height: number;
  sizeKb: number;
  format: string;
  hasChineseText: boolean;
  hasWatermark: boolean;
  warnings: string[];
}

// Channel image specifications
const CHANNEL_IMAGE_SPECS: Record<string, { maxWidth: number; maxHeight: number; maxSizeKb: number; format: string }> = {
  coupang: { maxWidth: 1000, maxHeight: 1000, maxSizeKb: 5120, format: 'jpg' },
  naver: { maxWidth: 1000, maxHeight: 1000, maxSizeKb: 10240, format: 'jpg' },
  elevenst: { maxWidth: 1000, maxHeight: 1000, maxSizeKb: 3072, format: 'jpg' },
  gmarket: { maxWidth: 1000, maxHeight: 1000, maxSizeKb: 5120, format: 'jpg' },
  auction: { maxWidth: 1000, maxHeight: 1000, maxSizeKb: 5120, format: 'jpg' },
  lotteon: { maxWidth: 1000, maxHeight: 1000, maxSizeKb: 5120, format: 'jpg' },
};

// Chinese image hosting domains (AliExpress, 1688, Taobao, etc.)
const CHINESE_IMAGE_HOSTS = [
  'alicdn.com', 'aliexpress.com', 'cbu01.alicdn.com',
  'img.alicdn.com', 'sc01.alicdn.com', 'sc02.alicdn.com',
  'gw.alicdn.com', 'ae01.alicdn.com', 'ae04.alicdn.com',
  '1688.com', 'taobao.com', 'tbcdn.cn', 'tmall.com',
  'detail.1688.com', 'cbu01.alicdn.com',
  'img.china.alibaba.com',
];

// Chinese watermark common patterns in URL paths
const WATERMARK_URL_PATTERNS = [
  /watermark/i, /logo/i, /stamp/i,
  /\u6c34\u5370/, // 水印 (watermark in Chinese)
];

export async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'image/*',
    },
  });
  if (!res.ok) throw new Error(`이미지 다운로드 실패: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * 이미지 URL 기반 중국어 소스 감지
 */
export function detectChineseSource(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return CHINESE_IMAGE_HOSTS.some((host) => hostname.includes(host));
  } catch {
    return false;
  }
}

/**
 * 이미지 버퍼에서 중국어 텍스트 존재 가능성 감지 (휴리스틱)
 * - EXIF/메타데이터에서 중국어 문자열 검색
 * - URL 기반 중국 호스팅 감지
 */
export function detectChineseText(imageBuffer: Buffer, url?: string): boolean {
  // 1. URL 기반 감지
  if (url && detectChineseSource(url)) return true;

  // 2. 이미지 메타데이터 내 중국어 문자 감지 (Unicode CJK 범위)
  // EXIF, IPTC 등의 메타데이터에 중국어가 포함되어 있는지 확인
  const headerBytes = imageBuffer.subarray(0, Math.min(imageBuffer.length, 4096));
  const headerStr = headerBytes.toString('latin1');

  // CJK Unified Ideographs range check in metadata
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf]/;
  try {
    const utf8Str = headerBytes.toString('utf8');
    if (cjkPattern.test(utf8Str)) return true;
  } catch {
    // ignore encoding errors
  }

  // 3. Common Chinese image editor signatures in EXIF
  const chineseEditorPatterns = [
    'Meitu', 'XiuXiu', '\u7f8e\u56fe', // 美图
    'TaoBao', 'Alibaba', 'AliExpress',
    '\u6dd8\u5b9d', // 淘宝
    '\u963f\u91cc', // 阿里
  ];
  for (const pattern of chineseEditorPatterns) {
    if (headerStr.includes(pattern)) return true;
  }

  return false;
}

/**
 * 워터마크 가능성 감지 (URL 기반)
 */
export function detectWatermark(url: string): boolean {
  return WATERMARK_URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * 이미지 포맷 감지 (매직 바이트)
 */
export function detectImageFormat(buffer: Buffer): string {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'gif';
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return 'webp';
  return 'unknown';
}

/**
 * JPEG에서 이미지 크기 추출
 */
function getJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xFF) break;
    const marker = buffer[offset + 1];
    // SOF markers (baseline, progressive, etc.)
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }
  return null;
}

/**
 * PNG에서 이미지 크기 추출
 */
function getPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

/**
 * 이미지 크기 추출
 */
export function getImageDimensions(buffer: Buffer, format: string): { width: number; height: number } {
  if (format === 'jpg') {
    const dims = getJpegDimensions(buffer);
    if (dims) return dims;
  }
  if (format === 'png') {
    const dims = getPngDimensions(buffer);
    if (dims) return dims;
  }
  return { width: 0, height: 0 };
}

export function getChannelImageSpec(channel: string) {
  return CHANNEL_IMAGE_SPECS[channel] || CHANNEL_IMAGE_SPECS.coupang;
}

/**
 * 이미지를 채널 규격에 맞게 처리하고 Supabase Storage에 업로드
 */
export async function processImageForChannel(
  imageUrl: string,
  channel: string,
  megaloadUserId?: string
): Promise<ProcessedImage> {
  const warnings: string[] = [];
  const spec = getChannelImageSpec(channel);

  // 1. 이미지 다운로드
  const buffer = await downloadImage(imageUrl);
  const sizeKb = Math.round(buffer.length / 1024);
  const format = detectImageFormat(buffer);
  const dimensions = getImageDimensions(buffer, format);

  // 2. 중국어 텍스트/워터마크 감지
  const hasChineseText = detectChineseText(buffer, imageUrl);
  const hasWatermark = detectWatermark(imageUrl);

  if (hasChineseText) {
    warnings.push('중국어 소스 이미지 감지됨 — 상품 등록 전 이미지 교체를 권장합니다.');
  }
  if (hasWatermark) {
    warnings.push('워터마크가 포함되어 있을 수 있습니다.');
  }

  // 3. 크기 검증
  if (sizeKb > spec.maxSizeKb) {
    warnings.push(`이미지 크기(${sizeKb}KB)가 ${channel} 최대(${spec.maxSizeKb}KB)를 초과합니다.`);
  }
  if (dimensions.width > spec.maxWidth || dimensions.height > spec.maxHeight) {
    warnings.push(`이미지 해상도(${dimensions.width}x${dimensions.height})가 ${channel} 최대(${spec.maxWidth}x${spec.maxHeight})를 초과합니다. 리사이징이 필요합니다.`);
  }

  // 4. Supabase Storage에 업로드 (CDN 미러링)
  let cdnUrl = imageUrl;
  if (megaloadUserId) {
    try {
      const supabase = await createServiceClient();
      const ext = format === 'unknown' ? 'jpg' : format;
      const filePath = `megaload/${megaloadUserId}/${channel}/${randomUUID()}.${ext}`;
      const contentType = format === 'png' ? 'image/png' : format === 'gif' ? 'image/gif' : format === 'webp' ? 'image/webp' : 'image/jpeg';

      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(filePath, buffer, {
          contentType,
          cacheControl: '31536000',
          upsert: false,
        });

      if (!error && data) {
        const { data: publicData } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);
        cdnUrl = publicData.publicUrl;
      } else if (error) {
        warnings.push(`CDN 업로드 실패: ${error.message}`);
      }
    } catch (err) {
      warnings.push(`CDN 업로드 오류: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return {
    originalUrl: imageUrl,
    cdnUrl,
    width: dimensions.width,
    height: dimensions.height,
    sizeKb,
    format,
    hasChineseText,
    hasWatermark,
    warnings,
  };
}

/**
 * 여러 이미지를 일괄 처리
 */
export async function processImagesForChannel(
  imageUrls: string[],
  channel: string,
  megaloadUserId?: string
): Promise<ProcessedImage[]> {
  const results: ProcessedImage[] = [];
  for (const url of imageUrls) {
    try {
      const result = await processImageForChannel(url, channel, megaloadUserId);
      results.push(result);
    } catch (err) {
      results.push({
        originalUrl: url,
        width: 0,
        height: 0,
        sizeKb: 0,
        format: 'unknown',
        hasChineseText: false,
        hasWatermark: false,
        warnings: [`처리 실패: ${err instanceof Error ? err.message : 'unknown'}`],
      });
    }
  }
  return results;
}

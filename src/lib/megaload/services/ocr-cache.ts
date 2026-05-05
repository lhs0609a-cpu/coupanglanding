// ============================================================
// OCR 결과 캐싱 서비스
//
// - 파일 캐시: {productFolder}/ocr_cache.json (재등록 시 API 호출 불필요)
// - 인메모리 캐시: Map (같은 배치 내 중복 방지)
// - 이미지 해시 기반 무효화
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface OcrCacheEntry {
  specs: Record<string, string>;
  imageHash: string;
  timestamp: number;
}

// 인메모리 캐시 (배치 내 중복 방지)
const memoryCache = new Map<string, OcrCacheEntry>();

// Vercel 프로덕션은 파일시스템 읽기전용 + 사용자 PC 폴더 경로는 서버에 존재하지 않음.
// 모듈 로드 시 한 번만 판정하여 파일 read/write 의 dead work 회피 (인메모리 캐시는 유지).
const FS_AVAILABLE = (() => {
  if (typeof window !== 'undefined') return false;
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) return false;
  return true;
})();

/** 이미지 파일들의 해시를 생성 (변경 감지용) */
function computeImageHash(imagePaths: string[]): string {
  const hash = crypto.createHash('md5');
  for (const p of imagePaths.sort()) {
    try {
      const stat = fs.statSync(p);
      // 파일 크기 + 수정 시간 기반 빠른 해시 (전체 내용 읽기보다 빠름)
      hash.update(`${p}:${stat.size}:${stat.mtimeMs}`);
    } catch {
      hash.update(`${p}:missing`);
    }
  }
  return hash.digest('hex');
}

/** 캐시 키 생성 (폴더 경로 기반) */
function getCacheKey(folderPath: string): string {
  return path.resolve(folderPath);
}

/** 파일 캐시 경로 */
function getCacheFilePath(folderPath: string): string {
  return path.join(folderPath, 'ocr_cache.json');
}

/**
 * 캐시에서 OCR 결과를 조회한다.
 * 인메모리 → 파일 순으로 확인.
 * 이미지 해시가 불일치하면 캐시 무효.
 */
export function getOcrCache(folderPath: string, imagePaths: string[]): Record<string, string> | null {
  const key = getCacheKey(folderPath);
  const currentHash = computeImageHash(imagePaths);

  // 1. 인메모리 캐시 확인
  const memEntry = memoryCache.get(key);
  if (memEntry && memEntry.imageHash === currentHash) {
    return memEntry.specs;
  }

  // 2. 파일 캐시 확인 (Vercel 등 fs 미사용 환경은 즉시 스킵)
  if (FS_AVAILABLE) {
    const cacheFile = getCacheFilePath(folderPath);
    try {
      if (fs.existsSync(cacheFile)) {
        const raw = fs.readFileSync(cacheFile, 'utf-8');
        const entry: OcrCacheEntry = JSON.parse(raw);
        if (entry.imageHash === currentHash) {
          // 인메모리에도 올림
          memoryCache.set(key, entry);
          return entry.specs;
        }
      }
    } catch {
      // 캐시 파일 손상 — 무시
    }
  }

  return null;
}

/**
 * OCR 결과를 캐시에 저장한다.
 * 인메모리 + 파일 동시 저장.
 */
export function setOcrCache(
  folderPath: string,
  imagePaths: string[],
  specs: Record<string, string>,
): void {
  const key = getCacheKey(folderPath);
  const entry: OcrCacheEntry = {
    specs,
    imageHash: computeImageHash(imagePaths),
    timestamp: Date.now(),
  };

  // 인메모리 저장
  memoryCache.set(key, entry);

  // 파일 저장 (Vercel 등 fs 미사용 환경은 스킵 — write 가 항상 실패)
  if (!FS_AVAILABLE) return;
  try {
    const cacheFile = getCacheFilePath(folderPath);
    fs.writeFileSync(cacheFile, JSON.stringify(entry, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[ocr-cache] 파일 캐시 저장 실패:', err instanceof Error ? err.message : err);
  }
}

/** 인메모리 캐시 전체 초기화 (테스트용) */
export function clearOcrMemoryCache(): void {
  memoryCache.clear();
}

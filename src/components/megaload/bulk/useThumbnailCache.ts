import { useRef, useCallback } from 'react';
import type { EditableProduct } from './types';

const MAX_CACHE = 200;

interface ThumbnailEntry {
  url: string;
  lastAccessed: number;
}

export function useThumbnailCache(
  products: EditableProduct[],
  imagePreuploadCache: Record<string, { mainImageUrls: string[] }>,
) {
  const cache = useRef<Map<string, ThumbnailEntry>>(new Map());
  const pending = useRef<Set<string>>(new Set());

  const evictOldest = useCallback(() => {
    const c = cache.current;
    if (c.size <= MAX_CACHE) return;
    const entries = [...c.entries()].sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    const toRemove = entries.slice(0, c.size - MAX_CACHE);
    for (const [key, entry] of toRemove) {
      if (entry.url.startsWith('blob:')) {
        URL.revokeObjectURL(entry.url);
      }
      c.delete(key);
    }
  }, []);

  const getThumbnail = useCallback((uid: string): string | null => {
    // Check memory cache
    const cached = cache.current.get(uid);
    if (cached) {
      cached.lastAccessed = Date.now();
      return cached.url;
    }

    // Check CDN cache (server mode)
    const preupload = imagePreuploadCache[uid];
    if (preupload?.mainImageUrls?.[0]) {
      const url = preupload.mainImageUrls[0];
      cache.current.set(uid, { url, lastAccessed: Date.now() });
      evictOldest();
      return url;
    }

    return null;
  }, [imagePreuploadCache, evictOldest]);

  const loadThumbnail = useCallback(async (uid: string): Promise<string | null> => {
    if (cache.current.has(uid) || pending.current.has(uid)) {
      return getThumbnail(uid);
    }

    const product = products.find(p => p.uid === uid);
    if (!product) return null;

    // Browser mode: read from FileSystemFileHandle
    if (product.scannedMainImages?.[0]?.handle) {
      pending.current.add(uid);
      try {
        const file = await product.scannedMainImages[0].handle.getFile();
        const url = URL.createObjectURL(file);
        cache.current.set(uid, { url, lastAccessed: Date.now() });
        evictOldest();
        return url;
      } catch {
        return null;
      } finally {
        pending.current.delete(uid);
      }
    }

    return null;
  }, [products, getThumbnail, evictOldest]);

  const cleanup = useCallback(() => {
    for (const [, entry] of cache.current) {
      if (entry.url.startsWith('blob:')) {
        URL.revokeObjectURL(entry.url);
      }
    }
    cache.current.clear();
  }, []);

  return { getThumbnail, loadThumbnail, cleanup };
}

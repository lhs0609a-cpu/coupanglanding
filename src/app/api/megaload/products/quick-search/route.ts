import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';
import fs from 'fs/promises';
import path from 'path';

export const maxDuration = 30;


interface CsvProduct {
  id: string;
  name: string;
  url: string;
}

const CSV_CACHE_TTL_MS = 10 * 60 * 1000;
let csvCache: CsvProduct[] | null = null;
let csvCacheAt = 0;

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(current.trim()); current = ''; }
      else current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

async function loadCsvProducts(): Promise<CsvProduct[]> {
  const now = Date.now();
  if (csvCache && now - csvCacheAt < CSV_CACHE_TTL_MS) return csvCache;
  try {
    const csvPath = path.join(process.cwd(), 'public', 'data', 'product-list.csv');
    const csv = await fs.readFile(csvPath, 'utf8');
    const products: CsvProduct[] = [];
    for (const raw of csv.split('\n')) {
      const line = raw.replace(/\r$/, '');
      if (!line.trim()) continue;
      const fields = parseCsvLine(line);
      if (fields.length < 2) continue;
      let url = '';
      for (const v of fields) {
        if (!url && /^https?:\/\//i.test(v)) { url = v; break; }
      }
      products.push({ id: fields[0], name: fields[1], url });
    }
    csvCache = products;
    csvCacheAt = now;
    return products;
  } catch {
    return [];
  }
}

/**
 * 퀵서치: 상품명/브랜드/상품번호로 검색 → 매칭 상품 목록 반환
 * GET /api/megaload/products/quick-search?q=성진바이오
 */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q) {
      return NextResponse.json({ results: [] });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ results: [] }, { status: 401 });
    }

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch {
      return NextResponse.json({ results: [] }, { status: 401 });
    }

    // 상품명, 브랜드, 상품코드에서 검색 (최대 20개)
    const { data } = await supabase
      .from('sh_products')
      .select('id, product_name, display_name, brand, coupang_product_id, raw_data, created_at')
      .eq('megaload_user_id', shUserId)
      .neq('status', 'deleted')
      .or(`product_name.ilike.%${q}%,display_name.ilike.%${q}%,brand.ilike.%${q}%,manufacturer.ilike.%${q}%,coupang_product_id.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    const dbResults = (data || []).map((item) => {
      const raw = item.raw_data as Record<string, unknown> | null;
      return {
        id: item.id,
        productName: item.product_name || item.display_name || '',
        brand: item.brand || '',
        coupangProductId: item.coupang_product_id || '',
        sourceUrl: (raw?.sourceUrl as string) || null,
      };
    });

    // CSV (자동 위탁 플랫폼 상품 리스트) 토큰 매칭: 공백/하이픈 분리 AND 매칭
    const tokens = q.toLowerCase().split(/[\s\-]+/).filter((t) => t.length > 0);
    const csvProducts = await loadCsvProducts();
    const csvMatches = tokens.length === 0
      ? []
      : csvProducts
          .filter((p) => {
            const hay = `${p.id} ${p.name} ${p.url}`.toLowerCase();
            return tokens.every((t) => hay.includes(t));
          })
          .slice(0, 20)
          .map((p) => ({
            id: `csv:${p.id}`,
            productName: p.name,
            brand: '',
            coupangProductId: p.id,
            sourceUrl: p.url || null,
          }));

    // DB 결과 우선, CSV 결과는 DB에 없는 ID만 추가
    const seen = new Set(dbResults.map((r) => r.coupangProductId).filter(Boolean));
    const merged = [
      ...dbResults,
      ...csvMatches.filter((r) => !seen.has(r.coupangProductId)),
    ];

    return NextResponse.json({ results: merged, total: merged.length });
  } catch {
    return NextResponse.json({ results: [] });
  }
}

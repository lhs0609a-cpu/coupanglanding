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
      return NextResponse.json({ results: [], error: '로그인 필요' }, { status: 401 });
    }

    const serviceClient = await createServiceClient();
    let shUserId: string;
    try {
      shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);
    } catch (e) {
      console.warn('[quick-search] ensureMegaloadUser 실패:', e instanceof Error ? e.message : e);
      return NextResponse.json({ results: [], error: '메가로드 계정 없음' }, { status: 401 });
    }

    // PostgREST .or() 의 syntax-breaking 문자 escape — comma/괄호/and/or 키워드가 q 에 들어와도
    // SQL injection 이 아닌 PostgREST 파서가 깨져 500 을 던지므로 사전 제거 (백슬래시는 PostgREST 가 안 받음).
    // 대신 ilike 와이일드카드 충돌 가능한 %, _ 도 escape.
    const qSafe = q.replace(/[,()%_]/g, ' ').trim();
    if (!qSafe) {
      return NextResponse.json({ results: [] });
    }

    // 상품명, 브랜드, 상품코드에서 검색 (최대 20개)
    // RLS 가 admin/일반사용자 다 통과하는 경우 supabase, 아닌 경우 serviceClient 폴백
    const runQuery = async (client: typeof supabase) => client
      .from('sh_products')
      .select('id, product_name, display_name, brand, coupang_product_id, raw_data, created_at')
      .eq('megaload_user_id', shUserId)
      .neq('status', 'deleted')
      .or(`product_name.ilike.%${qSafe}%,display_name.ilike.%${qSafe}%,brand.ilike.%${qSafe}%,manufacturer.ilike.%${qSafe}%,coupang_product_id.ilike.%${qSafe}%`)
      .order('created_at', { ascending: false })
      .limit(20);

    let { data, error: dbErr } = await runQuery(supabase);
    if (dbErr) {
      console.warn('[quick-search] RLS 쿼리 실패, serviceClient 폴백:', dbErr.message);
      const fallback = await runQuery(serviceClient);
      data = fallback.data;
      dbErr = fallback.error;
    }
    if (dbErr) {
      console.error('[quick-search] DB 쿼리 실패 (서비스 클라이언트):', dbErr.message);
      return NextResponse.json({ results: [], error: `DB 오류: ${dbErr.message}` }, { status: 500 });
    }

    // ─── 옵션 레벨 검색: 옵션명/SKU/raw_data 에 코드가 박힌 경우 ───
    // 예: 옵션명 "5/26일 출고 5CBE-281526032,1개" 처럼 sellerProductId 가 텍스트에 임베드되어
    //     마스터 필드 검색만으로는 찾을 수 없는 케이스.
    const seenProductIds = new Set((data || []).map((r) => r.id));
    const optionQuery = async (client: typeof supabase) => client
      .from('sh_product_options')
      .select('product_id, sku, option_name, option_value, raw_data, sh_products!inner(id, product_name, display_name, brand, coupang_product_id, raw_data, megaload_user_id, status)')
      .eq('sh_products.megaload_user_id', shUserId)
      .neq('sh_products.status', 'deleted')
      .or(`sku.ilike.%${qSafe}%,option_name.ilike.%${qSafe}%,option_value.ilike.%${qSafe}%`)
      .limit(20);
    let { data: optionData, error: optErr } = await optionQuery(supabase);
    if (optErr) {
      const fallback = await optionQuery(serviceClient);
      optionData = fallback.data;
      optErr = fallback.error;
    }
    if (optErr) {
      console.warn('[quick-search] 옵션 검색 실패 (무시):', optErr.message);
    }
    const optionMatches = (optionData || []).flatMap((row) => {
      const parent = (row as unknown as { sh_products: { id: string; product_name: string; display_name: string | null; brand: string | null; coupang_product_id: string | null; raw_data: Record<string, unknown> | null } }).sh_products;
      if (!parent || seenProductIds.has(parent.id)) return [];
      seenProductIds.add(parent.id);
      return [{
        id: parent.id,
        productName: parent.product_name || parent.display_name || '',
        brand: parent.brand || '',
        coupangProductId: parent.coupang_product_id || '',
        sourceUrl: (parent.raw_data?.sourceUrl as string) || null,
      }];
    });

    const dbResults = [
      ...(data || []).map((item) => {
        const raw = item.raw_data as Record<string, unknown> | null;
        return {
          id: item.id,
          productName: item.product_name || item.display_name || '',
          brand: item.brand || '',
          coupangProductId: item.coupang_product_id || '',
          sourceUrl: (raw?.sourceUrl as string) || null,
        };
      }),
      ...optionMatches,
    ];

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
  } catch (err) {
    // silent fail 금지 — 어디서 throw 됐는지 로그에 남기고 5xx 로 반환
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[quick-search] 예외 발생:', msg, err instanceof Error ? err.stack : '');
    return NextResponse.json({ results: [], error: msg }, { status: 500 });
  }
}

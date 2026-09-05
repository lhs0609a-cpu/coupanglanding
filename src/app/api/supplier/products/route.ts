/**
 * GET  /api/supplier/products         → 내 카탈로그 상품 목록
 * POST /api/supplier/products  {...}   → 상품 등록 (카드 게이트 + preflight)
 *   submit=true 면 검수대기(pending), 아니면 임시저장(draft).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getSupplierByProfile, checkUploadGate } from '@/lib/megaload/supplier/ensure-supplier';

export const maxDuration = 30;

interface OptionInput {
  option_name?: string; supply_price?: number; stock?: number;
  stock_buffer?: number; sku?: string; barcode?: string; purchase_url?: string;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceClient = await createServiceClient();
  const supplier = await getSupplierByProfile(serviceClient, user.id);
  if (!supplier) return NextResponse.json({ products: [] });

  const { data } = await serviceClient
    .from('supplier_products')
    .select('*, options:supplier_product_options(*)')
    .eq('supplier_id', supplier.id)
    .order('created_at', { ascending: false });
  return NextResponse.json({ products: data || [] });
}

/** 제출 전 최소 검증 — 쿠팡 통과에 필요한 필수값 */
function preflight(body: Record<string, unknown>, options: OptionInput[]): string[] {
  const missing: string[] = [];
  if (!body.seller_product_name) missing.push('상품명');
  if (!body.category_code) missing.push('카테고리');
  if (!body.thumbnail_url) missing.push('대표 썸네일 이미지');
  const min = Number(body.min_price) || 0;
  const max = Number(body.max_price) || 0;
  if (min <= 0 || max <= 0) missing.push('판매가 범위(min/max)');
  if (max < min) missing.push('판매가 범위 오류(max ≥ min)');
  if (options.length === 0) missing.push('옵션 1개 이상');
  if (options.some((o) => !(Number(o.supply_price) > 0))) missing.push('옵션 공급가(>0)');
  return missing;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceClient = await createServiceClient();
  const supplier = await getSupplierByProfile(serviceClient, user.id);
  const gate = checkUploadGate(supplier);
  if (!gate.canUpload) {
    return NextResponse.json({ error: gate.reason, code: 'UPLOAD_GATED' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const options: OptionInput[] = Array.isArray(body.options) ? body.options : [];
  const submit = body.submit === true;

  if (submit) {
    const missing = preflight(body, options);
    if (missing.length > 0) {
      return NextResponse.json({ error: `등록에 필요한 항목이 비어 있습니다: ${missing.join(', ')}`, missing }, { status: 400 });
    }
  }

  // 상품 insert
  const { data: product, error: pErr } = await serviceClient
    .from('supplier_products')
    .insert({
      supplier_id: supplier!.id,
      category_code: body.category_code ?? null,
      category_path: body.category_path ?? null,
      seller_product_name: body.seller_product_name ?? '(제목 없음)',
      display_product_name: body.display_product_name ?? null,
      brand: body.brand ?? null,
      manufacturer: body.manufacturer ?? null,
      origin: body.origin ?? null,
      search_tags: Array.isArray(body.search_tags) ? body.search_tags : [],
      thumbnail_url: body.thumbnail_url ?? null,
      image_urls: Array.isArray(body.image_urls) ? body.image_urls : [],
      detail_html: body.detail_html ?? null,
      notices: body.notices ?? {},
      attributes: body.attributes ?? {},
      certifications: body.certifications ?? [],
      min_price: Number(body.min_price) || 0,
      max_price: Number(body.max_price) || 0,
      shipping_profile: body.shipping_profile ?? {},
      status: submit ? 'pending' : 'draft',
    })
    .select('*')
    .single();

  if (pErr || !product) {
    return NextResponse.json({ error: `상품 저장 실패: ${pErr?.message || '알 수 없음'}` }, { status: 500 });
  }

  // 옵션 insert
  if (options.length > 0) {
    const rows = options.map((o, i) => ({
      catalog_product_id: product.id,
      option_name: o.option_name || '기본',
      supply_price: Number(o.supply_price) || 0,
      stock: Number(o.stock) || 0,
      stock_buffer: Number(o.stock_buffer) || 0,
      sku: o.sku || null,
      barcode: o.barcode || null,
      purchase_url: o.purchase_url || null,
      sort_order: i,
    }));
    const { error: oErr } = await serviceClient.from('supplier_product_options').insert(rows);
    if (oErr) {
      // 옵션 실패 시 상품도 롤백(정합성)
      await serviceClient.from('supplier_products').delete().eq('id', product.id);
      return NextResponse.json({ error: `옵션 저장 실패: ${oErr.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, product, status: product.status });
}

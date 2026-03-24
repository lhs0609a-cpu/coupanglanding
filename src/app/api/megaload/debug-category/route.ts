import { NextRequest, NextResponse } from 'next/server';
import { matchCategoryBatch } from '@/lib/megaload/services/category-matcher';

/**
 * 디버그용: 인증 없이 카테고리 매칭 테스트
 * GET /api/megaload/debug-category?names=비오틴+60정,오메가3+120캡슐
 * POST /api/megaload/debug-category  body: { productNames: string[] }
 */
export async function GET(req: NextRequest) {
  const names = req.nextUrl.searchParams.get('names');
  if (!names) {
    return NextResponse.json({
      usage: 'GET /api/megaload/debug-category?names=비오틴+60정,오메가3+120캡슐',
      usage2: 'POST /api/megaload/debug-category body: { productNames: ["비오틴 60정"] }',
    });
  }

  const productNames = names.split(',').map((n) => decodeURIComponent(n.trim()));
  try {
    console.log('[debug-category] testing', productNames.length, 'products:', productNames);
    const { results, failures } = await matchCategoryBatch(productNames);
    const matched = results.filter((r) => r !== null);
    console.log('[debug-category] matched:', matched.length, '/', results.length);
    return NextResponse.json({
      total: productNames.length,
      matched: matched.length,
      failures,
      results: results.map((r, i) => ({
        name: productNames[i],
        ...(r || { categoryCode: '', categoryName: '', categoryPath: '', confidence: 0, source: 'none' }),
      })),
    });
  } catch (err) {
    console.error('[debug-category] ERROR:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { productNames: string[] };
    if (!body.productNames || body.productNames.length === 0) {
      return NextResponse.json({ error: 'productNames required' }, { status: 400 });
    }

    console.log('[debug-category] POST testing', body.productNames.length, 'products');
    console.log('[debug-category] first 3:', body.productNames.slice(0, 3));
    const { results, failures } = await matchCategoryBatch(body.productNames);
    const matched = results.filter((r) => r !== null);
    console.log('[debug-category] matched:', matched.length, '/', results.length);

    return NextResponse.json({
      total: body.productNames.length,
      matched: matched.length,
      failures,
      results: results.map((r, i) => ({
        name: body.productNames[i],
        ...(r || { categoryCode: '', categoryName: '', categoryPath: '', confidence: 0, source: 'none' }),
      })),
    });
  } catch (err) {
    console.error('[debug-category] ERROR:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }, { status: 500 });
  }
}

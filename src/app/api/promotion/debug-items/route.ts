import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import type { CoupangCredentials } from '@/lib/utils/coupang-api-client';

const SELLER_BASE_PATH = '/v2/providers/seller_api/apis/api/v1/marketplace';

/** GET: 첫 번째 상품의 전체 API 응답 구조를 반환 (디버깅용) */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('coupang_vendor_id, coupang_access_key, coupang_secret_key, coupang_api_connected')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!ptUser?.coupang_api_connected) {
      return NextResponse.json({ error: 'API 미연동' }, { status: 400 });
    }

    const credentials: CoupangCredentials = {
      vendorId: ptUser.coupang_vendor_id,
      accessKey: await decryptPassword(ptUser.coupang_access_key),
      secretKey: await decryptPassword(ptUser.coupang_secret_key),
    };

    // seller-products API에서 첫 1개만 가져오기
    const { formatSignedDate, buildAuthorizationHeader } = await import('@/lib/utils/coupang-hmac');

    const PROXY_URL = process.env.COUPANG_PROXY_URL;
    const PROXY_SECRET = process.env.COUPANG_PROXY_SECRET || process.env.PROXY_SECRET || '';
    const path = `${SELLER_BASE_PATH}/seller-products?vendorId=${credentials.vendorId}&status=APPROVED&maxPerPage=1`;

    const useProxy = !!PROXY_URL;
    const url = useProxy ? `${PROXY_URL}/proxy${path}` : `https://api-gateway.coupang.com${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json;charset=UTF-8',
    };

    if (useProxy) {
      headers['X-Coupang-Access-Key'] = credentials.accessKey;
      headers['X-Coupang-Secret-Key'] = credentials.secretKey;
      headers['X-Coupang-Vendor-Id'] = credentials.vendorId;
      if (PROXY_SECRET) headers['X-Proxy-Secret'] = PROXY_SECRET;
    } else {
      const datetime = formatSignedDate();
      headers['Authorization'] = await buildAuthorizationHeader(
        credentials.accessKey, credentials.secretKey, 'GET', path, datetime,
      );
      headers['X-Requested-By'] = credentials.vendorId;
    }

    const res = await fetch(url, { method: 'GET', headers });
    const json = await res.json();

    // 첫 상품의 items 배열 구조 분석
    const products = Array.isArray(json.data) ? json.data : [];
    const firstProduct = products[0] || {};
    const items = Array.isArray(firstProduct.items) ? firstProduct.items : [];
    const firstItem = items[0] || {};

    return NextResponse.json({
      vendorId: credentials.vendorId,
      productCount: products.length,
      firstProduct: {
        keys: Object.keys(firstProduct),
        sellerProductId: firstProduct.sellerProductId,
        sellerProductName: firstProduct.sellerProductName,
        itemCount: items.length,
      },
      firstItem: {
        keys: Object.keys(firstItem),
        fullData: firstItem,
      },
      allItemFields: items.map((item: Record<string, unknown>, i: number) => ({
        index: i,
        vendorItemId: item.vendorItemId,
        itemId: item.itemId,
        id: item.id,
        optionId: item.optionId,
        allKeys: Object.keys(item),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decryptPassword } from '@/lib/utils/encryption';
import type { CoupangCredentials } from '@/lib/utils/coupang-api-client';

const SELLER_BASE_PATH = '/v2/providers/seller_api/apis/api/v1/marketplace';

async function callApi(credentials: CoupangCredentials, path: string) {
  const PROXY_URL = process.env.COUPANG_PROXY_URL;
  const PROXY_SECRET = process.env.COUPANG_PROXY_SECRET || process.env.PROXY_SECRET || '';
  const { formatSignedDate, buildAuthorizationHeader } = await import('@/lib/utils/coupang-hmac');

  const useProxy = !!PROXY_URL;
  const url = useProxy ? `${PROXY_URL}/proxy${path}` : `https://api-gateway.coupang.com${path}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json;charset=UTF-8' };
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
  return res.json();
}

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

    // Step 1: 상품 목록에서 첫 5개 상품 가져오기
    const listPath = `${SELLER_BASE_PATH}/seller-products?vendorId=${credentials.vendorId}&status=APPROVED&maxPerPage=5`;
    const listData = await callApi(credentials, listPath);
    const products = Array.isArray(listData.data) ? listData.data : [];

    // Step 2: 첫 번째 상품의 상세 조회 (옵션ID 포함)
    let productDetail = null;
    let detailError = null;
    if (products.length > 0) {
      const spId = products[0].sellerProductId;
      try {
        const detailPath = `${SELLER_BASE_PATH}/seller-products/${spId}`;
        productDetail = await callApi(credentials, detailPath);
      } catch (err) {
        detailError = String(err);
      }
    }

    // Step 3: 상세 조회에서 items 추출
    const detailData = productDetail?.data || productDetail;
    const detailItems = Array.isArray(detailData?.items) ? detailData.items : [];

    return NextResponse.json({
      vendorId: credentials.vendorId,
      // 목록 API 결과
      listApi: {
        productCount: products.length,
        firstProductKeys: Object.keys(products[0] || {}),
        firstProductId: products[0]?.sellerProductId,
        firstProductItems: Array.isArray(products[0]?.items) ? products[0].items.length : 'no items array',
        products: products.map((p: Record<string, unknown>) => ({
          sellerProductId: p.sellerProductId,
          productId: p.productId,
          itemCount: Array.isArray(p.items) ? p.items.length : 0,
          itemsSample: Array.isArray(p.items) ? p.items.slice(0, 2) : 'none',
        })),
      },
      // 상세 API 결과
      detailApi: {
        error: detailError,
        topKeys: Object.keys(detailData || {}),
        sellerProductId: detailData?.sellerProductId,
        productId: detailData?.productId,
        itemCount: detailItems.length,
        firstItemKeys: detailItems.length > 0 ? Object.keys(detailItems[0]) : [],
        firstItemFull: detailItems.length > 0 ? detailItems[0] : null,
        allItemIds: detailItems.map((item: Record<string, unknown>) => ({
          vendorItemId: item.vendorItemId,
          itemId: item.itemId,
          id: item.id,
          optionId: item.optionId,
          allNumericFields: Object.entries(item)
            .filter(([, v]) => typeof v === 'number' && v > 1000000)
            .map(([k, v]) => `${k}=${v}`),
        })),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

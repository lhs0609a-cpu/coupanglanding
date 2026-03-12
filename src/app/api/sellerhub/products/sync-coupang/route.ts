import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/sellerhub/adapters/factory';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'SellerHub 계정이 없습니다' }, { status: 404 });

    const serviceClient = await createServiceClient();
    const shUserId = (shUser as Record<string, unknown>).id as string;

    // sync job 생성
    const { data: job } = await serviceClient
      .from('sh_sync_jobs')
      .insert({ sellerhub_user_id: shUserId, channel: 'coupang', job_type: 'product_sync', status: 'running' })
      .select()
      .single();
    const jobId = (job as Record<string, unknown>)?.id as string;

    try {
      const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');

      let page = 1;
      let totalSynced = 0;
      let hasMore = true;

      while (hasMore) {
        const result = await adapter.getProducts({ page, size: 100, status: 'APPROVE' });
        const items = result.items;

        if (items.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of items) {
          const productId = String(item.sellerProductId || item.productId || '');
          const productName = String(item.sellerProductName || item.productName || '');

          // Upsert master product
          await serviceClient
            .from('sh_products')
            .upsert({
              sellerhub_user_id: shUserId,
              coupang_product_id: productId,
              product_name: productName,
              management_name: productName.slice(0, 50),
              category_id: String(item.categoryId || ''),
              brand: String(item.brand || ''),
              status: 'active',
              raw_data: item,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'sellerhub_user_id,coupang_product_id' });

          // Upsert options/SKU
          const sellerProductItems = (item.sellerProductItemList || item.items || []) as Record<string, unknown>[];
          for (const opt of sellerProductItems) {
            const optionId = String(opt.vendorItemId || opt.itemId || '');
            await serviceClient
              .from('sh_product_options')
              .upsert({
                product_id: productId,
                sellerhub_user_id: shUserId,
                option_name: String(opt.itemName || opt.optionName || '기본'),
                sku: String(opt.externalVendorSku || opt.sellerItemCode || optionId),
                barcode: String(opt.barcode || ''),
                sale_price: Number(opt.salePrice || opt.originalPrice || 0),
                cost_price: Number(opt.supplyPrice || 0),
                stock: Number(opt.maximumBuyCount || opt.outboundShippingPlaceMaximumBuyCount || 0),
                channel_option_id: optionId,
                raw_data: opt,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'sellerhub_user_id,sku' });
          }

          totalSynced++;
        }

        page++;
        if (items.length < 100) hasMore = false;
      }

      // job 완료
      if (jobId) {
        await serviceClient
          .from('sh_sync_jobs')
          .update({ status: 'completed', result: { synced: totalSynced }, completed_at: new Date().toISOString() })
          .eq('id', jobId);
      }

      return NextResponse.json({ success: true, synced: totalSynced });
    } catch (err) {
      if (jobId) {
        await serviceClient
          .from('sh_sync_jobs')
          .update({ status: 'failed', error_message: err instanceof Error ? err.message : 'Unknown error' })
          .eq('id', jobId);
      }
      throw err;
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '동기화 실패' }, { status: 500 });
  }
}

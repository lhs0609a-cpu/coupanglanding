import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { AliexpressAdapter } from '@/lib/megaload/adapters/aliexpress.adapter';
import { Ali1688Adapter } from '@/lib/megaload/adapters/ali1688.adapter';
import { getAllAuthenticatedAdapters } from '@/lib/megaload/adapters/factory';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceClient();

  const { data: products } = await supabase
    .from('sh_sourcing_products')
    .select('*, megaload_user_id')
    .eq('status', 'registered');

  if (!products || products.length === 0) {
    return NextResponse.json({ message: '동기화할 소싱 상품 없음' });
  }

  let synced = 0;
  let priceChanged = 0;
  let outOfStock = 0;

  // 셀러별 소싱 소스 캐시
  const sourceCache = new Map<string, Record<string, unknown>>();

  for (const product of products) {
    const p = product as Record<string, unknown>;
    const shUserId = p.megaload_user_id as string;
    const platform = p.platform as string;

    try {
      // 소싱 소스 자격증명 조회 (캐시)
      const cacheKey = `${shUserId}:${platform}`;
      let sourceCreds = sourceCache.get(cacheKey);
      if (!sourceCreds) {
        const { data: source } = await supabase
          .from('sh_sourcing_sources')
          .select('credentials')
          .eq('megaload_user_id', shUserId)
          .eq('platform', platform)
          .maybeSingle();
        if (source) {
          sourceCreds = (source as Record<string, unknown>).credentials as Record<string, unknown>;
          sourceCache.set(cacheKey, sourceCreds);
        }
      }
      if (!sourceCreds) { synced++; continue; }

      // 플랫폼 API로 현재 가격/재고 조회
      let currentPrice = 0;
      let isAvailable = true;

      if (platform === 'aliexpress') {
        const adapter = new AliexpressAdapter();
        await adapter.authenticate(sourceCreds);
        const info = await adapter.getProduct(p.platform_product_id as string);
        currentPrice = Number((info as Record<string, unknown>).price || 0);
        isAvailable = Boolean((info as Record<string, unknown>).isAvailable);
      } else if (platform === 'ali1688') {
        const adapter = new Ali1688Adapter();
        await adapter.authenticate(sourceCreds);
        const info = await adapter.getProduct(p.platform_product_id as string);
        currentPrice = Number((info as Record<string, unknown>).price || 0);
        isAvailable = Boolean((info as Record<string, unknown>).isAvailable);
      }

      const prevPrice = Number(p.original_price || 0);
      const priceChangeRate = prevPrice > 0 ? Math.abs(currentPrice - prevPrice) / prevPrice : 0;

      // 품절 감지 → 전채널 자동 품절
      if (!isAvailable) {
        await supabase
          .from('sh_sourcing_products')
          .update({ status: 'out_of_stock', updated_at: new Date().toISOString() })
          .eq('id', p.id);

        // 연결된 마스터 상품 품절 처리
        const { data: linked } = await supabase
          .from('sh_products')
          .select('id, megaload_user_id')
          .eq('sourcing_product_id', p.id);

        if (linked) {
          for (const prod of linked) {
            const prodData = prod as Record<string, unknown>;
            await supabase
              .from('sh_products')
              .update({ status: 'suspended', updated_at: new Date().toISOString() })
              .eq('id', prodData.id);

            // 각 채널에서 품절 처리
            try {
              const adapters = await getAllAuthenticatedAdapters(supabase, prodData.megaload_user_id as string);
              const { data: channels } = await supabase
                .from('sh_product_channels')
                .select('channel, channel_product_id')
                .eq('product_id', prodData.id)
                .eq('status', 'active');

              for (const ch of channels || []) {
                const chData = ch as Record<string, unknown>;
                const ad = adapters.find((a) => a.channel === chData.channel);
                if (ad) {
                  try { await ad.adapter.suspendProduct(chData.channel_product_id as string); } catch { /* skip */ }
                }
              }
            } catch { /* skip */ }
          }
        }

        // 셀러 알림
        await supabase.from('sh_notifications').insert({
          megaload_user_id: shUserId,
          type: 'warning',
          title: '소싱 상품 품절',
          message: `${String(p.product_name).slice(0, 30)} 상품이 원본에서 품절되었습니다.`,
        });

        outOfStock++;
      }
      // 가격 10% 이상 변동 → 셀러 알림 (승인 필요)
      else if (priceChangeRate >= 0.1) {
        await supabase.from('sh_notifications').insert({
          megaload_user_id: shUserId,
          type: 'warning',
          title: '소싱 원가 변동 (10% 이상)',
          message: `${String(p.product_name).slice(0, 30)} 원가: ${prevPrice} → ${currentPrice}. 판매가 재설정이 필요합니다.`,
        });
        priceChanged++;
      }
      // 가격 10% 미만 변동 → 자동 반영
      else if (currentPrice > 0 && currentPrice !== prevPrice) {
        await supabase
          .from('sh_sourcing_products')
          .update({ original_price: currentPrice, updated_at: new Date().toISOString() })
          .eq('id', p.id);
      }

      synced++;
    } catch {
      synced++;
    }
  }

  return NextResponse.json({ success: true, synced, priceChanged, outOfStock });
}

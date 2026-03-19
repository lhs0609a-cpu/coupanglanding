import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const maxDuration = 300;

interface TrackingEvent {
  status: string;
  description: string;
  location: string;
  time: string;
}

async function fetch17TrackInfo(trackingNumber: string): Promise<{ status: string; events: TrackingEvent[]; isDomesticArrived: boolean } | null> {
  const apiKey = process.env.TRACK17_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
      method: 'POST',
      headers: {
        '17token': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ number: trackingNumber }]),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const trackInfo = data?.data?.accepted?.[0];
    if (!trackInfo) return null;

    const events: TrackingEvent[] = (trackInfo.track?.z || []).map((e: Record<string, unknown>) => ({
      status: String(e.c || ''),
      description: String(e.z || ''),
      location: String(e.l || ''),
      time: String(e.a || ''),
    }));

    // 국내 입고 감지: 이벤트에 'Korea', '한국', '인천', 'Incheon' 포함
    const isDomesticArrived = events.some((e) =>
      /korea|한국|인천|incheon|김포|부산항|평택/i.test(e.location + e.description)
    );

    const latestStatus = String(trackInfo.track?.e || 'InTransit');
    return { status: latestStatus, events, isDomesticArrived };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceClient();

  const { data: orders } = await supabase
    .from('sh_sourcing_orders')
    .select('*, sh_sourcing_tracking(*)')
    .in('status', ['ordered', 'shipped']);

  if (!orders || orders.length === 0) {
    return NextResponse.json({ message: '추적할 주문 없음' });
  }

  let tracked = 0;
  let domesticArrived = 0;
  const errors: string[] = [];

  for (const order of orders) {
    const orderData = order as Record<string, unknown>;
    const trackingRecords = (orderData.sh_sourcing_tracking || []) as Record<string, unknown>[];

    for (const tracking of trackingRecords) {
      const trackingNumber = tracking.tracking_number as string;
      if (!trackingNumber) continue;

      try {
        const info = await fetch17TrackInfo(trackingNumber);
        if (!info) continue;

        // 추적 정보 업데이트
        await supabase
          .from('sh_sourcing_tracking')
          .update({
            current_status: info.status,
            events: info.events,
            last_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', tracking.id);

        // 국내 입고 감지 시 상태 전환
        if (info.isDomesticArrived && orderData.status !== 'domestic_received') {
          await supabase
            .from('sh_sourcing_orders')
            .update({
              status: 'domestic_received',
              domestic_arrived_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', orderData.id);

          // 알림 생성
          await supabase
            .from('sh_notifications')
            .insert({
              megaload_user_id: orderData.megaload_user_id,
              type: 'info',
              title: '해외 소싱 상품 국내 도착',
              message: `주문 ${String(orderData.id).slice(0, 8)}의 상품이 국내에 도착했습니다.`,
            });

          domesticArrived++;
        }

        tracked++;
      } catch (err) {
        errors.push(`${orderData.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    tracked,
    domesticArrived,
    errors: errors.length > 0 ? errors : undefined,
  });
}

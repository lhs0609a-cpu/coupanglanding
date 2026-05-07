import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { createAdapter } from '@/lib/megaload/adapters/factory';
import type { Channel } from '@/lib/megaload/types';
import { clearCoupangApiBlock } from '@/lib/utils/coupang-circuit-breaker';

export const maxDuration = 30;


export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { channel, credentials } = body as { channel: Channel; credentials: Record<string, unknown> };

    if (!channel || !credentials) {
      return NextResponse.json({ error: '채널과 인증 정보가 필요합니다.' }, { status: 400 });
    }

    const adapter = createAdapter(channel);
    const result = await adapter.testConnection(credentials);

    // 쿠팡 연결 성공 — circuit breaker 해제 (IP/키 차단 상태에서 복구)
    if (channel === 'coupang' && result.success) {
      const serviceClient = await createServiceClient();
      const { data: ptUser } = await serviceClient
        .from('pt_users')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle();
      if (ptUser) {
        await clearCoupangApiBlock(serviceClient, (ptUser as { id: string }).id);
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: `연결 테스트 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
    }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { logSystemError } from '@/lib/utils/system-log';

export const maxDuration = 30;

const MAX_PAGES = 20;
const WINDOW_DAYS = 7; // 쿠팡 온라인문의 조회 최대 기간

/**
 * 쿠팡 온라인(상품) 고객문의 수집 → sh_cs_inquiries 저장.
 * 수동 "문의 가져오기" 버튼에서 호출. 최근 7일치를 페이지 순회로 수집,
 * 기존 channel_inquiry_id 와 중복되지 않는 신규 건만 insert.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: shUser } = await supabase
      .from('megaload_users')
      .select('id')
      .eq('profile_id', user.id)
      .single();
    if (!shUser) return NextResponse.json({ error: 'Megaload 계정 없음' }, { status: 403 });

    const shUserId = (shUser as Record<string, unknown>).id as string;
    const serviceClient = await createServiceClient();

    // 미연동 시 팩토리가 안내 메시지를 throw — 화면에 그대로 노출
    let adapter;
    try {
      adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    } catch (err) {
      const message = err instanceof Error ? err.message : '쿠팡 채널 연동이 필요합니다.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString().slice(0, 10);

    // 1) 페이지 순회 수집
    const rawItems: Record<string, unknown>[] = [];
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const { items } = await adapter.getInquiries({ startDate, endDate, page: pageNum });
      if (!items.length) break;
      rawItems.push(...items);
      if (items.length < 10) break; // pageSize=10 미만이면 마지막 페이지
    }
    const collected = rawItems.length;

    // 2) 기존 id 로드 → 중복 방지 (sh_cs_inquiries 는 unique 제약 없음 → onConflict 금지)
    const { data: existing } = await serviceClient
      .from('sh_cs_inquiries')
      .select('channel_inquiry_id')
      .eq('megaload_user_id', shUserId)
      .eq('channel', 'coupang');
    const seen = new Set<string>(
      (existing || [])
        .map((r) => (r as Record<string, unknown>).channel_inquiry_id as string | null)
        .filter((v): v is string => !!v)
    );

    // 3) 매핑 + 신규 필터
    const newRows: Record<string, unknown>[] = [];
    for (const item of rawItems) {
      const inquiryId = item.inquiryId != null ? String(item.inquiryId) : '';
      if (!inquiryId || seen.has(inquiryId)) continue;

      const content = String(item.content ?? '').trim();
      if (!content) continue; // content 는 NOT NULL

      seen.add(inquiryId); // fetch 내 중복도 제거

      const answered = item.answered === true;
      let answer: string | null = null;
      if (answered && Array.isArray(item.commentDtoList)) {
        const comments = item.commentDtoList as Record<string, unknown>[];
        const reply = [...comments].reverse().find((c) => c.replyBy);
        answer = reply ? String(reply.content ?? '') || null : null;
      }

      newRows.push({
        megaload_user_id: shUserId,
        channel: 'coupang',
        channel_inquiry_id: inquiryId,
        inquiry_type: 'product',
        title: null,
        content,
        buyer_name: item.buyerEmail != null ? String(item.buyerEmail) : null,
        product_id: null, // 쿠팡 id 는 우리 UUID 가 아님 → FK 위반 방지
        order_id: null,
        status: answered ? 'replied' : 'pending',
        answer,
        answered_at: answered ? (item.answeredAt ?? null) : null,
        inquired_at: item.inquiryAt ?? null,
      });
    }

    if (newRows.length) {
      const { error: insertError } = await serviceClient
        .from('sh_cs_inquiries')
        .insert(newRows);
      if (insertError) throw insertError;
    }

    return NextResponse.json({ collected, new: newRows.length });
  } catch (err) {
    console.error('[cs/collect] error:', err);
    void logSystemError({ source: 'megaload/cs/collect', error: err }).catch(() => {});
    const message = err instanceof Error ? err.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

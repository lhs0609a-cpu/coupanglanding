import type { SupabaseClient } from '@supabase/supabase-js';
import { getAllAuthenticatedAdapters } from '@/lib/megaload/adapters/factory';
import type { Channel } from '@/lib/megaload/types';
import { logSystemError } from '@/lib/utils/system-log';

/**
 * 채널 원본 문의 항목 → sh_cs_inquiries 컬럼 정규화.
 *
 * 채널별로 필드명이 제각각이라 order-collect 와 동일한 방어적 다중키 추출을 사용한다.
 * (필드명은 best-effort — 네이버/11번가/ESM/롯데온 실 응답으로 라이브 검증 필요.
 *  쿠팡/카카오/토스는 문의 API가 없어 어댑터가 빈 배열을 반환하므로 이 함수에 도달하지 않는다.)
 */
function normalizeInquiry(item: Record<string, unknown>) {
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = item[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };

  const channelInquiryId = pick(
    'inquiryNo', 'inquiryId', 'qnaNo', 'questionId', 'boardNo', 'answerNo', 'csNo', 'id',
  );
  const content = pick(
    'content', 'contents', 'inquiryContent', 'qnaContent', 'question', 'questionContent', 'body', 'text',
  );
  const title = pick('title', 'subject', 'inquiryTitle', 'qnaTitle');
  const buyerName = pick(
    'buyerName', 'customerName', 'memberName', 'writerName', 'nickName', 'buyerId', 'memberId', 'writerId',
  );
  const inquiryType = pick('inquiryType', 'qnaType', 'category', 'type', 'csType', 'inquiryCategory');
  const inquiredAt = pick(
    'inquiryRegistrationDateTime', 'regDate', 'registeredAt', 'createdAt', 'created_at',
    'inquiryDate', 'writeDate', 'questionDate', 'regDt',
  );

  return { channelInquiryId, content, title, buyerName, inquiryType, inquiredAt };
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // "20260709" 형태(YYYYMMDD) 보정
  const compact = /^\d{8}$/.test(raw);
  const iso = compact ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const MAX_PAGES = 5;

export interface CsCollectResult {
  collected: number;
  errors: number;
  byChannel: Record<string, number>;
}

/**
 * 특정 셀러의 연결된 모든 채널에서 문의를 수집해 sh_cs_inquiries 에 멱등 upsert.
 * status/answer/ai_draft_answer 는 upsert 페이로드에 포함하지 않아 기존 답변 상태를 보존한다.
 */
export async function collectInquiriesForUser(
  supabase: SupabaseClient,
  shUserId: string,
): Promise<CsCollectResult> {
  const result: CsCollectResult = { collected: 0, errors: 0, byChannel: {} };

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const adapters = await getAllAuthenticatedAdapters(supabase, shUserId);

  for (const { channel, adapter } of adapters) {
    try {
      let page = 1;
      let channelCount = 0;

      while (page <= MAX_PAGES) {
        const { items, totalCount } = await adapter.getInquiries({ startDate, endDate, page });
        if (!items || items.length === 0) break;

        for (const item of items) {
          const norm = normalizeInquiry(item);
          if (!norm.content) continue; // content 는 NOT NULL

          const row: Record<string, unknown> = {
            megaload_user_id: shUserId,
            channel,
            content: norm.content,
            title: norm.title || null,
            buyer_name: norm.buyerName || null,
            inquiry_type: norm.inquiryType || null,
            inquired_at: parseDate(norm.inquiredAt),
            updated_at: new Date().toISOString(),
          };

          if (norm.channelInquiryId) {
            // channel_inquiry_id 있으면 멱등 upsert (유니크 인덱스 대상)
            row.channel_inquiry_id = norm.channelInquiryId;
            const { error } = await supabase
              .from('sh_cs_inquiries')
              .upsert(row, { onConflict: 'megaload_user_id,channel,channel_inquiry_id' });
            if (error) { result.errors++; continue; }
          } else {
            // id 없는 항목: content 중복 방지 후 insert
            const { data: existing } = await supabase
              .from('sh_cs_inquiries')
              .select('id')
              .eq('megaload_user_id', shUserId)
              .eq('channel', channel)
              .eq('content', norm.content)
              .maybeSingle();
            if (existing) continue;
            const { error } = await supabase.from('sh_cs_inquiries').insert(row);
            if (error) { result.errors++; continue; }
          }

          channelCount++;
          result.collected++;
        }

        if (items.length < 50 || (totalCount && page * 50 >= totalCount)) break;
        page++;
      }

      result.byChannel[channel] = channelCount;
    } catch (err) {
      result.errors++;
      void logSystemError({
        source: 'cs-collect',
        error: err,
        context: { shUserId, channel },
      }).catch(() => {});
    }
  }

  return result;
}

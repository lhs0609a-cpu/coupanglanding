import type { ToolSpec } from './llm';
import type { AssistantMedia, AssistantSource, AssistantSurface, KbEntry } from './types';
import { searchKb } from './retrieval';
import type { KbIndex } from './retrieval';
import { findEntry } from './kb';
import { buildUserStatus, formatStatus } from './diagnostics';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = any;

export interface ToolContext {
  serviceClient: Sb;
  profileId: string | null;
  /** pt_users.id — 1:1 문의 생성에 필요 */
  ptUserId: string | null;
  /** megaload_users.id — 오류문의 생성에 필요 */
  megaloadUserId: string | null;
  path: string | null;
  surface: AssistantSurface;
  entries: KbEntry[];
  index: KbIndex;
  /** 이번 답변에서 인용된 문서 (툴이 채운다) */
  cited: AssistantSource[];
  /** 이번 답변에 같이 띄울 이미지/영상 (툴이 채운다) */
  media: AssistantMedia[];
  /** 봇이 만든 티켓 — 대화에 링크로 남긴다 */
  /** 대화 전문 (티켓 본문에 붙임) */
  transcript: string;
}

export function toolSpecs(ctx: ToolContext): ToolSpec[] {
  const specs: ToolSpec[] = [
    {
      name: 'search_kb',
      description:
        '지식베이스를 검색한다. 답을 모르거나 확실하지 않으면 반드시 먼저 호출한다. ' +
        '한국어 질문을 그대로 넣어도 되고, 핵심 키워드만 넣어도 된다. ' +
        '결과는 문서 id·제목·요약만 돌려주므로, 답변에 쓰려면 open_kb 로 본문을 열어야 한다.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '검색어 (한국어)' },
          limit: { type: 'integer', description: '최대 결과 수 (기본 8, 최대 20)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'open_kb',
      description:
        '문서 id 로 지식베이스 본문 전체를 읽는다. 한 번에 최대 3개까지. ' +
        '문서에 화면 캡처나 교육 영상이 붙어 있으면 자동으로 답변에 함께 표시되므로, ' +
        '화면 조작을 설명할 때는 관련 문서를 꼭 열어라.',
      parameters: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'search_kb 가 돌려준 문서 id 배열',
          },
        },
        required: ['ids'],
      },
    },
  ];

  if (ctx.profileId) {
    specs.push({
      name: 'get_my_status',
      description:
        '지금 대화 중인 사용자의 실제 계정 상태를 조회한다. ' +
        '등록 상품 수, 연동된 채널, 메가로드 도우미 온·오프라인, 대기 주문/미답변 문의 수, ' +
        '최근 등록 실패 건수, 정산 보고서 제출 여부, 결제 잠금 단계, 페널티 현황을 한 번에 돌려준다. ' +
        '"왜 안 되죠?", "제 상태 봐주세요", "뭐부터 해야 해요?" 같은 질문에는 추측하지 말고 반드시 먼저 호출한다.',
      parameters: { type: 'object', properties: {}, required: [] },
    });
    specs.push({
      name: 'list_recent_errors',
      description:
        '이 사용자의 최근 등록 실패 사유와 오류문의 이력을 조회한다. ' +
        '"등록이 실패했어요", "왜 실패했는지 모르겠어요" 같은 질문에 쓴다.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', description: '최대 건수 (기본 10)' } },
        required: [],
      },
    });
  }

  // 1:1 문의·오류문의 등록 툴은 없앴다 (사용자 확정 2026-09-28).
  // 창구를 카톡고객센터 한 곳으로 모으기로 해서, 봇이 게시판에 글을 만들면 안 된다.
  // 봇이 못 푸는 건 프롬프트가 카톡으로 안내한다.

  return specs;
}

export async function runTool(
  ctx: ToolContext,
  name: string,
  rawArgs: string,
): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return '오류: 인자를 JSON 으로 해석하지 못했습니다. 다시 호출하세요.';
  }

  switch (name) {
    case 'search_kb': {
      const query = String(args.query ?? '').trim();
      if (!query) return '오류: query 가 비었습니다.';
      const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20);
      const hits = searchKb(ctx.index, query, {
        path: ctx.path,
        surface: ctx.surface,
        limit,
      });
      if (!hits.length) {
        return `"${query}" 로 찾은 문서가 없습니다. 다른 표현으로 다시 검색하거나, 모른다고 솔직히 말하고 사람 연결을 제안하세요.`;
      }
      return hits
        .map((h, i) => `${i + 1}. [${h.entry.id}] ${h.entry.title}\n   ${h.entry.summary}`)
        .join('\n');
    }

    case 'open_kb': {
      const ids = Array.isArray(args.ids) ? (args.ids as unknown[]).map(String).slice(0, 3) : [];
      if (!ids.length) return '오류: ids 가 비었습니다.';
      const parts: string[] = [];
      for (const id of ids) {
        const e = findEntry(ctx.entries, id);
        if (!e) {
          parts.push(`[${id}] 문서를 찾을 수 없습니다.`);
          continue;
        }
        if (!ctx.cited.some((c) => c.id === e.id)) {
          ctx.cited.push({ id: e.id, title: e.title, href: e.link?.href });
        }
        // 문서에 붙은 화면 캡처·교육 영상을 답변에 같이 실어 보낸다
        for (const m of e.media ?? []) {
          if (ctx.media.length >= 4) break;
          if (ctx.media.some((x) => x.src === m.src)) continue;
          ctx.media.push({ ...m, fromId: e.id });
        }
        const mediaNote = e.media?.length
          ? `\n(이 문서에는 화면 캡처/영상 ${e.media.length}개가 붙어 있어 답변과 함께 자동으로 표시된다. "아래 화면을 보세요"처럼 자연스럽게 언급해라.)`
          : '';
        parts.push(`===== [${e.id}] ${e.title} =====\n${e.body}${mediaNote}`);
      }
      return parts.join('\n\n');
    }

    case 'get_my_status': {
      const s = await buildUserStatus(ctx.serviceClient, ctx.profileId);
      return formatStatus(s);
    }

    case 'list_recent_errors': {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
      const lines: string[] = [];

      if (ctx.megaloadUserId) {
        try {
          const { data } = await ctx.serviceClient
            .from('sh_product_channels')
            .select('channel, status, error_message, updated_at, sh_products!inner(megaload_user_id, product_name)')
            .eq('sh_products.megaload_user_id', ctx.megaloadUserId)
            .eq('status', 'failed')
            .order('updated_at', { ascending: false })
            .limit(limit);
          const rows = (data || []) as Array<Record<string, any>>;
          if (rows.length) {
            lines.push('■ 최근 등록 실패');
            for (const r of rows) {
              const pname = r.sh_products?.product_name ?? '(상품명 없음)';
              lines.push(
                `- [${r.channel}] ${String(pname).slice(0, 40)} — ${String(r.error_message ?? '사유 미기록').slice(0, 200)} (${String(r.updated_at ?? '').slice(0, 16)})`,
              );
            }
          }
        } catch {
          /* 조인 형태가 안 맞으면 조용히 넘어간다 */
        }

        try {
          const { data } = await ctx.serviceClient
            .from('sh_bug_reports')
            .select('title, category, status, created_at')
            .eq('megaload_user_id', ctx.megaloadUserId)
            .order('created_at', { ascending: false })
            .limit(5);
          const rows = (data || []) as Array<Record<string, unknown>>;
          if (rows.length) {
            lines.push('', '■ 내가 접수한 오류문의');
            for (const r of rows) {
              lines.push(`- ${r.title} (${r.category}, ${r.status}, ${String(r.created_at).slice(0, 10)})`);
            }
          }
        } catch {
          /* noop */
        }
      }

      return lines.length ? lines.join('\n') : '최근 등록 실패나 접수된 오류문의가 없습니다.';
    }

    default:
      return `오류: ${name} 은 없는 툴입니다.`;
  }
}

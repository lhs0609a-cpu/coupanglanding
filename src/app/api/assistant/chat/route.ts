import { NextRequest } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getKb } from '@/lib/assistant/kb';
import { resolvePage, resolveSurface } from '@/lib/assistant/kb/pages';
import { pageRelevantEntries, searchKb } from '@/lib/assistant/retrieval';
import { buildSystemPrompt, extractPathLinks } from '@/lib/assistant/prompt';
import { resolveLlmConfig, streamRound, type ChatMsg } from '@/lib/assistant/llm';
import { toolSpecs, runTool, type ToolContext } from '@/lib/assistant/tools';
import { buildUserStatus, formatStatus } from '@/lib/assistant/diagnostics';
import type { AssistantAction, AssistantSource } from '@/lib/assistant/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 한 요청에서 허용할 툴 라운드 수 — 무한 루프 방지 */
const MAX_ROUNDS = 5;
/** 프롬프트에 실어 보낼 최근 대화 턴 수 */
const HISTORY_TURNS = 12;

/* eslint-disable @typescript-eslint/no-explicit-any */

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const started = Date.now();

  let body: {
    message?: string;
    conversationId?: string | null;
    anonKey?: string | null;
    path?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '잘못된 요청입니다.' }), { status: 400 });
  }

  const message = (body.message ?? '').trim();
  if (!message) return new Response(JSON.stringify({ error: '메시지가 비었습니다.' }), { status: 400 });
  if (message.length > 4000) {
    return new Response(JSON.stringify({ error: '메시지가 너무 깁니다. 4000자 이내로 나눠 보내주세요.' }), {
      status: 400,
    });
  }

  const path = body.path ?? null;
  const surface = resolveSurface(path);
  const anonKey = (body.anonKey ?? '').slice(0, 64) || null;

  // ── 인증 (비로그인도 허용) ──
  let profileId: string | null = null;
  let userName: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    profileId = user?.id ?? null;
  } catch {
    profileId = null;
  }

  let serviceClient: any = null;
  try {
    serviceClient = await createServiceClient();
  } catch {
    serviceClient = null;
  }

  let ptUserId: string | null = null;
  let megaloadUserId: string | null = null;
  if (profileId && serviceClient) {
    const [{ data: prof }, { data: pt }, { data: sh }] = await Promise.all([
      serviceClient.from('profiles').select('full_name').eq('id', profileId).maybeSingle(),
      serviceClient.from('pt_users').select('id').eq('profile_id', profileId).maybeSingle(),
      serviceClient.from('megaload_users').select('id').eq('profile_id', profileId).maybeSingle(),
    ]).catch(() => [{ data: null }, { data: null }, { data: null }] as any);
    userName = (prof as any)?.full_name ?? null;
    ptUserId = (pt as any)?.id ?? null;
    megaloadUserId = (sh as any)?.id ?? null;
  }

  // ── 지식베이스 ──
  const { entries, index } = await getKb(serviceClient);

  // ── 대화 불러오기 / 만들기 ──
  let conversationId = body.conversationId ?? null;
  let isNewConversation = false;
  const history: Array<{ role: string; content: string }> = [];

  if (serviceClient) {
    if (conversationId) {
      const { data: conv } = await serviceClient
        .from('assistant_conversations')
        .select('id, profile_id, anon_key')
        .eq('id', conversationId)
        .maybeSingle();
      const owned =
        conv &&
        ((profileId && (conv as any).profile_id === profileId) ||
          (!!anonKey && (conv as any).anon_key === anonKey));
      if (!owned) {
        conversationId = null; // 남의 대화 id 를 넘겨도 이어지지 않는다
      } else {
        const { data: msgs } = await serviceClient
          .from('assistant_messages')
          .select('role, content')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(HISTORY_TURNS);
        for (const m of ((msgs || []) as Array<{ role: string; content: string }>).reverse()) {
          if (m.role === 'user' || m.role === 'assistant') history.push(m);
        }
      }
    }

    if (!conversationId) {
      const { data: created } = await serviceClient
        .from('assistant_conversations')
        .insert({
          profile_id: profileId,
          anon_key: anonKey,
          entry_path: path,
          last_path: path,
          surface,
          title: message.slice(0, 80),
        })
        .select('id')
        .single();
      conversationId = (created as any)?.id ?? null;
      isNewConversation = true;
    }

    if (conversationId) {
      await serviceClient
        .from('assistant_messages')
        .insert({ conversation_id: conversationId, role: 'user', content: message, path })
        .then(() => undefined, () => undefined);
    }
  }

  // ── 첫 턴이면 계정 상태를 미리 붙인다 (툴 왕복 1회 절약) ──
  let statusSummary: string | null = null;
  if (profileId && serviceClient && (isNewConversation || history.length === 0)) {
    try {
      statusSummary = formatStatus(await buildUserStatus(serviceClient, profileId));
    } catch {
      statusSummary = null;
    }
  }

  const pageEntries = pageRelevantEntries(entries, path, 6);
  const cfg = resolveLlmConfig();

  // ── LLM 이 없으면 검색 결과만이라도 돌려준다 ──
  if (!cfg) {
    const hits = searchKb(index, message, { path, surface, limit: 3 });
    const text = hits.length
      ? '지금 AI 응답이 비활성화돼 있어 관련 문서만 안내합니다.\n\n' +
        hits.map((h) => `**${h.entry.title}**\n${h.entry.summary}`).join('\n\n')
      : '지금 AI 응답이 비활성화돼 있습니다. 카카오톡 상담으로 문의해주세요.';
    return streamStatic(text, conversationId, hits.map((h) => ({ id: h.entry.id, title: h.entry.title, href: h.entry.link?.href })), serviceClient, path, started);
  }

  const transcript = [...history, { role: 'user', content: message }]
    .map((m) => `${m.role === 'user' ? '사용자' : '봇'}: ${m.content}`)
    .join('\n');

  const ctx: ToolContext = {
    serviceClient,
    profileId,
    ptUserId,
    megaloadUserId,
    path,
    surface,
    entries,
    index,
    cited: [],
    transcript,
  };

  const specs = toolSpecs(ctx);

  const messages: ChatMsg[] = [
    {
      role: 'system',
      content: buildSystemPrompt({
        path,
        surface,
        loggedIn: !!profileId,
        userName,
        pageEntries,
        statusSummary,
        hasTools: specs.length > 0,
      }),
    },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: message },
  ];

  const encoder = new TextEncoder();
  const convId = conversationId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {
          /* 클라이언트가 끊었다 */
        }
      };

      let answer = '';
      try {
        send('meta', { conversationId: convId });

        for (let round = 0; round < MAX_ROUNDS; round++) {
          const isLast = round === MAX_ROUNDS - 1;
          const { toolCalls, text } = await streamRound(
            cfg,
            messages,
            isLast ? [] : specs,
            (e) => {
              if (e.type === 'text') {
                answer += e.delta;
                send('delta', { text: e.delta });
              } else if (e.type === 'tool_start') {
                send('tool', { name: e.name });
              }
            },
            request.signal,
          );

          if (!toolCalls.length) break;

          messages.push({
            role: 'assistant',
            content: text || null,
            tool_calls: toolCalls.map((c) => ({
              id: c.id,
              type: 'function' as const,
              function: { name: c.name, arguments: c.args },
            })),
          });

          for (const call of toolCalls) {
            let result: string;
            try {
              result = await runTool(ctx, call.name, call.args);
            } catch (e) {
              result = `툴 실행 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`;
            }
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: result.slice(0, 12000),
            });
          }
        }

        // ── 근거 + 이동 버튼 ──
        const sources: AssistantSource[] = ctx.cited.slice(0, 5);
        const actions: AssistantAction[] = [];
        for (const p of extractPathLinks(answer)) {
          actions.push({ kind: 'navigate', label: linkLabel(p), href: p });
        }
        for (const s of sources) {
          if (s.href && !actions.some((a) => a.href === s.href)) {
            actions.push({ kind: 'navigate', label: linkLabel(s.href), href: s.href });
          }
        }
        if (ctx.createdTicketId) {
          actions.unshift({ kind: 'navigate', label: '내 1:1 문의 보기', href: '/my/support' });
        }
        if (ctx.createdBugReportId) {
          actions.unshift({ kind: 'navigate', label: '오류문의 보기', href: '/megaload/bug-reports' });
        }

        send('done', { sources, actions: actions.slice(0, 5), conversationId: convId });

        if (serviceClient && convId) {
          await persist(serviceClient, convId, answer, sources, path, Date.now() - started, ctx);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '알 수 없는 오류';
        if (!answer) {
          // 아무것도 못 보냈으면 검색 결과라도
          const hits = searchKb(index, message, { path, surface, limit: 2 });
          const fallback = hits.length
            ? '지금 답변 생성에 문제가 있었습니다. 관련 문서를 먼저 보세요.\n\n' +
              hits.map((h) => `**${h.entry.title}**\n${h.entry.summary}`).join('\n\n')
            : '지금 답변 생성에 문제가 있었습니다. 잠시 후 다시 시도하거나 카카오톡 상담으로 문의해주세요.';
          send('delta', { text: fallback });
          answer = fallback;
        }
        send('error', { message: msg });
        send('done', { sources: [], actions: [], conversationId: convId });
        if (serviceClient && convId) {
          await persist(serviceClient, convId, answer, [], path, Date.now() - started, ctx);
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* 이미 닫힘 */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * 이동 버튼 라벨 — PAGE_MAP 의 화면 이름을 쓴다.
 * 경로를 그대로 노출하면("/megaload/products/channel-status 열기") 초보에게 아무 의미가 없다.
 * PAGE_MAP 에 없는 경로(가이드 문서 링크 등)는 마지막 세그먼트로 그럭저럭 읽히게 만든다.
 */
function linkLabel(href: string): string {
  const base = href.split('?')[0];
  const page = resolvePage(base);
  if (page) return `${page.name} 열기`;

  const seg = base.split('/').filter(Boolean).pop() || base;
  // 슬러그(coupang-api-setup)를 사람이 읽을 형태로
  const pretty = decodeURIComponent(seg).replace(/[-_]/g, ' ');
  return `${pretty} 열기`;
}

async function persist(
  serviceClient: any,
  conversationId: string,
  answer: string,
  sources: AssistantSource[],
  path: string | null,
  latencyMs: number,
  ctx: ToolContext,
) {
  try {
    await serviceClient.from('assistant_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: answer,
      sources,
      path,
      latency_ms: latencyMs,
    });
    const patch: Record<string, unknown> = {
      last_path: path,
      updated_at: new Date().toISOString(),
    };
    if (ctx.createdTicketId) {
      patch.escalated = true;
      patch.escalated_ticket_id = ctx.createdTicketId;
    }
    if (ctx.createdBugReportId) {
      patch.escalated = true;
      patch.escalated_bug_report_id = ctx.createdBugReportId;
    }
    await serviceClient.from('assistant_conversations').update(patch).eq('id', conversationId);
  } catch {
    /* 저장 실패로 상담이 깨지면 안 된다 */
  }
}

/** LLM 없이 정적 텍스트만 흘려보낼 때 */
function streamStatic(
  text: string,
  conversationId: string | null,
  sources: AssistantSource[],
  serviceClient: any,
  path: string | null,
  started: number,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(sse('meta', { conversationId })));
      controller.enqueue(encoder.encode(sse('delta', { text })));
      // LLM 키가 없을 때도 문서로 바로 갈 수 있게 이동 버튼을 붙인다.
      // 링크가 없으면 사용자는 요약만 읽고 그 자리에서 막힌다.
      const actions: AssistantAction[] = [];
      for (const s of sources) {
        if (s.href && !actions.some((a) => a.href === s.href)) {
          actions.push({ kind: 'navigate', label: linkLabel(s.href), href: s.href });
        }
      }
      actions.push({ kind: 'kakao', label: '카톡 상담 열기', href: 'https://open.kakao.com/o/skLRf9li' });
      controller.enqueue(
        encoder.encode(sse('done', { sources, actions: actions.slice(0, 5), conversationId })),
      );
      if (serviceClient && conversationId) {
        try {
          await serviceClient.from('assistant_messages').insert({
            conversation_id: conversationId,
            role: 'assistant',
            content: text,
            sources,
            path,
            latency_ms: Date.now() - started,
          });
        } catch {
          /* noop */
        }
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

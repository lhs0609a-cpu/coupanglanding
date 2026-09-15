/**
 * 상담봇 LLM 호출 — 툴 콜링 + 스트리밍.
 *
 * 공급자 선택
 *  1) OPENAI_API_KEY 가 있으면 OpenAI (이 레포가 이미 상품명/상세 생성에 쓰는 키)
 *  2) 없으면 GEMINI_API_KEY 로 Google 의 OpenAI 호환 엔드포인트
 *  3) 둘 다 없으면 호출 자체를 하지 않고, 라우트가 KB 검색 결과만으로 답한다.
 *
 * 두 공급자 모두 OpenAI Chat Completions 스키마를 그대로 쓰므로 코드 경로는 하나다.
 */

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMsg {
  role: ChatRole;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: 'openai' | 'gemini';
}

export function resolveLlmConfig(): LlmConfig | null {
  const openai = process.env.OPENAI_API_KEY;
  if (openai) {
    return {
      apiKey: openai,
      baseUrl: 'https://api.openai.com/v1',
      model: process.env.ASSISTANT_MODEL || 'gpt-4o-mini',
      provider: 'openai',
    };
  }
  const gemini = process.env.GEMINI_API_KEY;
  if (gemini) {
    return {
      apiKey: gemini,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: process.env.ASSISTANT_MODEL || 'gemini-2.0-flash',
      provider: 'gemini',
    };
  }
  return null;
}

export type LlmEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; name: string; args: string }
  | { type: 'error'; message: string };

interface PendingToolCall {
  id: string;
  name: string;
  args: string;
}

/**
 * 한 라운드 스트리밍. 텍스트 델타를 흘리면서 tool_calls 를 모은다.
 * 반환값: 이번 라운드에서 모델이 요청한 툴 호출 목록(없으면 답변 종료) + 누적 텍스트.
 */
export async function streamRound(
  cfg: LlmConfig,
  messages: ChatMsg[],
  tools: ToolSpec[],
  onEvent: (e: LlmEvent) => void,
  signal?: AbortSignal,
): Promise<{ toolCalls: PendingToolCall[]; text: string }> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: true,
      temperature: 0.3,
      max_tokens: 1600,
      ...(tools.length
        ? {
            tools: tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
            tool_choice: 'auto',
          }
        : {}),
    }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM ${res.status}: ${body.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const calls = new Map<number, PendingToolCall>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let json: Record<string, unknown>;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      const choices = json.choices as Array<Record<string, unknown>> | undefined;
      const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
      if (!delta) continue;

      if (typeof delta.content === 'string' && delta.content) {
        text += delta.content;
        onEvent({ type: 'text', delta: delta.content });
      }

      const tcs = delta.tool_calls as
        | Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>
        | undefined;
      if (tcs) {
        for (const tc of tcs) {
          const idx = tc.index ?? 0;
          const existing = calls.get(idx) || { id: '', name: '', args: '' };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name += tc.function.name;
          if (tc.function?.arguments) existing.args += tc.function.arguments;
          calls.set(idx, existing);
        }
      }
    }
  }

  const toolCalls = [...calls.values()].filter((c) => c.name);
  for (const c of toolCalls) onEvent({ type: 'tool_start', name: c.name, args: c.args });
  return { toolCalls, text };
}

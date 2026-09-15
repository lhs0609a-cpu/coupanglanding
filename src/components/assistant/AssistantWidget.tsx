'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sparkles,
  X,
  Send,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  MessageCircle,
  Loader2,
  Minus,
} from 'lucide-react';
import Markdown from './Markdown';
import { resolvePage } from '@/lib/assistant/kb/pages';

/**
 * 모든 페이지에 뜨는 AI 상담 위젯.
 *
 * 루트 레이아웃에 한 번만 마운트된다. 클라이언트 네비게이션에서는 언마운트되지 않으므로
 * 페이지를 옮겨도 대화가 끊기지 않고, 현재 경로만 바뀌어 봇 컨텍스트가 따라간다.
 *
 * 전체 새로고침 대비로 대화는 sessionStorage 에, 대화 id/방문자 키는 localStorage 에 둔다.
 */

const KAKAO_URL = 'https://open.kakao.com/o/skLRf9li';
const LS_CONV = 'megaload_assistant_conv';
const LS_ANON = 'megaload_assistant_anon';
const LS_SEEN = 'megaload_assistant_seen';
const SS_MSGS = 'megaload_assistant_msgs';

/** 위젯을 띄우지 않을 경로 — 서명/인쇄처럼 화면을 가리면 안 되는 곳만. */
const HIDDEN_PREFIXES = ['/sign/', '/screening/'];

interface Source {
  id: string;
  title: string;
  href?: string;
}
interface Action {
  kind: 'navigate' | 'kakao' | 'ticket' | 'bug_report' | 'external';
  label: string;
  href?: string;
}
interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  actions?: Action[];
  streaming?: boolean;
  rating?: 1 | -1;
}

const TOOL_LABEL: Record<string, string> = {
  search_kb: '자료 찾는 중',
  open_kb: '문서 읽는 중',
  get_my_status: '내 계정 상태 확인 중',
  list_recent_errors: '최근 오류 확인 중',
  create_support_ticket: '1:1 문의 등록 중',
  create_bug_report: '오류문의 등록 중',
};

const DEFAULT_SUGGESTIONS = [
  '지금 제 상태 진단해주세요',
  '오늘 뭐부터 해야 하나요?',
  '매출이 안 나오는데 왜죠?',
];

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function AssistantWidget() {
  const pathname = usePathname() || '/';
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [toolName, setToolName] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const convRef = useRef<string | null>(null);
  const anonRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const page = useMemo(() => resolvePage(pathname), [pathname]);
  const hidden = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  // ── 초기화 ──
  useEffect(() => {
    setMounted(true);
    try {
      convRef.current = localStorage.getItem(LS_CONV);
      let anon = localStorage.getItem(LS_ANON);
      if (!anon) {
        anon = newId();
        localStorage.setItem(LS_ANON, anon);
      }
      anonRef.current = anon;

      const cached = sessionStorage.getItem(SS_MSGS);
      if (cached) {
        const parsed = JSON.parse(cached) as Msg[];
        if (Array.isArray(parsed)) setMessages(parsed.filter((m) => !m.streaming));
      }
      if (!localStorage.getItem(LS_SEEN)) {
        const t = setTimeout(() => setNudge(true), 6000);
        return () => clearTimeout(t);
      }
    } catch {
      /* 스토리지 차단 환경 */
    }
  }, []);

  // ── 메시지 캐시 ──
  useEffect(() => {
    if (!mounted) return;
    try {
      sessionStorage.setItem(SS_MSGS, JSON.stringify(messages.slice(-30)));
    } catch {
      /* noop */
    }
  }, [messages, mounted]);

  // ── 스크롤 ──
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, toolName]);

  // ── ESC 로 닫기 ──
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openPanel = useCallback(() => {
    setOpen(true);
    setNudge(false);
    try {
      localStorage.setItem(LS_SEEN, '1');
    } catch {
      /* noop */
    }
    setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;

      const userMsg: Msg = { id: newId(), role: 'user', content: text };
      const botId = newId();
      setMessages((prev) => [...prev, userMsg, { id: botId, role: 'assistant', content: '', streaming: true }]);
      setInput('');
      setBusy(true);
      setToolName(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: text,
            conversationId: convRef.current,
            anonKey: anonRef.current,
            path: pathname,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`요청 실패 (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let event = '';

        const handle = (ev: string, payload: string) => {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(payload);
          } catch {
            return;
          }
          if (ev === 'meta' && typeof data.conversationId === 'string') {
            convRef.current = data.conversationId;
            try {
              localStorage.setItem(LS_CONV, data.conversationId);
            } catch {
              /* noop */
            }
          } else if (ev === 'delta' && typeof data.text === 'string') {
            setToolName(null);
            const chunk = data.text;
            setMessages((prev) =>
              prev.map((m) => (m.id === botId ? { ...m, content: m.content + chunk } : m)),
            );
          } else if (ev === 'tool' && typeof data.name === 'string') {
            setToolName(data.name);
          } else if (ev === 'done') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === botId
                  ? {
                      ...m,
                      streaming: false,
                      sources: (data.sources as Source[]) || [],
                      actions: (data.actions as Action[]) || [],
                    }
                  : m,
              ),
            );
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) handle(event, line.slice(5).trim());
          }
        }
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') {
          setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, streaming: false } : m)));
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botId
                ? {
                    ...m,
                    streaming: false,
                    content:
                      m.content ||
                      '연결에 문제가 생겼습니다. 잠시 후 다시 시도해주세요. 급한 건이면 아래 카톡 상담으로 연결해드립니다.',
                    actions: [{ kind: 'kakao', label: '카톡 상담 열기', href: KAKAO_URL }],
                  }
                : m,
            ),
          );
        }
      } finally {
        setBusy(false);
        setToolName(null);
        abortRef.current = null;
      }
    },
    [busy, pathname],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    convRef.current = null;
    try {
      localStorage.removeItem(LS_CONV);
      sessionStorage.removeItem(SS_MSGS);
    } catch {
      /* noop */
    }
    setMessages([]);
    setBusy(false);
    setToolName(null);
  }, []);

  const rate = useCallback((msgId: string, value: 1 | -1) => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, rating: value } : m)));
    const conversationId = convRef.current;
    if (!conversationId) return;
    void fetch('/api/assistant/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, rating: value, anonKey: anonRef.current }),
    }).catch(() => undefined);
  }, []);

  const go = useCallback(
    (href: string) => {
      if (/^https?:\/\//.test(href)) {
        window.open(href, '_blank', 'noopener,noreferrer');
      } else {
        router.push(href);
        setOpen(false);
      }
    },
    [router],
  );

  if (!mounted || hidden) return null;

  const suggestions = page?.suggestions?.length ? page.suggestions : DEFAULT_SUGGESTIONS;

  return (
    <>
      {/* ── 플로팅 버튼 ── */}
      {!open && (
        <div className="fixed bottom-5 right-4 z-[90] flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
          {nudge && (
            <button
              type="button"
              onClick={openPanel}
              className="max-w-[240px] rounded-2xl rounded-br-sm bg-white px-3.5 py-2.5 text-left text-[13px] leading-snug text-gray-700 shadow-lg ring-1 ring-black/5"
            >
              막히는 게 있으면 바로 물어보세요.
              <br />
              <span className="text-gray-500">등록 실패 원인도 제가 직접 확인해드립니다.</span>
            </button>
          )}
          <button
            type="button"
            onClick={openPanel}
            aria-label="AI 상담 열기"
            className="group flex items-center gap-2 rounded-full bg-[#E31837] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-black/20 ring-1 ring-black/5 transition hover:scale-105 hover:bg-[#c8142f] active:scale-95 sm:px-5 sm:py-3.5"
          >
            <Sparkles className="h-5 w-5" />
            <span className="hidden sm:inline">AI 상담</span>
            <span className="sm:hidden">상담</span>
          </button>
        </div>
      )}

      {/* ── 패널 ── */}
      {open && (
        <div className="fixed inset-0 z-[95] flex items-end justify-end sm:inset-auto sm:bottom-6 sm:right-6">
          {/* 모바일 딤 */}
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30 sm:hidden"
          />
          <div className="relative flex h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/10 sm:h-[640px] sm:max-h-[78vh] sm:w-[400px] sm:rounded-2xl">
            {/* 헤더 */}
            <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E31837]">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold text-gray-900">메가로드 AI 상담</div>
                <div className="truncate text-[11px] text-gray-500">
                  {page ? `${page.name} 화면을 보고 있습니다` : '무엇이든 물어보세요'}
                </div>
              </div>
              <button
                type="button"
                onClick={reset}
                title="새 대화"
                aria-label="새 대화 시작"
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="최소화"
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 sm:block hidden"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 sm:hidden"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 본문 */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <div className="rounded-2xl rounded-tl-sm bg-gray-50 px-3.5 py-3 text-[13.5px] leading-relaxed text-gray-700">
                    안녕하세요. 쿠팡 판매 중에 막히는 것을 바로 풀어드립니다.
                    <br />
                    등록 실패 원인, 브랜드사 메일 대응, 정산·결제, 매출이 안 나오는 이유까지 —{' '}
                    <b className="text-gray-900">실제 제 계정 상태를 확인해서</b> 답해드려요.
                  </div>
                  <div className="space-y-1.5">
                    <div className="px-1 text-[11px] font-semibold text-gray-400">
                      {page ? `${page.name}에서 많이 묻는 것` : '이런 걸 물어보세요'}
                    </div>
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-[13px] text-gray-700 transition hover:border-[#E31837]/40 hover:bg-red-50/40"
                      >
                        <span>{s}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#E31837] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="space-y-2">
                    <div className="rounded-2xl rounded-tl-sm bg-gray-50 px-3.5 py-3">
                      {m.content ? (
                        <Markdown text={m.content} />
                      ) : (
                        <div className="flex items-center gap-2 text-[13px] text-gray-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {toolName ? `${TOOL_LABEL[toolName] || '확인 중'}…` : '생각하는 중…'}
                        </div>
                      )}
                      {m.streaming && m.content && (
                        <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-gray-400 align-middle" />
                      )}
                    </div>

                    {!m.streaming && !!m.actions?.length && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.actions.map((a, i) => (
                          <button
                            key={`${a.href}-${i}`}
                            type="button"
                            onClick={() => a.href && go(a.href)}
                            className="inline-flex items-center gap-1 rounded-full border border-[#E31837]/30 bg-white px-2.5 py-1 text-[12px] font-medium text-[#E31837] transition hover:bg-red-50"
                          >
                            {a.label}
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                    )}

                    {!m.streaming && !!m.sources?.length && (
                      <div className="px-1 text-[11px] text-gray-400">
                        근거: {m.sources.map((s) => s.title).join(' · ')}
                      </div>
                    )}

                    {!m.streaming && m.content && (
                      <div className="flex items-center gap-1 px-1">
                        <button
                          type="button"
                          onClick={() => rate(m.id, 1)}
                          aria-label="도움이 됐어요"
                          className={`rounded p-1 transition ${
                            m.rating === 1 ? 'text-[#E31837]' : 'text-gray-300 hover:text-gray-500'
                          }`}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => rate(m.id, -1)}
                          aria-label="도움이 안 됐어요"
                          className={`rounded p-1 transition ${
                            m.rating === -1 ? 'text-[#E31837]' : 'text-gray-300 hover:text-gray-500'
                          }`}
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                        {m.rating === -1 && (
                          <a
                            href={KAKAO_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 text-[11px] font-medium text-[#E31837] underline underline-offset-2"
                          >
                            사람에게 연결하기
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>

            {/* 입력 */}
            <div className="border-t border-gray-100 bg-white px-3 py-2.5">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  rows={1}
                  placeholder="무엇이 막히나요? (Enter 전송)"
                  className="max-h-28 min-h-[38px] flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-[13.5px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-[#E31837]/50 focus:ring-2 focus:ring-[#E31837]/10"
                />
                <button
                  type="button"
                  onClick={() => void send(input)}
                  disabled={busy || !input.trim()}
                  aria-label="보내기"
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[#E31837] text-white transition disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between px-1">
                <span className="text-[10.5px] text-gray-400">
                  AI 답변이라 틀릴 수 있어요. 금액·정책은 화면에서 한 번 확인하세요.
                </span>
                <a
                  href={KAKAO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-gray-500 transition hover:text-[#3C1E1E]"
                >
                  <MessageCircle className="h-3 w-3" />
                  사람 상담
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

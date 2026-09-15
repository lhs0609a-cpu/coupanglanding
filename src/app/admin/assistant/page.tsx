'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, RefreshCw, CheckCircle2, ThumbsDown, AlertTriangle, Plus, Trash2, BookOpen } from 'lucide-react';
import Modal from '@/components/ui/Modal';

/**
 * AI 상담 운영 화면.
 *
 * 목적은 "봇이 못 푼 질문"을 모아 지식을 보강하는 것이다.
 *  - 👎 가 달린 대화 / 사람에게 넘어간 대화가 곧 KB 결함 목록이다.
 *  - 대화를 보고 [이 질문으로 지식 추가]를 누르면 즉시 봇이 그 답을 하게 된다(배포 불필요).
 */

interface Conversation {
  id: string;
  surface: string;
  entry_path: string | null;
  last_path: string | null;
  escalated: boolean;
  helpful_count: number;
  unhelpful_count: number;
  reviewed: boolean;
  created_at: string;
  updated_at: string;
  first_question?: string;
  title?: string | null;
}

interface Message {
  id: string;
  role: string;
  content: string;
  sources: { id: string; title: string }[];
  rating: number;
  path: string | null;
  latency_ms: number | null;
  created_at: string;
}

interface KbEntryRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  paths: string[];
  audience: string;
  priority: number;
  is_published: boolean;
  updated_at: string;
}

const FILTERS = [
  { value: 'unhelpful', label: '👎 받은 대화', icon: ThumbsDown },
  { value: 'escalated', label: '사람에게 넘어간 대화', icon: AlertTriangle },
  { value: 'all', label: '전체', icon: Bot },
] as const;

const EMPTY_FORM = {
  slug: '',
  title: '',
  summary: '',
  body: '',
  tags: '',
  paths: '',
  audience: 'all',
  priority: '0',
};

export default function AdminAssistantPage() {
  const [tab, setTab] = useState<'conversations' | 'kb'>('conversations');
  const [filter, setFilter] = useState<string>('unhelpful');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [entries, setEntries] = useState<KbEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url =
        tab === 'kb' ? '/api/admin/assistant?tab=kb' : `/api/admin/assistant?filter=${filter}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) setError(json.error);
      if (tab === 'kb') setEntries(json.entries || []);
      else setConversations(json.conversations || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [tab, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openConversation(c: Conversation) {
    setSelected(c);
    setMessages([]);
    const res = await fetch(`/api/admin/assistant?conversationId=${c.id}`);
    const json = await res.json();
    setMessages(json.messages || []);
  }

  async function markReviewed(c: Conversation) {
    await fetch('/api/admin/assistant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: c.id, reviewed: true }),
    });
    setConversations((prev) => prev.map((x) => (x.id === c.id ? { ...x, reviewed: true } : x)));
  }

  function seedFormFromConversation() {
    if (!selected) return;
    const q = selected.first_question || '';
    setForm({
      ...EMPTY_FORM,
      title: q.slice(0, 80),
      tags: q.slice(0, 60),
      paths: selected.last_path || selected.entry_path || '',
      audience: selected.surface === 'megaload' ? 'megaload' : selected.surface === 'pt' ? 'pt' : 'all',
      priority: '120',
    });
    setShowForm(true);
  }

  async function saveEntry() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, priority: Number(form.priority) || 0 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '저장 실패');
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      if (tab === 'kb') void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(slug: string) {
    await fetch('/api/admin/assistant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteKbSlug: slug }),
    });
    setEntries((prev) => prev.filter((e) => e.slug !== slug));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Bot className="h-6 w-6 text-[#E31837]" />
            AI 상담 운영
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            봇이 못 푼 질문을 보고 지식을 보강합니다. 여기서 추가한 항목은 배포 없이 즉시 반영됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setForm({ ...EMPTY_FORM });
              setShowForm(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#E31837] px-3 py-2 text-sm font-semibold text-white hover:bg-[#c8142f]"
          >
            <Plus className="h-4 w-4" /> 지식 추가
          </button>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" /> 새로고침
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200">
        {(['conversations', 'kb'] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setSelected(null);
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t ? 'border-[#E31837] text-[#E31837]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'conversations' ? '상담 기록' : '추가한 지식'}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {tab === 'conversations' ? (
        <>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
                  filter === f.value
                    ? 'bg-[#E31837] text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <f.icon className="h-3.5 w-3.5" />
                {f.label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="max-h-[70vh] divide-y divide-gray-100 overflow-y-auto">
                {loading && <div className="p-6 text-center text-sm text-gray-400">불러오는 중…</div>}
                {!loading && conversations.length === 0 && (
                  <div className="p-6 text-center text-sm text-gray-400">해당하는 대화가 없습니다.</div>
                )}
                {conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => void openConversation(c)}
                    className={`block w-full px-4 py-3 text-left transition hover:bg-gray-50 ${
                      selected?.id === c.id ? 'bg-red-50/50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {c.unhelpful_count > 0 && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          👎 {c.unhelpful_count}
                        </span>
                      )}
                      {c.escalated && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          사람 연결
                        </span>
                      )}
                      {c.reviewed && (
                        <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                          검토됨
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-gray-400">
                        {new Date(c.updated_at).toLocaleString('ko-KR')}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm text-gray-800">
                      {c.first_question || c.title || '(질문 없음)'}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      {c.surface} · {c.last_path || c.entry_path || '-'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {!selected ? (
                <div className="p-10 text-center text-sm text-gray-400">
                  왼쪽에서 대화를 선택하세요.
                </div>
              ) : (
                <div className="flex max-h-[70vh] flex-col">
                  <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
                    <div className="min-w-0 flex-1 text-sm font-semibold text-gray-900">
                      대화 상세
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {selected.surface} · {selected.last_path || '-'}
                      </span>
                    </div>
                    <button
                      onClick={seedFormFromConversation}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#E31837] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#c8142f]"
                    >
                      <BookOpen className="h-3.5 w-3.5" /> 이 질문으로 지식 추가
                    </button>
                    {!selected.reviewed && (
                      <button
                        onClick={() => void markReviewed(selected)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> 검토 완료
                      </button>
                    )}
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto p-4">
                    {messages.map((m) => (
                      <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
                        <div
                          className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                            m.role === 'user' ? 'bg-[#E31837] text-white' : 'bg-gray-50 text-gray-700'
                          }`}
                        >
                          {m.content}
                          {m.role === 'assistant' && (
                            <div className="mt-1.5 text-[10px] text-gray-400">
                              {m.sources?.length ? `근거: ${m.sources.map((s) => s.title).join(' · ')} · ` : ''}
                              {m.latency_ms ? `${(m.latency_ms / 1000).toFixed(1)}초` : ''}
                              {m.rating === -1 ? ' · 👎' : m.rating === 1 ? ' · 👍' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="divide-y divide-gray-100">
            {loading && <div className="p-6 text-center text-sm text-gray-400">불러오는 중…</div>}
            {!loading && entries.length === 0 && (
              <div className="p-6 text-center text-sm text-gray-400">
                추가한 지식이 없습니다. 👎 받은 대화에서 [이 질문으로 지식 추가]를 눌러보세요.
              </div>
            )}
            {entries.map((e) => (
              <div key={e.slug} className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900">{e.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">{e.summary}</div>
                    <div className="mt-1 text-[11px] text-gray-400">
                      {e.audience} · 우선순위 {e.priority} · {e.tags?.join(', ')}
                      {e.paths?.length ? ` · ${e.paths.join(', ')}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setForm({
                        slug: e.slug,
                        title: e.title,
                        summary: e.summary,
                        body: e.body,
                        tags: (e.tags || []).join(', '),
                        paths: (e.paths || []).join(', '),
                        audience: e.audience,
                        priority: String(e.priority),
                      });
                      setShowForm(true);
                    }}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => void deleteEntry(e.slug)}
                    className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="상담봇 지식 추가/수정" maxWidth="max-w-2xl">
        <div className="space-y-3">
          <Field label="제목 (질문 형태로 쓰면 검색이 잘 걸립니다)">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="예) 쿠팡 정산금이 예상보다 적게 들어왔어요"
            />
          </Field>
          <Field label="한 줄 요약">
            <input
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="본문 (마크다운 가능 — 봇이 이 내용을 근거로 답합니다)">
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={10}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-[12.5px]"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="검색 키워드 (쉼표 구분)">
              <input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="정산, 입금, 금액차이"
              />
            </Field>
            <Field label="관련 경로 (쉼표 구분)">
              <input
                value={form.paths}
                onChange={(e) => setForm({ ...form, paths: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="/megaload/settlement"
              />
            </Field>
            <Field label="대상">
              <select
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="all">전체</option>
                <option value="public">비로그인/공개</option>
                <option value="pt">PT 회원</option>
                <option value="megaload">메가로드</option>
              </select>
            </Field>
            <Field label="우선순위 (높을수록 먼저)">
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
            >
              취소
            </button>
            <button
              onClick={() => void saveEntry()}
              disabled={saving || !form.title.trim() || !form.body.trim()}
              className="rounded-lg bg-[#E31837] px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-300"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

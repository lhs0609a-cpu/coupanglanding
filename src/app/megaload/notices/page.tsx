'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Loader2, Sparkles, Pin, RefreshCw } from 'lucide-react';

/**
 * 공지사항 — 특히 **도우미가 업데이트되면 무엇이 좋아졌는지**를 여기서 본다.
 * 업데이트 공지는 릴리스 워크플로가 자동으로 올린다(worker/desktop/RELEASE_NOTES.md 가 원문).
 */

interface Notice {
  id: string;
  title: string;
  content: string;
  category: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string | null;
}

/** 마지막으로 읽은 공지 시각 — 새 글 배지 판정용(브라우저에만 남는다). */
const SEEN_KEY = 'megaload:notices:seenAt';

const CATEGORY_LABEL: Record<string, string> = {
  system: '시스템',
  policy: '정책',
  education: '교육',
  promotion: '이벤트',
};

/**
 * 업데이트 공지인가 — **제목 접두사**로 알아본다.
 *   category 에 'update' 를 넣고 싶었지만 CHECK 제약에 막힌다(마이그레이션 없이 가려고 제목을 쓴다).
 *   이 규칙은 등록하는 쪽(api/megaload/release-notes)의 titleFor 와 짝이다 — 바꾸면 같이 바꿀 것.
 */
const isUpdateNotice = (title: string) => /^도우미 v\d+\.\d+\.\d+ 업데이트/.test(title);

const fmt = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * 공지 본문은 마크다운으로 쓰여 있다(릴리스 노트 원문 그대로).
 * 라이브러리를 끌어오지 않고 필요한 만큼만 그린다 — 목록·굵게·문단.
 */
function NoticeBody({ text }: { text: string }) {
  const blocks = useMemo(() => text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean), [text]);
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
        : <span key={i}>{part}</span>);

  return (
    <div className="space-y-3 text-sm leading-relaxed text-gray-700">
      {blocks.map((b, i) => {
        const lines = b.split('\n').map((l) => l.trim());
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i} className="space-y-1.5 pl-1">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#E31837]" />
                  <span>{inline(l.slice(2))}</span>
                </li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(b.replace(/\n/g, ' '))}</p>;
      })}
    </div>
  );
}

export default function MegaloadNoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seenAt, setSeenAt] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/notices');
      const data = await res.json();
      if (!res.ok) setError(data.error || '공지사항을 불러오지 못했습니다.');
      else setNotices(data.notices || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '네트워크 오류');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 배지 판정을 위해 **먼저 읽고**, 화면을 본 시점을 뒤에 기록한다(순서가 바뀌면 항상 "읽음"이 된다).
    try { setSeenAt(Number(localStorage.getItem(SEEN_KEY) || 0)); } catch { /* 사생활 모드 등 */ }
    load();
  }, [load]);

  useEffect(() => {
    if (loading || notices.length === 0) return;
    try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* skip */ }
  }, [loading, notices.length]);

  const isNew = (n: Notice) => new Date(n.updated_at || n.created_at).getTime() > seenAt;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#E31837]" /> 공지사항
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            도우미가 업데이트되면 무엇이 좋아졌는지 여기에 자동으로 올라옵니다.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          새로고침
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {!loading && !error && notices.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
          아직 공지사항이 없습니다.
        </div>
      )}

      <div className="space-y-4">
        {notices.map((n) => {
          const isUpdate = isUpdateNotice(n.title);
          return (
            <article
              key={n.id}
              className={`rounded-xl border bg-white p-5 ${isUpdate ? 'border-sky-200' : 'border-gray-200'}`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {n.is_pinned && <Pin className="w-3.5 h-3.5 text-amber-500" />}
                  {isUpdate && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                      <Sparkles className="w-3 h-3" /> 업데이트
                    </span>
                  )}
                  {!isUpdate && n.category && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {CATEGORY_LABEL[n.category] || n.category}
                    </span>
                  )}
                  <h2 className="text-base font-bold text-gray-900">{n.title}</h2>
                  {isNew(n) && (
                    <span className="rounded bg-[#E31837] px-1.5 py-0.5 text-[10px] font-bold text-white">NEW</span>
                  )}
                </div>
                <time className="text-xs text-gray-400">{fmt(n.created_at)}</time>
              </div>
              <div className="mt-3">
                <NoticeBody text={n.content} />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

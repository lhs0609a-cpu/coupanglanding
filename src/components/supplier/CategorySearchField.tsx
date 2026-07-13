'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, ChevronRight, Check } from 'lucide-react';

interface CatResult { code: string; path: string; name: string }

/**
 * 카테고리 검색 자동완성 — 몇 글자만 입력하면 매칭 카테고리(전체 경로 트리)를 목록으로.
 * 선택 시 code + path 를 상위로 넘긴다.
 */
export default function CategorySearchField({
  path,
  code,
  onSelect,
}: {
  path: string;
  code: string;
  onSelect: (code: string, path: string) => void;
}) {
  const [q, setQ] = useState(path);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<CatResult[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setQ(path); }, [path]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // 디바운스 검색
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 1) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/supplier/category-search?q=${encodeURIComponent(term)}`);
        const d = await r.json();
        setResults(Array.isArray(d.results) ? d.results : []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const pick = (r: CatResult) => {
    onSelect(r.code, r.path);
    setQ(r.path);
    setOpen(false);
  };

  const renderPath = (p: string) => {
    const seg = p.split('>');
    const leaf = seg.pop();
    return (
      <span className="flex items-center flex-wrap gap-0.5">
        {seg.map((s, i) => (
          <span key={i} className="inline-flex items-center text-gray-400 text-[11px]">{s}<ChevronRight className="w-3 h-3" /></span>
        ))}
        <span className="font-semibold text-gray-900 text-sm">{leaf}</span>
      </span>
    );
  };

  return (
    <div className="relative col-span-2" ref={boxRef}>
      <span className="block text-gray-500 mb-1.5 text-[13px]">카테고리 (검색) *</span>
      <div className="flex items-center gap-1.5 rounded-xl border border-gray-200/80 bg-white/80 px-3 focus-within:ring-2 focus-within:ring-emerald-400/40 focus-within:border-emerald-400 transition">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="예: 감자 · 티셔츠 · 보조배터리 — 몇 글자만 치면 목록이 떠요"
          className="w-full py-2.5 text-sm outline-none bg-transparent placeholder:text-gray-300"
        />
        {code && <span className="shrink-0 text-[11px] text-emerald-600 flex items-center gap-0.5"><Check className="w-3 h-3" />{code}</span>}
        {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />}
      </div>

      {open && q.trim().length >= 1 && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
          {results.length === 0 ? (
            <div className="px-3 py-4 text-sm text-gray-400 text-center">{loading ? '검색 중...' : '결과가 없어요. 다른 단어로 검색해보세요.'}</div>
          ) : (
            results.map((r) => (
              <button key={r.code} type="button" onClick={() => pick(r)}
                className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-gray-50 last:border-0 transition">
                {renderPath(r.path)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

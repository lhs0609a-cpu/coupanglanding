'use client';

import { useState, useEffect } from 'react';
import { X, Cpu, Loader2, RotateCcw, Sparkles, Tag, FileText, Layers, Boxes, MonitorSmartphone } from 'lucide-react';
import type { LlmTask } from './useBulkRegisterActions';

interface LlmRegenModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 단일 상품 모드면 상품명 표시(범위 선택 숨김) */
  singleProductName?: string;
  selectedCount: number;
  totalCount: number;
  progress: { total: number; done: number; error: number; running: boolean; message?: string } | null;
  canUndo: boolean;
  onUndo: () => void;
  /** scope='single'이면 호출부가 단일 상품으로 처리 */
  onRun: (scope: 'single' | 'selected' | 'all', tasks: LlmTask[]) => void;
}

const TASK_DEFS: { key: LlmTask; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: 'display_name', label: '노출상품명', desc: '쿠팡 SEO에 맞게 재작성', icon: <Tag className="w-4 h-4" /> },
  { key: 'content', label: '상세페이지 글', desc: '설득형 본문 재생성', icon: <FileText className="w-4 h-4" /> },
  { key: 'options', label: '옵션/수량값', desc: '상품명·상세에서 재추출', icon: <Boxes className="w-4 h-4" /> },
  { key: 'category', label: '카테고리 매칭', desc: '임베딩 의미 유사도 재매칭', icon: <Layers className="w-4 h-4" /> },
];

export default function LlmRegenModal({
  isOpen, onClose, singleProductName, selectedCount, totalCount, progress, canUndo, onUndo, onRun,
}: LlmRegenModalProps) {
  const single = !!singleProductName;
  const [tasks, setTasks] = useState<Record<LlmTask, boolean>>({
    display_name: true, content: true, options: true, category: false,
  });
  const [scope, setScope] = useState<'selected' | 'all'>('selected');

  useEffect(() => {
    if (isOpen) {
      setTasks({ display_name: true, content: true, options: true, category: false });
      setScope('selected');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const chosen = (Object.keys(tasks) as LlmTask[]).filter((k) => tasks[k]);
  const running = !!progress?.running;
  const targetCount = single ? 1 : scope === 'all' ? totalCount : selectedCount;
  const estJobs = targetCount * chosen.length;

  const handleRun = () => {
    if (chosen.length === 0) return;
    onRun(single ? 'single' : scope, chosen);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-800">
              {single ? '이 상품 AI 재생성' : '전체 상품 AI 재생성'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {single && (
            <div className="text-xs text-gray-500 truncate">대상: <span className="text-gray-800 font-medium">{singleProductName}</span></div>
          )}

          {/* 항목 선택 */}
          <div>
            <div className="text-[11px] font-medium text-gray-600 mb-1.5">재생성할 항목</div>
            <div className="grid grid-cols-2 gap-2">
              {TASK_DEFS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTasks((p) => ({ ...p, [t.key]: !p[t.key] }))}
                  disabled={running}
                  className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition disabled:opacity-50 ${
                    tasks[t.key] ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:border-indigo-200'
                  }`}
                >
                  <span className={tasks[t.key] ? 'text-indigo-600' : 'text-gray-400'}>{t.icon}</span>
                  <div>
                    <div className={`text-xs font-semibold ${tasks[t.key] ? 'text-indigo-700' : 'text-gray-700'}`}>{t.label}</div>
                    <div className="text-[10px] text-gray-500">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 범위 (일괄 모드만) */}
          {!single && (
            <div>
              <div className="text-[11px] font-medium text-gray-600 mb-1.5">범위</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setScope('selected')}
                  disabled={running}
                  className={`p-2 rounded-lg border text-xs font-medium transition disabled:opacity-50 ${
                    scope === 'selected' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'
                  }`}
                >선택 상품 {selectedCount}개</button>
                <button
                  onClick={() => setScope('all')}
                  disabled={running}
                  className={`p-2 rounded-lg border text-xs font-medium transition disabled:opacity-50 ${
                    scope === 'all' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'
                  }`}
                >전체 {totalCount}개</button>
              </div>
            </div>
          )}

          {/* 진행률 */}
          {progress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>{progress.message || `처리 중 ${progress.done}/${progress.total}`}</span>
                <span>{progress.done}/{progress.total}{progress.error ? ` · 실패 ${progress.error}` : ''}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress.total ? Math.round(((progress.done + progress.error) / progress.total) * 100) : 0}%` }} />
              </div>
            </div>
          )}

          {/* 워커 안내 */}
          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <MonitorSmartphone className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span className="text-[11px] text-amber-800">
              AI 처리를 위해 <b>메가로드 도우미</b>가 실행 중이어야 합니다. 꺼져 있으면 작업이 대기열에 등록되고, 도우미를 켜면 자동으로 처리됩니다.
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200">
          <div className="text-[10px] text-gray-400">
            예상 작업 {estJobs}건 · 결과는 각 필드에 자동 반영(되돌리기 가능)
          </div>
          <div className="flex gap-2">
            {canUndo && (
              <button
                onClick={onUndo}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                <RotateCcw className="w-3 h-3" /> 되돌리기
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >닫기</button>
            <button
              onClick={handleRun}
              disabled={running || chosen.length === 0 || targetCount === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {running ? '처리 중...' : 'AI 재생성 시작'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

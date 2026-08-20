'use client';

import { useEffect, useState } from 'react';
import { Bell, Pin, ChevronDown, ChevronUp, Megaphone, AlertTriangle, GraduationCap, Gift } from 'lucide-react';
import Card from '@/components/ui/Card';

type NoticeCategory = 'system' | 'policy' | 'promotion' | 'education' | 'emergency';

interface Notice {
  id: string;
  title: string;
  content: string;
  /** DB 값이라 화면이 모르는 값이나 null 이 올 수 있다 — 좁은 타입으로 받으면 렌더에서 터진다. */
  category: string | null;
  is_pinned: boolean;
  created_at: string;
}

const CATEGORY_CONFIG: Record<NoticeCategory, { label: string; color: string; icon: typeof Bell }> = {
  system: { label: '시스템', color: 'bg-blue-100 text-blue-700', icon: Bell },
  policy: { label: '정책', color: 'bg-purple-100 text-purple-700', icon: Megaphone },
  promotion: { label: '프로모션', color: 'bg-green-100 text-green-700', icon: Gift },
  education: { label: '교육', color: 'bg-amber-100 text-amber-700', icon: GraduationCap },
  emergency: { label: '긴급', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
};

const CATEGORY_TABS: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'system', label: '시스템' },
  { value: 'policy', label: '정책' },
  { value: 'promotion', label: '프로모션' },
  { value: 'education', label: '교육' },
  { value: 'emergency', label: '긴급' },
];

/**
 * 공지사항은 **DB(notices)** 에서 온다.
 *
 * ⚠️ 예전엔 이 자리에 예시 공지 배열이 박혀 있었다. 그래서 관리자가 /admin/notices 로 쓴 공지가
 *    아무에게도 보이지 않았다 — 쓰는 곳(DB)과 보는 곳(이 파일)이 이어져 있지 않았다(실측 2026-08-21).
 */
export default function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/notices');
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) setError(data.error || '공지사항을 불러오지 못했습니다.');
        else setNotices(data.notices || []);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : '네트워크 오류');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filteredNotices = selectedCategory === 'all'
    ? notices
    : notices.filter(n => n.category === selectedCategory);

  function handleToggle(notice: Notice) {
    if (expandedId === notice.id) {
      setExpandedId(null);
    } else {
      setExpandedId(notice.id);
      setReadIds(prev => new Set([...prev, notice.id]));
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Bell className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">공지사항</h1>
          <p className="text-sm text-gray-500">운영 관련 공지 및 안내사항을 확인하세요</p>
        </div>
      </div>

      {/* 카테고리 필터 탭 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {CATEGORY_TABS.map(tab => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setSelectedCategory(tab.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
              selectedCategory === tab.value
                ? 'bg-[#E31837] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {loading && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
          불러오는 중…
        </div>
      )}
      {!loading && !error && filteredNotices.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
          {notices.length === 0 ? '아직 공지사항이 없습니다.' : '이 분류에는 공지가 없습니다.'}
        </div>
      )}

      <div className="space-y-3">
        {filteredNotices.map(notice => {
          // 모르는 분류·null 이면 기본값으로 그린다 — 예전엔 좁은 타입을 믿고 바로 꺼내 썼는데,
          // DB 에 새 분류가 하나만 생겨도 화면이 통째로 터진다.
          const config = CATEGORY_CONFIG[notice.category as NoticeCategory] ?? CATEGORY_CONFIG.system;
          const isRead = readIds.has(notice.id);

          return (
            <Card
              key={notice.id}
              className={`cursor-pointer transition hover:border-gray-300 ${
                notice.is_pinned ? 'border-blue-200 bg-blue-50/30' : ''
              }`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => handleToggle(notice)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {notice.is_pinned && (
                        <Pin className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      )}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                        {config.label}
                      </span>
                      {!isRead && (
                        <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                      )}
                    </div>
                    <h3 className="font-medium text-gray-900">{notice.title}</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(notice.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <div className="flex-shrink-0 mt-1">
                    {expandedId === notice.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </button>

              {expandedId === notice.id && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {notice.content}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

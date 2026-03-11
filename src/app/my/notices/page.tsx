'use client';

import { useState, useEffect } from 'react';
import { Bell, Pin, ChevronDown, ChevronUp } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import type { Notice, NoticeCategory } from '@/lib/supabase/types';
import { NOTICE_CATEGORY_LABELS, NOTICE_CATEGORY_COLORS } from '@/lib/utils/constants';

const CATEGORY_TABS: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'system', label: '시스템' },
  { value: 'policy', label: '정책' },
  { value: 'promotion', label: '프로모션' },
  { value: 'education', label: '교육' },
  { value: 'emergency', label: '긴급' },
];

interface NoticeWithRead extends Notice {
  is_read: boolean;
}

export default function NoticesPage() {
  const [notices, setNotices] = useState<NoticeWithRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchNotices();
  }, [selectedCategory]);

  async function fetchNotices() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.set('category', selectedCategory);

      const res = await fetch(`/api/notices?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조회 실패');
      setNotices(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류 발생');
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(noticeId: string) {
    try {
      // notice_reads에 직접 insert (Supabase client-side)
      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notice_id: noticeId }),
      });
      // POST가 없어도 UI에서 읽음 처리
      if (res.ok || res.status === 405) {
        setNotices(prev => prev.map(n =>
          n.id === noticeId ? { ...n, is_read: true } : n
        ));
      }
    } catch {
      // 읽음 처리 실패해도 무시
    }
  }

  function handleToggle(notice: NoticeWithRead) {
    if (expandedId === notice.id) {
      setExpandedId(null);
    } else {
      setExpandedId(notice.id);
      if (!notice.is_read) {
        markAsRead(notice.id);
      }
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

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

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

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : notices.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500 py-8">공지사항이 없습니다.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notices.map(notice => (
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
                      <Badge
                        label={NOTICE_CATEGORY_LABELS[notice.category] || notice.category}
                        colorClass={NOTICE_CATEGORY_COLORS[notice.category] || 'bg-gray-100 text-gray-700'}
                      />
                      {!notice.is_read && (
                        <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
                      )}
                    </div>
                    <h3 className="font-medium text-gray-900 truncate">{notice.title}</h3>
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
          ))}
        </div>
      )}
    </div>
  );
}

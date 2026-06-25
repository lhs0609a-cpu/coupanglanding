'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tv, Play, X, AlertCircle } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import type { TrainingVideo } from '@/lib/supabase/types';

const CATEGORY_LABEL: Record<string, string> = {
  general: '일반',
  'product-registration': '상품 등록',
  review: '리뷰/이미지',
  ad: '광고',
  settlement: '정산',
  cs: 'CS',
};

const CATEGORY_ORDER = ['product-registration', 'review', 'ad', 'settlement', 'cs', 'general'];

type PublicVideo = Pick<TrainingVideo, 'id' | 'title' | 'description' | 'youtube_id' | 'category' | 'thumbnail_url' | 'duration_seconds' | 'sort_order' | 'created_at'>;

export default function TrainingVideosPage() {
  const [videos, setVideos] = useState<PublicVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [playing, setPlaying] = useState<PublicVideo | null>(null);

  useEffect(() => {
    fetch('/api/training-videos')
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '조회 실패');
        setVideos(json.data || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '오류 발생'))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const present = new Set(videos.map((v) => v.category));
    return ['all', ...CATEGORY_ORDER.filter((c) => present.has(c)), ...Array.from(present).filter((c) => !CATEGORY_ORDER.includes(c))];
  }, [videos]);

  const filtered = useMemo(
    () => (activeCategory === 'all' ? videos : videos.filter((v) => v.category === activeCategory)),
    [videos, activeCategory],
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Tv className="w-7 h-7 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">교육 영상</h1>
        </div>
        <p className="text-sm text-gray-500">메가로드 사용법과 쿠팡 운영 노하우 영상을 시청하세요.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-video bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-gray-400">
            <Tv className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>아직 등록된 교육 영상이 없습니다.</p>
            <p className="text-xs mt-1">곧 업로드될 예정입니다.</p>
          </div>
        </Card>
      ) : (
        <>
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    activeCategory === cat
                      ? 'bg-[#E31837] text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {cat === 'all' ? '전체' : CATEGORY_LABEL[cat] || cat}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((video) => (
              <button
                key={video.id}
                type="button"
                onClick={() => setPlaying(video)}
                className="group text-left bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="relative aspect-video bg-gray-100">
                  {video.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={video.thumbnail_url}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Tv className="w-10 h-10" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition">
                    <div className="w-14 h-14 bg-[#E31837] rounded-full flex items-center justify-center shadow-lg">
                      <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      label={CATEGORY_LABEL[video.category] || video.category}
                      colorClass="bg-purple-50 text-purple-700"
                    />
                  </div>
                  <h3 className="font-medium text-gray-900 text-sm line-clamp-2">{video.title}</h3>
                  {video.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{video.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {playing && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPlaying(null)}
        >
          <div
            className="w-full max-w-4xl bg-black rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
              <h3 className="font-medium truncate">{playing.title}</h3>
              <button
                type="button"
                onClick={() => setPlaying(null)}
                className="p-1 hover:bg-white/10 rounded transition"
                aria-label="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${playing.youtube_id}?autoplay=1&rel=0`}
                title={playing.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
            {playing.description && (
              <div className="px-4 py-3 bg-gray-900 text-gray-300 text-sm whitespace-pre-wrap">
                {playing.description}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

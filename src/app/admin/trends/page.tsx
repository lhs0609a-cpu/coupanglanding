'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TrendingKeyword, NaverKeywordData } from '@/lib/supabase/types';
import { TREND_CATEGORIES, DIFFICULTY_LABELS, SEASONALITY_LABELS } from '@/lib/utils/constants';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import KeywordTrendChart from '@/components/charts/KeywordTrendChart';
import type { TrendDataPoint } from '@/lib/supabase/types';
import type { PeriodOption } from '@/lib/utils/trend-chart';
import { Flame, Plus, RefreshCw, Search, Pencil, Trash2, Eye, EyeOff, BarChart3, Download } from 'lucide-react';

export default function AdminTrendsPage() {
  const [keywords, setKeywords] = useState<TrendingKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('전체');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingKeyword, setEditingKeyword] = useState<TrendingKeyword | null>(null);
  const [naverResult, setNaverResult] = useState<{
    keywordId: string;
    data: NaverKeywordData;
    relatedKeywords: { relKeyword: string; monthlyPcQcCnt: number; monthlyMobileQcCnt: number; compIdx: string }[];
  } | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectAllLoading, setCollectAllLoading] = useState(false);
  const [collectAllProgress, setCollectAllProgress] = useState('');
  const [collectProgress, setCollectProgress] = useState('');
  const [message, setMessage] = useState<{ type: string; text: string }>({ type: '', text: '' });
  // 차트 모달 상태
  const [chartKeyword, setChartKeyword] = useState<TrendingKeyword | null>(null);
  const [chartData, setChartData] = useState<TrendDataPoint[]>([]);
  const [chartPeriod, setChartPeriod] = useState<PeriodOption>('3m');
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  // Form state — 기존 필드
  const [formKeyword, setFormKeyword] = useState('');
  const [formCategory, setFormCategory] = useState('기타');
  const [formScore, setFormScore] = useState(50);
  const [formMemo, setFormMemo] = useState('');
  const [formNaverCategoryId, setFormNaverCategoryId] = useState('');
  // Form state — 인사이트 필드
  const [formSourcingTip, setFormSourcingTip] = useState('');
  const [formKeywordTip, setFormKeywordTip] = useState('');
  const [formSeasonality, setFormSeasonality] = useState('연중');
  const [formMarginRange, setFormMarginRange] = useState('');
  const [formDifficulty, setFormDifficulty] = useState('medium');
  const [formPros, setFormPros] = useState('');
  const [formCons, setFormCons] = useState('');
  const [formPriceMin, setFormPriceMin] = useState<number | ''>('');
  const [formPriceMax, setFormPriceMax] = useState<number | ''>('');
  const [formRelatedKeywords, setFormRelatedKeywords] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const fetchKeywords = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('trending_keywords')
        .select('*')
        .order('trend_score', { ascending: false });

      if (activeCategory !== '전체') {
        query = query.eq('category', activeCategory);
      }

      const { data } = await query;
      setKeywords((data as TrendingKeyword[]) || []);
    } catch {
      console.error('Failed to fetch keywords');
    }
    setLoading(false);
  }, [supabase, activeCategory]);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  const resetForm = () => {
    setFormKeyword('');
    setFormCategory('기타');
    setFormScore(50);
    setFormMemo('');
    setFormNaverCategoryId('');
    setFormSourcingTip('');
    setFormKeywordTip('');
    setFormSeasonality('연중');
    setFormMarginRange('');
    setFormDifficulty('medium');
    setFormPros('');
    setFormCons('');
    setFormPriceMin('');
    setFormPriceMax('');
    setFormRelatedKeywords('');
  };

  const buildInsightPayload = () => ({
    sourcing_tip: formSourcingTip || null,
    keyword_tip: formKeywordTip || null,
    seasonality: formSeasonality || '연중',
    margin_range: formMarginRange || null,
    difficulty: formDifficulty || 'medium',
    pros: formPros ? formPros.split(',').map((s) => s.trim()).filter(Boolean) : [],
    cons: formCons ? formCons.split(',').map((s) => s.trim()).filter(Boolean) : [],
    recommended_price_min: formPriceMin !== '' ? Number(formPriceMin) : null,
    recommended_price_max: formPriceMax !== '' ? Number(formPriceMax) : null,
    related_keywords: formRelatedKeywords ? formRelatedKeywords.split(',').map((s) => s.trim()).filter(Boolean) : [],
  });

  const handleAdd = async () => {
    if (!formKeyword.trim()) return;
    setFormSubmitting(true);
    try {
      const res = await fetch('/api/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: formKeyword.trim(),
          category: formCategory,
          trend_score: formScore,
          memo: formMemo || null,
          naver_category_id: formNaverCategoryId || null,
          ...buildInsightPayload(),
        }),
      });
      if (res.ok) {
        setShowAddModal(false);
        resetForm();
        setMessage({ type: 'success', text: '키워드가 추가되었습니다.' });
        fetchKeywords();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error || '추가 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 오류' });
    }
    setFormSubmitting(false);
  };

  const handleEdit = async () => {
    if (!editingKeyword) return;
    setFormSubmitting(true);
    try {
      const res = await fetch('/api/trends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingKeyword.id,
          keyword: formKeyword.trim(),
          category: formCategory,
          trend_score: formScore,
          memo: formMemo || null,
          ...buildInsightPayload(),
        }),
      });
      if (res.ok) {
        setEditingKeyword(null);
        resetForm();
        setMessage({ type: 'success', text: '키워드가 수정되었습니다.' });
        fetchKeywords();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error || '수정 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 오류' });
    }
    setFormSubmitting(false);
  };

  const openEditModal = (kw: TrendingKeyword) => {
    setEditingKeyword(kw);
    setFormKeyword(kw.keyword);
    setFormCategory(kw.category);
    setFormScore(kw.trend_score);
    setFormMemo(kw.memo || '');
    setFormNaverCategoryId(kw.naver_category_id || '');
    setFormSourcingTip(kw.sourcing_tip || '');
    setFormKeywordTip(kw.keyword_tip || '');
    setFormSeasonality(kw.seasonality || '연중');
    setFormMarginRange(kw.margin_range || '');
    setFormDifficulty(kw.difficulty || 'medium');
    setFormPros(Array.isArray(kw.pros) ? kw.pros.join(', ') : '');
    setFormCons(Array.isArray(kw.cons) ? kw.cons.join(', ') : '');
    setFormPriceMin(kw.recommended_price_min ?? '');
    setFormPriceMax(kw.recommended_price_max ?? '');
    setFormRelatedKeywords(Array.isArray(kw.related_keywords) ? kw.related_keywords.join(', ') : '');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 키워드를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch('/api/trends', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '삭제되었습니다.' });
        fetchKeywords();
      }
    } catch {
      setMessage({ type: 'error', text: '삭제 실패' });
    }
  };

  const handleToggleActive = async (kw: TrendingKeyword) => {
    try {
      await fetch('/api/trends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: kw.id, is_active: !kw.is_active }),
      });
      fetchKeywords();
    } catch {
      setMessage({ type: 'error', text: '상태 변경 실패' });
    }
  };

  const handleNaverCheck = async (kw: TrendingKeyword) => {
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch('/api/trends/naver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId: kw.id, keyword: kw.keyword }),
      });
      if (res.ok) {
        const result = await res.json();
        setNaverResult({
          keywordId: kw.id,
          data: result.data,
          relatedKeywords: result.relatedKeywords,
        });
        fetchKeywords();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error || '네이버 API 오류' });
      }
    } catch {
      setMessage({ type: 'error', text: '네이버 API 호출 실패' });
    }
  };

  const handleBulkUpdate = async () => {
    if (!confirm('모든 활성 키워드의 네이버 트렌드 데이터를 갱신하시겠습니까?')) return;
    setBulkLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch('/api/trends/naver-bulk', {
        method: 'POST',
      });
      if (res.ok) {
        const result = await res.json();
        setMessage({
          type: 'success',
          text: `전체 ${result.total}개 중 ${result.updated}개 갱신 완료${result.errors > 0 ? ` (${result.errors}개 실패)` : ''}`,
        });
        fetchKeywords();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error || '일괄 갱신 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 오류' });
    }
    setBulkLoading(false);
  };

  const handleCollect = async () => {
    if (activeCategory === '전체') {
      setMessage({ type: 'error', text: '자동 수집할 카테고리를 선택해주세요.' });
      return;
    }
    if (!confirm(`"${activeCategory}" 카테고리의 키워드를 자동 수집하시겠습니까?\n시드 키워드 기반으로 상위 100개를 수집합니다.`)) return;
    setCollectLoading(true);
    setCollectProgress(`${activeCategory} 카테고리 수집 중...`);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch('/api/trends/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: activeCategory }),
      });
      if (res.ok) {
        const result = await res.json();
        setMessage({ type: 'success', text: result.message });
        fetchKeywords();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error || '자동 수집 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 오류' });
    }
    setCollectLoading(false);
    setCollectProgress('');
  };

  const handleCollectAll = async () => {
    if (!confirm('전체 11개 카테고리의 키워드를 일괄 수집하시겠습니까?\n카테고리당 상위 100개씩, 약 3~5분 소요됩니다.')) return;
    setCollectAllLoading(true);
    setCollectAllProgress('전체 카테고리 수집 시작...');
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch('/api/trends/collect-all', {
        method: 'POST',
      });
      if (res.ok) {
        const result = await res.json();
        setMessage({ type: 'success', text: result.message });
        fetchKeywords();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error || '전체 수집 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '서버 오류' });
    }
    setCollectAllLoading(false);
    setCollectAllProgress('');
  };

  const fetchChartData = async (kw: TrendingKeyword, period: PeriodOption) => {
    setChartLoading(true);
    setChartError(null);
    try {
      const res = await fetch('/api/trends/datalab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: kw.keyword,
          period,
          categoryId: kw.naver_category_id || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '트렌드 조회 실패');
      }
      const result = await res.json();
      setChartData(result.data || []);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : '트렌드 조회 실패');
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  };

  const handleOpenChart = (kw: TrendingKeyword) => {
    setChartKeyword(kw);
    setChartPeriod('3m');
    setChartData([]);
    fetchChartData(kw, '3m');
  };

  const handleChartPeriodChange = (period: PeriodOption) => {
    setChartPeriod(period);
    if (chartKeyword) {
      fetchChartData(chartKeyword, period);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-red-600';
    if (score >= 50) return 'text-orange-500';
    return 'text-gray-500';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-red-500';
    if (score >= 50) return 'bg-orange-400';
    return 'bg-gray-300';
  };

  const formatNumber = (n: number) => {
    if (typeof n !== 'number' || n < 0) return '< 10';
    return n.toLocaleString();
  };

  const categories = ['전체', ...TREND_CATEGORIES];

  // 인사이트 폼 컴포넌트 (추가/수정 공용)
  const InsightFormFields = () => (
    <>
      <div className="border-t border-gray-200 pt-4 mt-4">
        <h4 className="text-sm font-bold text-gray-700 mb-3">소싱 인사이트</h4>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">소싱 팁</label>
        <textarea
          value={formSourcingTip}
          onChange={(e) => setFormSourcingTip(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent text-sm"
          placeholder="어디서 소싱하면 좋은지, 단가 정보 등"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">키워드 전략 팁</label>
        <textarea
          value={formKeywordTip}
          onChange={(e) => setFormKeywordTip(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent text-sm"
          placeholder="키워드 조합 전략, SEO 팁 등"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">시즌성</label>
          <select
            value={formSeasonality}
            onChange={(e) => setFormSeasonality(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent text-sm"
          >
            {SEASONALITY_LABELS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">진입 난이도</label>
          <select
            value={formDifficulty}
            onChange={(e) => setFormDifficulty(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent text-sm"
          >
            {Object.entries(DIFFICULTY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">예상 마진 범위</label>
        <input
          type="text"
          value={formMarginRange}
          onChange={(e) => setFormMarginRange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent text-sm"
          placeholder="예: 25~40%"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">추천 판매가 (최저)</label>
          <input
            type="number"
            value={formPriceMin}
            onChange={(e) => setFormPriceMin(e.target.value ? Number(e.target.value) : '')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent text-sm"
            placeholder="예: 15900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">추천 판매가 (최고)</label>
          <input
            type="number"
            value={formPriceMax}
            onChange={(e) => setFormPriceMax(e.target.value ? Number(e.target.value) : '')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent text-sm"
            placeholder="예: 29900"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">장점 (쉼표 구분)</label>
        <textarea
          value={formPros}
          onChange={(e) => setFormPros(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent text-sm"
          placeholder="사계절 판매 가능, 반품률 낮음, 재구매율 높음"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">단점 (쉼표 구분)</label>
        <textarea
          value={formCons}
          onChange={(e) => setFormCons(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent text-sm"
          placeholder="경쟁 셀러 많음, 차별화 어려움"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">관련 키워드 (쉼표 구분)</label>
        <textarea
          value={formRelatedKeywords}
          onChange={(e) => setFormRelatedKeywords(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent text-sm"
          placeholder="여성 맨투맨, 오버핏 맨투맨 여자, 무지 맨투맨"
        />
      </div>
    </>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Flame className="w-6 h-6 text-[#E31837]" />
          <h1 className="text-2xl font-bold text-gray-900">트렌드 키워드 관리</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCollectAll}
            disabled={collectAllLoading || collectLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${collectAllLoading ? 'animate-bounce' : ''}`} />
            {collectAllLoading ? '수집 중...' : '전체 카테고리 수집'}
          </button>
          <button
            onClick={handleCollect}
            disabled={collectLoading || collectAllLoading || activeCategory === '전체'}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${collectLoading ? 'animate-bounce' : ''}`} />
            {collectLoading ? '수집 중...' : '자동 수집'}
          </button>
          <button
            onClick={handleBulkUpdate}
            disabled={bulkLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${bulkLoading ? 'animate-spin' : ''}`} />
            전체 트렌드 갱신
          </button>
          <button
            onClick={() => { resetForm(); setShowAddModal(true); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#c81430]"
          >
            <Plus className="w-4 h-4" />
            키워드 추가
          </button>
        </div>
      </div>

      {/* 메시지 */}
      {message.text && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* 수집 진행 상태 */}
      {collectProgress && (
        <div className="p-3 rounded-lg text-sm bg-blue-50 text-blue-700 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          {collectProgress}
        </div>
      )}
      {collectAllProgress && (
        <div className="p-3 rounded-lg text-sm bg-green-50 text-green-700 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          {collectAllProgress}
        </div>
      )}

      {/* 카테고리 탭 */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition ${
              activeCategory === cat
                ? 'bg-[#E31837] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <Card>
        {loading ? (
          <div className="py-8 text-center text-gray-400">불러오는 중...</div>
        ) : keywords.length === 0 ? (
          <div className="py-8 text-center text-gray-400">등록된 키워드가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">키워드</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">카테고리</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">트렌드 점수</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">월간 검색량</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">상품수</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">경쟁강도</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">순위</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">관리</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((kw) => (
                  <tr key={kw.id} className={`border-b border-gray-100 hover:bg-gray-50 ${!kw.is_active ? 'opacity-50' : ''}`}>
                    <td className="py-3 px-4 font-semibold text-gray-900">{kw.keyword}</td>
                    <td className="py-3 px-4">
                      <Badge label={kw.category} colorClass="bg-blue-100 text-blue-700" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${getScoreBg(kw.trend_score)}`}
                            style={{ width: `${kw.trend_score}%` }}
                          />
                        </div>
                        <span className={`text-sm font-bold ${getScoreColor(kw.trend_score)}`}>
                          {kw.trend_score}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {kw.naver_trend_data ? (
                        <span>
                          {formatNumber(kw.naver_trend_data.monthlyPcQcCnt + kw.naver_trend_data.monthlyMobileQcCnt)}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {kw.product_count > 0 ? formatNumber(kw.product_count) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="py-3 px-4">
                      {kw.competition_ratio > 0 ? (
                        <span className={`font-medium ${kw.competition_ratio > 5 ? 'text-red-600' : kw.competition_ratio > 1 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {kw.competition_ratio.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">
                      {kw.rank_daily ? `D${kw.rank_daily}` : '-'} / {kw.rank_weekly ? `W${kw.rank_weekly}` : '-'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenChart(kw)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded"
                          title="트렌드 차트"
                        >
                          <BarChart3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleNaverCheck(kw)}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                          title="트렌드 확인"
                        >
                          <Search className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(kw)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="수정"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(kw)}
                          className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded"
                          title={kw.is_active ? '비활성화' : '활성화'}
                        >
                          {kw.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete(kw.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 추가 모달 */}
      {showAddModal && (
        <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="키워드 추가">
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">키워드 *</label>
              <input
                type="text"
                value={formKeyword}
                onChange={(e) => setFormKeyword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                placeholder="키워드 입력"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              >
                {TREND_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                트렌드 점수: <span className={`font-bold ${getScoreColor(formScore)}`}>{formScore}</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={formScore}
                onChange={(e) => setFormScore(Number(e.target.value))}
                className="w-full accent-[#E31837]"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">네이버 카테고리 ID (선택)</label>
              <input
                type="text"
                value={formNaverCategoryId}
                onChange={(e) => setFormNaverCategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                placeholder="네이버 쇼핑인사이트 카테고리 ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">메모/팁</label>
              <textarea
                value={formMemo}
                onChange={(e) => setFormMemo(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                placeholder="파트너에게 보여줄 소싱 팁이나 메모"
              />
            </div>
            <InsightFormFields />
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={handleAdd}
                disabled={formSubmitting || !formKeyword.trim()}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#c81430] disabled:opacity-50"
              >
                {formSubmitting ? '추가 중...' : '추가'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 수정 모달 */}
      {editingKeyword && (
        <Modal isOpen={!!editingKeyword} onClose={() => { setEditingKeyword(null); resetForm(); }} title="키워드 수정">
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">키워드 *</label>
              <input
                type="text"
                value={formKeyword}
                onChange={(e) => setFormKeyword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              >
                {TREND_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                트렌드 점수: <span className={`font-bold ${getScoreColor(formScore)}`}>{formScore}</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={formScore}
                onChange={(e) => setFormScore(Number(e.target.value))}
                className="w-full accent-[#E31837]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">메모/팁</label>
              <textarea
                value={formMemo}
                onChange={(e) => setFormMemo(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
            </div>
            <InsightFormFields />
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setEditingKeyword(null); resetForm(); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={handleEdit}
                disabled={formSubmitting || !formKeyword.trim()}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[#E31837] rounded-lg hover:bg-[#c81430] disabled:opacity-50"
              >
                {formSubmitting ? '수정 중...' : '수정'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 트렌드 차트 모달 */}
      {chartKeyword && (
        <Modal
          isOpen={!!chartKeyword}
          onClose={() => setChartKeyword(null)}
          title={`${chartKeyword.keyword} — 검색 트렌드`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            <KeywordTrendChart
              keyword={chartKeyword.keyword}
              data={chartData}
              period={chartPeriod}
              onPeriodChange={handleChartPeriodChange}
              loading={chartLoading}
              error={chartError}
            />
            <button
              onClick={() => setChartKeyword(null)}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              닫기
            </button>
          </div>
        </Modal>
      )}

      {/* 네이버 트렌드 결과 모달 */}
      {naverResult && (
        <Modal isOpen={!!naverResult} onClose={() => setNaverResult(null)} title="네이버 키워드 트렌드">
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-bold text-gray-900 mb-3">{naverResult.data.relKeyword}</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">PC 월간 검색수</span>
                  <p className="font-bold text-gray-900">{formatNumber(naverResult.data.monthlyPcQcCnt)}</p>
                </div>
                <div>
                  <span className="text-gray-500">모바일 월간 검색수</span>
                  <p className="font-bold text-gray-900">{formatNumber(naverResult.data.monthlyMobileQcCnt)}</p>
                </div>
                <div>
                  <span className="text-gray-500">PC 평균 클릭수</span>
                  <p className="font-bold text-gray-900">{formatNumber(naverResult.data.monthlyAvePcClkCnt)}</p>
                </div>
                <div>
                  <span className="text-gray-500">모바일 평균 클릭수</span>
                  <p className="font-bold text-gray-900">{formatNumber(naverResult.data.monthlyAveMobileClkCnt)}</p>
                </div>
                <div>
                  <span className="text-gray-500">경쟁도</span>
                  <p className="font-bold text-gray-900">{naverResult.data.compIdx}</p>
                </div>
                <div>
                  <span className="text-gray-500">평균 노출 순위</span>
                  <p className="font-bold text-gray-900">{naverResult.data.plAvgDepth || '-'}</p>
                </div>
              </div>
            </div>

            {naverResult.relatedKeywords.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-700 mb-2">연관 키워드</h4>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="text-left py-2">키워드</th>
                        <th className="text-right py-2">PC</th>
                        <th className="text-right py-2">모바일</th>
                        <th className="text-right py-2">경쟁도</th>
                      </tr>
                    </thead>
                    <tbody>
                      {naverResult.relatedKeywords.map((rk, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-1.5 text-gray-900">{rk.relKeyword}</td>
                          <td className="py-1.5 text-right text-gray-600">{formatNumber(rk.monthlyPcQcCnt)}</td>
                          <td className="py-1.5 text-right text-gray-600">{formatNumber(rk.monthlyMobileQcCnt)}</td>
                          <td className="py-1.5 text-right text-gray-600">{rk.compIdx}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <button
              onClick={() => setNaverResult(null)}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              닫기
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

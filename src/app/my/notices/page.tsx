'use client';

import { useState } from 'react';
import { Bell, Pin, ChevronDown, ChevronUp, Megaphone, AlertTriangle, GraduationCap, Gift } from 'lucide-react';
import Card from '@/components/ui/Card';

type NoticeCategory = 'system' | 'policy' | 'promotion' | 'education' | 'emergency';

interface Notice {
  id: string;
  title: string;
  content: string;
  category: NoticeCategory;
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

const NOTICES: Notice[] = [
  {
    id: '1',
    title: '🎉 메가로드 서비스 정식 오픈 안내',
    content: `안녕하세요, 메가로드를 이용해 주셔서 감사합니다.

메가로드가 정식 오픈되었습니다!

■ 주요 기능 안내
• 대시보드: 매출 현황, 수익 분석을 한눈에 확인
• 정산 관리: 월별 정산 내역 자동 집계 및 조회
• 상품 관리: 쿠팡 상품 일괄 등록/수정 지원
• 1:1 문의: 운영 관련 질문 및 상담 가능

■ 이용 시간
• 24시간 이용 가능 (시스템 점검 시 별도 공지)

앞으로도 더 나은 서비스를 제공하기 위해 노력하겠습니다.
감사합니다.`,
    category: 'system',
    is_pinned: true,
    created_at: '2026-03-14T09:00:00Z',
  },
  {
    id: '2',
    title: '⚠️ 쿠팡 로켓그로스 수수료 정책 변경 안내 (2026년 4월 적용)',
    content: `2026년 4월 1일부터 쿠팡 로켓그로스 수수료 정책이 일부 변경됩니다.

■ 변경 내용
• 카테고리별 판매 수수료율 조정 (일부 카테고리 0.5~1% 인상)
• 반품 처리 수수료 세분화
• 장기 보관 수수료 기준 변경 (90일 → 60일)

■ 적용 일시
• 2026년 4월 1일 00:00부터

■ 상세 내용
• 쿠팡 셀러 포털 > 공지사항에서 카테고리별 세부 수수료율 확인 가능
• 기존 등록 상품도 변경된 수수료율이 적용됩니다

셀러님의 상품 마진율을 미리 점검해 주시기 바랍니다.`,
    category: 'policy',
    is_pinned: true,
    created_at: '2026-03-12T14:00:00Z',
  },
  {
    id: '3',
    title: '📢 3월 셀러 교육 웨비나 일정 안내',
    content: `3월 셀러 교육 웨비나 일정을 안내드립니다.

■ 교육 일정
1. 3/18(화) 14:00 - 쿠팡 상품 등록 최적화 전략
2. 3/20(목) 14:00 - 로켓배송 vs 로켓그로스 선택 가이드
3. 3/25(화) 14:00 - 쿠팡 광고(CPA) 효율적 운영법
4. 3/27(목) 14:00 - 반품/CS 관리 노하우

■ 참여 방법
• 대시보드 > 교육 메뉴에서 신청
• 각 교육 30분 전 접속 링크 문자 발송

■ 특전
• 교육 참여 시 광고비 3만원 쿠폰 지급 (선착순)`,
    category: 'education',
    is_pinned: false,
    created_at: '2026-03-10T10:00:00Z',
  },
  {
    id: '4',
    title: '🎁 신규 셀러 프로모션 - 첫 달 수수료 50% 할인',
    content: `신규 셀러를 위한 특별 프로모션을 진행합니다!

■ 프로모션 내용
• 첫 달 판매 수수료 50% 할인
• 신규 상품 등록 시 검색 노출 부스트 (2주간)
• 광고비 5만원 쿠폰 지급

■ 대상
• 2026년 3월 신규 가입 셀러
• 첫 상품 등록 완료 시 자동 적용

■ 프로모션 기간
• 2026년 3월 1일 ~ 3월 31일

자세한 내용은 대시보드에서 확인해 주세요.`,
    category: 'promotion',
    is_pinned: false,
    created_at: '2026-03-01T09:00:00Z',
  },
  {
    id: '5',
    title: '시스템 점검 안내 (3/16 새벽)',
    content: `시스템 안정화를 위한 정기 점검을 실시합니다.

■ 점검 일시
• 2026년 3월 16일(일) 02:00 ~ 06:00 (약 4시간)

■ 영향 범위
• 점검 시간 동안 대시보드 및 API 일시 중단
• 쿠팡 상품 연동 일시 중단

■ 참고 사항
• 점검 종료 후 정상 이용 가능
• 진행 중인 작업은 점검 전 저장해 주세요

불편을 드려 죄송합니다.`,
    category: 'system',
    is_pinned: false,
    created_at: '2026-03-08T16:00:00Z',
  },
  {
    id: '6',
    title: '쿠팡 셀러 정산 주기 변경 안내',
    content: `쿠팡의 정산 주기 정책이 변경됩니다.

■ 기존
• 월 2회 정산 (1일~15일 → 25일 지급, 16일~말일 → 익월 10일 지급)

■ 변경 후 (4월부터)
• 주 1회 정산으로 변경
• 매주 월요일~일요일 매출 → 다음 주 목요일 지급

■ 장점
• 더 빠른 현금 흐름 확보
• 정산 주기 단축으로 자금 운용 편의성 증가

셀러님의 정산 관리에 참고 부탁드립니다.`,
    category: 'policy',
    is_pinned: false,
    created_at: '2026-03-05T11:00:00Z',
  },
];

export default function NoticesPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const filteredNotices = selectedCategory === 'all'
    ? NOTICES
    : NOTICES.filter(n => n.category === selectedCategory);

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

      <div className="space-y-3">
        {filteredNotices.map(notice => {
          const config = CATEGORY_CONFIG[notice.category];
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

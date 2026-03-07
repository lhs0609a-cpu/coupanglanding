'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Monitor, MousePointer, Camera, CheckCircle2, AlertOctagon } from 'lucide-react';

interface ScreenshotGuideProps {
  type: 'revenue' | 'ad';
}

const GUIDES = {
  revenue: {
    title: '매출 스크린샷 캡처 방법',
    steps: [
      { icon: Monitor, text: '쿠팡 Wing (wing.coupang.com) 에 로그인' },
      { icon: MousePointer, text: '[정산관리] → [정산내역] 메뉴 클릭' },
      { icon: MousePointer, text: '해당 월의 날짜 범위를 설정하고 [조회] 클릭' },
      { icon: Camera, text: '매출 합계 금액이 보이도록 전체 화면 캡처 (PrintScreen 또는 Win+Shift+S)' },
    ],
    checkpoints: [
      '정산 기간(날짜)이 보여야 합니다',
      '매출 합계 금액이 보여야 합니다',
      '쿠팡 Wing 로고/URL이 포함되면 좋습니다',
    ],
    mockup: {
      header: 'wing.coupang.com — 정산관리 > 정산내역',
      rows: [
        { label: '정산기간', value: '2026.02.01 ~ 2026.02.28' },
        { label: '주문수', value: '142건' },
        { label: '판매금액', value: '3,450,200원' },
        { label: '수수료', value: '-345,020원' },
        { label: '정산금액 합계', value: '3,105,180원', highlight: true },
      ],
    },
  },
  ad: {
    title: '광고비 스크린샷 캡처 방법',
    steps: [
      { icon: Monitor, text: '쿠팡 Wing (wing.coupang.com) 에 로그인' },
      { icon: MousePointer, text: '[광고관리] → [리포트] 메뉴 클릭' },
      { icon: MousePointer, text: '해당 월의 날짜 범위를 설정하고 [조회] 클릭' },
      { icon: Camera, text: '광고비 합계가 보이도록 전체 화면 캡처 (PrintScreen 또는 Win+Shift+S)' },
    ],
    checkpoints: [
      '조회 기간(날짜 범위)이 보여야 합니다',
      '총 광고비(소진 금액) 합계가 보여야 합니다',
      '쿠팡 Wing 로고/URL이 포함되면 좋습니다',
    ],
    mockup: {
      header: 'wing.coupang.com — 광고관리 > 리포트',
      rows: [
        { label: '조회기간', value: '2026.02.01 ~ 2026.02.28' },
        { label: '노출수', value: '45,230회' },
        { label: '클릭수', value: '1,847회' },
        { label: '클릭률', value: '4.08%' },
        { label: '총 광고비', value: '511,051원', highlight: true },
      ],
    },
  },
};

export default function ScreenshotGuide({ type }: ScreenshotGuideProps) {
  const [open, setOpen] = useState(false);
  const guide = GUIDES[type];

  return (
    <div className="border border-blue-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition text-left"
      >
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">{guide.title}</span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-blue-600" />
        ) : (
          <ChevronDown className="w-4 h-4 text-blue-600" />
        )}
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-white">
          {/* 단계별 안내 */}
          <div className="space-y-2">
            {guide.steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="text-sm text-gray-700">{step.text}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 화면 예시 (목업) */}
          <div className="border border-gray-300 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-3 py-2 border-b border-gray-300 flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-gray-500 ml-2">{guide.mockup.header}</span>
            </div>
            <div className="p-3 bg-white">
              <table className="w-full text-sm">
                <tbody>
                  {guide.mockup.rows.map((row, i) => (
                    <tr key={i} className={`border-b border-gray-100 last:border-0 ${row.highlight ? 'bg-yellow-50' : ''}`}>
                      <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{row.label}</td>
                      <td className={`py-2 text-right font-medium ${row.highlight ? 'text-blue-700 font-bold text-base' : 'text-gray-900'}`}>
                        {row.value}
                        {row.highlight && (
                          <span className="ml-2 text-xs text-blue-500 font-normal">&larr; 이 금액을 입력</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 체크포인트 */}
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-xs font-medium text-green-700 mb-2">캡처 시 확인사항</p>
            <ul className="space-y-1">
              {guide.checkpoints.map((cp, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-green-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  {cp}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * AI 조작 경고 배너 — 스크린샷 업로드 영역 상단에 표시
 */
export function FraudWarningBanner() {
  return (
    <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg">
      <div className="flex items-start gap-3">
        <AlertOctagon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-red-800">
            스크린샷 조작 시 즉시 계약 해지 및 상품 회수
          </p>
          <ul className="text-xs text-red-700 mt-2 space-y-1 list-disc list-inside">
            <li>AI 생성 이미지, 포토샵 편집, 금액 조작 등 <span className="font-bold">위변조가 적발될 경우</span></li>
            <li>계약 제14조에 따라 <span className="font-bold">즉시 계약 해지</span> 처리됩니다</li>
            <li>등록된 <span className="font-bold">전체 상품이 회수</span>되며, 미정산 수익금은 지급되지 않습니다</li>
            <li>위변조 내역은 기록되며, <span className="font-bold">법적 조치</span>가 진행될 수 있습니다</li>
          </ul>
          <p className="text-xs text-red-600 mt-2 font-medium">
            모든 스크린샷은 EXIF 메타데이터 분석 및 관리자 수동 검증을 거칩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

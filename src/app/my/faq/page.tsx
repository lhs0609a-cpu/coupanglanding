'use client';

<<<<<<< Updated upstream
import { useState, useMemo, useEffect, useCallback } from 'react';
import { HelpCircle, Search, ChevronDown, ChevronUp, BookOpen, TrendingUp, CreditCard, ShieldAlert, Settings, Code, FileText, AlertTriangle, Loader2, MessageCircle } from 'lucide-react';
import Card from '@/components/ui/Card';

type FaqCategory = 'signup' | 'settlement' | 'commission' | 'coupang_api' | 'tax_invoice' | 'penalty' | 'other';
=======
import { useState, useMemo } from 'react';
import { HelpCircle, Search, ChevronDown, ChevronUp, ExternalLink, BookOpen, TrendingUp, Truck, CreditCard, ShieldAlert, Settings, Package, Megaphone } from 'lucide-react';
import Card from '@/components/ui/Card';

type FaqCategory = 'start' | 'product' | 'rocket' | 'advertising' | 'settlement' | 'shipping' | 'penalty' | 'growth' | 'tax';
>>>>>>> Stashed changes

interface FaqItem {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
<<<<<<< Updated upstream
  sort_order: number;
  view_count: number;
}

const CATEGORY_CONFIG: Record<FaqCategory, { label: string; color: string; icon: typeof BookOpen }> = {
  signup: { label: '가입/시작', color: 'bg-blue-100 text-blue-700', icon: BookOpen },
  settlement: { label: '정산', color: 'bg-purple-100 text-purple-700', icon: CreditCard },
  commission: { label: '수수료', color: 'bg-orange-100 text-orange-700', icon: TrendingUp },
  coupang_api: { label: '쿠팡 API', color: 'bg-green-100 text-green-700', icon: Code },
  tax_invoice: { label: '세금/계산서', color: 'bg-teal-100 text-teal-700', icon: FileText },
  penalty: { label: '페널티/정책', color: 'bg-rose-100 text-rose-700', icon: ShieldAlert },
  other: { label: '기타', color: 'bg-gray-100 text-gray-700', icon: Settings },
=======
  source?: string;
}

const CATEGORY_CONFIG: Record<FaqCategory, { label: string; color: string; icon: typeof BookOpen }> = {
  start: { label: '입점/시작', color: 'bg-blue-100 text-blue-700', icon: BookOpen },
  product: { label: '상품등록', color: 'bg-purple-100 text-purple-700', icon: Package },
  rocket: { label: '로켓배송/그로스', color: 'bg-red-100 text-red-700', icon: Truck },
  advertising: { label: '광고/마케팅', color: 'bg-orange-100 text-orange-700', icon: Megaphone },
  settlement: { label: '정산/수수료', color: 'bg-emerald-100 text-emerald-700', icon: CreditCard },
  shipping: { label: '배송/물류', color: 'bg-cyan-100 text-cyan-700', icon: Truck },
  penalty: { label: '페널티/정책', color: 'bg-rose-100 text-rose-700', icon: ShieldAlert },
  growth: { label: '매출성장', color: 'bg-amber-100 text-amber-700', icon: TrendingUp },
  tax: { label: '세금/사업자', color: 'bg-indigo-100 text-indigo-700', icon: Settings },
>>>>>>> Stashed changes
};

const CATEGORY_TABS: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
<<<<<<< Updated upstream
  { value: 'signup', label: '가입/시작' },
  { value: 'settlement', label: '정산' },
  { value: 'commission', label: '수수료' },
  { value: 'coupang_api', label: '쿠팡 API' },
  { value: 'tax_invoice', label: '세금/계산서' },
  { value: 'penalty', label: '페널티/정책' },
  { value: 'other', label: '기타' },
=======
  { value: 'start', label: '입점/시작' },
  { value: 'product', label: '상품등록' },
  { value: 'rocket', label: '로켓배송/그로스' },
  { value: 'advertising', label: '광고/마케팅' },
  { value: 'settlement', label: '정산/수수료' },
  { value: 'shipping', label: '배송/물류' },
  { value: 'penalty', label: '페널티/정책' },
  { value: 'growth', label: '매출성장' },
  { value: 'tax', label: '세금/사업자' },
];

const FAQ_DATA: FaqItem[] = [
  // ═══════════════════════════════════════
  // 입점/시작
  // ═══════════════════════════════════════
  {
    id: 's1',
    category: 'start',
    question: '쿠팡 마켓플레이스에 입점하려면 어떤 서류가 필요한가요?',
    answer: `쿠팡 마켓플레이스 입점에 필요한 서류는 다음과 같습니다:

■ 개인사업자
• 사업자등록증 사본
• 대표자 신분증 사본
• 통장 사본 (정산 입금용)
• 통신판매업 신고증

■ 법인사업자
• 사업자등록증 사본
• 법인등기부등본
• 대표자 신분증 사본
• 법인 통장 사본
• 통신판매업 신고증

■ 통신판매업 신고 방법
• 정부24(gov.kr)에서 온라인 신고 가능
• 구비서류: 사업자등록증, 신분증
• 처리기간: 약 3~5 영업일
• 구청 방문 시 당일 발급 가능

💡 팁: 사업자등록 전 간이과세자 vs 일반과세자 선택을 신중히 하세요. 연 매출 8,000만원 이상 예상 시 일반과세자가 유리합니다 (매입세액 공제 가능).`,
    source: '쿠팡 셀러 가이드',
  },
  {
    id: 's2',
    category: 'start',
    question: '쿠팡 셀러 가입 후 첫 상품 등록까지 얼마나 걸리나요?',
    answer: `쿠팡 셀러 가입부터 첫 판매까지의 일반적인 타임라인:

■ Day 1~2: 셀러 가입 및 서류 제출
• Wing(wing.coupang.com) 가입
• 사업자 서류 업로드
• 정산 계좌 등록

■ Day 2~5: 승인 대기
• 쿠팡 심사 (보통 1~3 영업일)
• 추가 서류 요청 시 +1~2일

■ Day 5~7: 상품 등록
• 카테고리 선택 및 상품 정보 입력
• 상품 이미지 촬영/편집 (최소 500x500px, 권장 1000x1000px)
• 가격 설정 및 배송 정보 입력

■ 빠른 시작을 위한 체크리스트
✅ 사업자등록증 미리 준비
✅ 통신판매업 신고 완료
✅ 상품 사진 미리 촬영 (흰 배경 권장)
✅ 경쟁사 가격 조사 완료
✅ 택배 계약 체결 (CJ대한통운, 한진 등)

💡 팁: 로켓그로스 이용 시 택배 계약이 필요 없어 더 빠르게 시작할 수 있습니다.`,
  },
  {
    id: 's3',
    category: 'start',
    question: '해외 거주자도 쿠팡에 입점할 수 있나요?',
    answer: `해외 거주자의 쿠팡 입점은 조건부로 가능합니다:

■ 가능한 경우
• 한국에 사업자등록이 되어 있는 경우
• 국내 대리인(세무사/법인)을 통한 사업자 등록 후 입점
• 해외 법인이 한국 지사를 설립한 경우

■ 글로벌 셀러 프로그램
• 쿠팡은 '글로벌 셀러' 프로그램을 운영
• 중국, 미국, 일본 등 해외 셀러 입점 지원
• 전담 매니저 배정
• 로켓그로스 물류 서비스 이용 가능

■ 필요 절차
1. 한국 내 사업자등록 (비거주자용)
2. 국내 통장 개설 (비거주자 계좌)
3. 통신판매업 신고
4. 쿠팡 셀러 가입

💡 팁: 세무대리인을 통해 사업자등록과 부가세 신고를 위임하면 한국에 오지 않아도 운영 가능합니다.`,
  },

  // ═══════════════════════════════════════
  // 상품등록
  // ═══════════════════════════════════════
  {
    id: 'p1',
    category: 'product',
    question: '쿠팡 상품 등록 시 검색 상위 노출을 위한 최적화 방법은?',
    answer: `쿠팡 검색 알고리즘(A9+)에 최적화된 상품 등록 방법:

■ 상품명 최적화 (가장 중요!)
• 핵심 키워드를 앞쪽에 배치
• 형식: [브랜드] + [핵심키워드] + [상세스펙] + [수량/용량]
• 예: "오뚜기 진라면 매운맛 멀티팩 120g x 20개"
• 특수문자(★, ●, ♥) 사용 지양 (검색 불이익)
• 글자수: 50~80자 권장

■ 카테고리 정확히 선택
• 잘못된 카테고리 = 검색 노출 불이익
• 경쟁 상품이 등록된 카테고리 참고
• 쿠팡 추천 카테고리 우선 적용

■ 상품 이미지 최적화
• 메인 이미지: 흰 배경, 상품만 (가이드라인 준수)
• 최소 1000x1000px (확대 기능 활성화)
• 이미지 5장 이상 등록 (다양한 각도)
• 상세 이미지에 사용법, 크기 비교, 패키지 포함

■ 검색 태그(키워드) 활용
• 동의어, 유사어 모두 등록
• 계절/이벤트 키워드 추가 (여름용, 설날 등)
• 영문/한글 병기 (예: 텀블러/tumbler)
• 오타 키워드도 포함 (예: 블루투스/블루투쓰)

■ 가격 경쟁력
• 최저가에 가까울수록 노출 우선
• 쿠팡 가격 비교 모듈에서 경쟁사 가격 확인
• 묶음 판매로 단가 경쟁력 확보`,
    source: '쿠팡 셀러 성공 가이드',
  },
  {
    id: 'p2',
    category: 'product',
    question: '쿠팡 상품 상세페이지 작성 시 주의할 점은?',
    answer: `상세페이지는 구매 전환율에 직접적인 영향을 미칩니다:

■ 필수 포함 요소
1. 상품 핵심 특장점 (상단 3초 안에 전달)
2. 실제 사용 이미지/영상
3. 스펙/사이즈 정보 (표 형식)
4. 배송/교환/반품 안내
5. 인증 마크 (KC, 식약처 등)

■ 상세페이지 구성 순서 (권장)
1. 핵심 베네핏 배너 (1장)
2. 상품 특장점 3~5개 (이미지+텍스트)
3. 사용 방법/착용컷
4. 스펙 비교표 (자사 vs 타사)
5. 리뷰 인용/수상 이력
6. 주의사항/AS 안내

■ 금지 사항 (정책 위반)
❌ 타 쇼핑몰 유도 문구 (네이버, 자사몰 등)
❌ 연락처 직접 기재 (전화번호, 카톡ID)
❌ 과대/허위 광고 문구 ("최고", "1등", 의료 효능)
❌ 타사 비방 내용
❌ 저작권 위반 이미지

■ 모바일 최적화 (필수!)
• 쿠팡 구매의 70% 이상이 모바일
• 이미지 가로폭 860px 권장
• 글씨 크기 최소 24px 이상
• 세로로 긴 이미지보다 여러 장으로 분할

💡 팁: A/B 테스트로 전환율이 높은 상세페이지 버전을 찾으세요.`,
  },
  {
    id: 'p3',
    category: 'product',
    question: '쿠팡에서 판매 금지된 상품은 어떤 것들이 있나요?',
    answer: `쿠팡에서 판매가 금지되거나 제한되는 상품 목록:

■ 절대 금지 상품
• 위조품/짝퉁 (브랜드 침해)
• 의약품 (처방전 필요 의약품)
• 총기/화약류
• 마약류/향정신성 물질
• 성인용품 중 일부 (음란물 해당)
• 주류 (별도 면허 필요)
• 담배/전자담배
• 개인정보 관련 상품

■ 조건부 판매 (인증/허가 필요)
• 건강기능식품 → 식약처 인증 필요
• 화장품 → 화장품 제조/수입업 등록
• 전기용품 → KC 인증
• 어린이 제품 → KC 안전인증
• 의료기기 → 식약처 신고/허가
• 식품 → 영업신고/HACCP
• 축산물 → 축산물 판매업 신고

■ 지식재산권 주의
• 브랜드 정품 판매 시: 정품 인증서/구매 영수증 준비
• 병행수입: 통관 서류 + 정품 증빙
• 특허/디자인 침해 상품: 즉시 삭제 + 계정 제재

💡 팁: 확실하지 않으면 쿠팡 Wing > 판매자 지원 > 판매제한 상품 목록을 먼저 확인하세요.`,
  },

  // ═══════════════════════════════════════
  // 로켓배송/그로스
  // ═══════════════════════════════════════
  {
    id: 'r1',
    category: 'rocket',
    question: '로켓배송 vs 로켓그로스 vs 판매자 직배송, 어떤 걸 선택해야 하나요?',
    answer: `쿠팡의 3가지 배송 방식 비교:

■ 로켓배송 (쿠팡 직매입)
• 쿠팡이 상품을 매입 → 쿠팡 물류센터에서 배송
• 장점: 최고 노출 우선순위, 로켓배송 뱃지, 새벽배송
• 단점: 마진이 낮음 (쿠팡이 매입가 결정), 재고 리스크 쿠팡 부담
• 적합: 대량 생산 가능한 브랜드, 안정적 공급 가능한 제조사

■ 로켓그로스 (셀러 입고 → 쿠팡 배송)
• 셀러가 쿠팡 물류센터에 입고 → 쿠팡이 배송 처리
• 장점: 로켓배송 뱃지 부여, 새벽/당일배송, CS 부담 감소
• 단점: 물류비(입고/보관/출고비), 장기보관 수수료
• 적합: 소규모 셀러, 물류 인프라 없는 셀러

■ 판매자 직배송 (마켓플레이스)
• 셀러가 직접 포장/배송
• 장점: 가장 높은 마진, 재고 관리 자유
• 단점: 노출 우선순위 낮음, 배송 지연 시 페널티
• 적합: 핸드메이드, 맞춤 제작, 대형 상품

■ 추천 전략
🔰 초보 셀러: 로켓그로스로 시작 → 판매 데이터 확보
📈 성장 셀러: 인기 상품은 로켓그로스, 테스트 상품은 직배송
🏭 제조사: 로켓배송 입점 협상 (쿠팡 MD 컨택)

💡 팁: 로켓그로스와 직배송을 병행하면 리스크 분산이 가능합니다.`,
    source: '쿠팡 물류 가이드',
  },
  {
    id: 'r2',
    category: 'rocket',
    question: '로켓그로스 입고 절차와 비용은 어떻게 되나요?',
    answer: `로켓그로스 이용 절차와 비용 상세 안내:

■ 입고 절차
1. Wing에서 로켓그로스 신청 및 승인
2. 상품 등록 시 "로켓그로스" 배송 방식 선택
3. 입고 예약 생성 (Wing > 로켓그로스 > 입고관리)
4. 바코드 라벨 출력 및 부착
5. 쿠팡 지정 물류센터로 택배/직접 입고
6. 검수 완료 후 판매 시작 (보통 1~3일)

■ 비용 구조 (2025년 기준, 변동 가능)
• 입고비: 개당 약 200~500원 (크기/무게별)
• 보관비: 일 기준 개당 약 3~15원 (크기별)
• 출고비: 개당 약 1,500~3,000원 (크기/무게별)
• 반품 처리비: 개당 약 2,000~4,000원

■ 장기보관 수수료 주의!
• 90일 초과 보관 시 추가 수수료 부과
• 180일 초과 시 수수료 대폭 증가
• 365일 초과 시 쿠팡이 임의 폐기 가능

■ 비용 절감 팁
✅ 판매 속도에 맞춰 소량 다빈도 입고
✅ 장기 체류 재고 정기 점검 → 반품 출고
✅ 소형/경량 상품이 물류비 효율 높음
✅ 묶음 포장으로 개당 물류비 절감

💡 팁: 월 매출 대비 물류비 비율이 15% 이하면 로켓그로스가 유리합니다.`,
  },

  // ═══════════════════════════════════════
  // 광고/마케팅
  // ═══════════════════════════════════════
  {
    id: 'a1',
    category: 'advertising',
    question: '쿠팡 광고(CPC/CPA)는 어떻게 운영하면 효과적인가요?',
    answer: `쿠팡 광고 종류와 효율적 운영 전략:

■ 광고 종류
1. 쿠팡 CPC 광고 (검색 광고)
   • 키워드 검색 시 상단 노출
   • 클릭당 과금 (최소 70원~)
   • ROI 측정이 명확

2. 브랜드 광고
   • 브랜드 스토어 상단 배너
   • 브랜드 인지도 향상 목적
   • 노출당 과금 (CPM)

3. 디스플레이 광고
   • 쿠팡 메인/카테고리 페이지 배너
   • 대규모 노출 가능
   • 최소 예산 높음

■ CPC 광고 운영 전략
✅ 초기 세팅
• 자동 캠페인으로 시작 → 데이터 수집 (2주)
• 전환되는 키워드 확인 후 수동 캠페인으로 이관
• 일 예산: 최소 1~3만원으로 시작

✅ 키워드 최적화
• 전환율 높은 키워드: 입찰가 상향
• 클릭만 많고 전환 없는 키워드: 제외 처리
• 경쟁 브랜드명 키워드: 조심스럽게 테스트

✅ ROAS 목표
• 식품/소모품: ROAS 300% 이상
• 전자기기: ROAS 500% 이상
• 패션/뷰티: ROAS 200% 이상

■ 광고비 절약 팁
• 주말/심야 입찰가 낮추기
• 시즌 키워드 미리 선점 (설날, 추석 2주 전)
• 상품 리뷰 50개 이상 확보 후 광고 집행 (전환율 ↑)

💡 팁: 광고 ROAS가 200% 미만이면 상품 자체 경쟁력을 먼저 점검하세요.`,
    source: '쿠팡 광고 센터',
  },
  {
    id: 'a2',
    category: 'advertising',
    question: '쿠팡에서 리뷰를 효과적으로 늘리는 방법은?',
    answer: `쿠팡에서 합법적으로 리뷰를 늘리는 검증된 방법들:

■ 쿠팡 공식 리뷰 프로그램
• 상품 체험단 (쿠팡에서 운영)
• 포토리뷰 이벤트 (할인 쿠폰 제공)
• 베스트 리뷰어 프로그램

■ 자연 리뷰 유도 전략
1. 동봉 카드 활용
   • 감사 카드에 리뷰 요청 문구
   • "솔직한 리뷰를 남겨주세요" (별점 강요 금지!)
   • QR코드로 리뷰 페이지 바로가기

2. 제품 품질 관리
   • 포장 퀄리티 향상 → 감성 리뷰 유도
   • 사용 설명서 동봉 → 불만 리뷰 방지
   • 작은 사은품 동봉 → 감동 포인트

3. CS 대응으로 부정 리뷰 방지
   • 불만 리뷰 발생 시 24시간 내 답변
   • 정중한 사과 + 즉각적 해결
   • 교환/환불 적극 처리 → 리뷰 수정 유도

■ 절대 하면 안 되는 것 (계정 정지 사유!)
❌ 리뷰 대가로 현금/상품권 지급
❌ 가짜 리뷰 작성 (가족/지인 동원)
❌ 경쟁사 비방 리뷰
❌ 별점 5점 강요 (동봉 카드에서도 금지)

💡 팁: 리뷰 100개 돌파 시점에서 검색 노출이 급격히 증가합니다. 초기 100개가 가장 중요합니다.`,
  },
  {
    id: 'a3',
    category: 'advertising',
    question: '쿠팡 상품 가격 전략은 어떻게 세워야 하나요?',
    answer: `쿠팡에서 경쟁력 있는 가격 전략 수립 방법:

■ 가격 설정 공식
판매가 = 원가 + 쿠팡 수수료 + 배송비 + 광고비 + 마진

■ 쿠팡 수수료 계산 (카테고리별 상이)
• 식품: 약 10~13%
• 패션: 약 10~15%
• 전자기기: 약 6~10%
• 생활용품: 약 10~12%
• 뷰티: 약 10~13%
※ 로켓그로스: 추가 물류비 포함

■ 가격 전략 유형
1. 침투가격: 최저가로 시작 → 리뷰 확보 → 가격 인상
2. 번들링: 2+1, 대용량 패키지로 단가 경쟁력 확보
3. 차별화: 번들 구성을 다르게 하여 가격 비교 회피

■ 최저가 매칭 전략
• 쿠팡은 "최저가 보상제"를 운영
• 네이버/11번가 대비 쿠팡 최저가 유지 시 노출 우대
• 자동 가격 조정 도구 활용 (Wing 설정)

■ 마진율 권장 기준
• 최소 마진율: 15% 이상 (광고비 제외)
• 권장 마진율: 25~35%
• 광고비 포함 시: 순마진 10% 이상 유지

💡 팁: "로켓와우 할인" 참여 시 노출이 크게 증가하지만, 할인율 만큼 마진이 줄어드니 사전 계산 필수입니다.`,
  },

  // ═══════════════════════════════════════
  // 정산/수수료
  // ═══════════════════════════════════════
  {
    id: 'se1',
    category: 'settlement',
    question: '쿠팡 정산은 언제, 어떻게 이루어지나요?',
    answer: `쿠팡 정산 시스템 상세 안내:

■ 정산 주기
• 기본: 월 2회 정산
  - 1일~15일 매출 → 당월 25일 지급
  - 16일~말일 매출 → 익월 10일 지급
• 구매 확정 기준 (배송 완료 후 자동 확정)

■ 정산 기준일
• 배송 완료 후 구매 확정까지: 약 7~14일
• 고객이 수동 구매확정 시: 즉시 정산 대상
• 반품/교환 시: 처리 완료 후 차감

■ 정산 확인 방법
Wing > 정산관리 > 정산내역에서 확인 가능
• 판매금액, 수수료, 광고비, 물류비 등 항목별 확인
• 엑셀 다운로드 가능

■ 정산 금액 계산
정산액 = 판매가 - 판매수수료 - 배송비(해당 시) - 광고비 - 프로모션 할인분

■ 정산 지연 사유
• 서류 미비 (사업자등록증, 통장 정보 불일치)
• 계정 제재 중
• 정산 보류 (지식재산권 분쟁 등)

💡 팁: 정산 계좌와 사업자등록증의 대표자명이 반드시 일치해야 합니다. 불일치 시 정산이 보류됩니다.`,
  },
  {
    id: 'se2',
    category: 'settlement',
    question: '쿠팡 카테고리별 판매 수수료율은 얼마인가요?',
    answer: `쿠팡 주요 카테고리별 판매 수수료율 (2025년 기준):

■ 주요 카테고리 수수료율
• 식품/건강식품: 10.8%
• 생활용품: 10.8%
• 뷰티/화장품: 10.8%
• 패션의류: 10.8~13.5%
• 패션잡화: 10.8%
• 가전/디지털: 7.6~10.8%
• 컴퓨터/노트북: 6.5~7.6%
• 가구/인테리어: 10.8%
• 스포츠/레저: 10.8%
• 도서: 5.4%
• 유아동: 10.8%
• 반려동물: 10.8%
• 자동차용품: 10.8%

■ 추가 비용 (해당 시)
• 결제 수수료: 판매수수료에 포함
• 로켓그로스 물류비: 별도 (크기/무게별)
• 광고비: 별도 (선택사항)

■ 수수료 절감 방법
• 프로모션 참여 시 수수료 할인 이벤트 활용
• 번들 판매로 건당 수수료 효율화
• 고마진 카테고리 집중 공략

※ 수수료율은 쿠팡 정책에 따라 변경될 수 있으므로, Wing > 수수료 안내에서 최신 정보를 확인하세요.`,
  },

  // ═══════════════════════════════════════
  // 배송/물류
  // ═══════════════════════════════════════
  {
    id: 'sh1',
    category: 'shipping',
    question: '판매자 직배송 시 택배사 선택과 비용 절감 팁은?',
    answer: `직배송 셀러를 위한 택배 가이드:

■ 주요 택배사 비교
1. CJ대한통운: 가장 넓은 커버리지, 안정적, 단가 보통
2. 한진택배: 대형 화물 유리, 비교적 저렴
3. 롯데택배: 중소 셀러 계약 용이
4. 우체국택배: 도서산간 배송 강점, 개인 발송 편리
5. 로젠택배: 소량 발송 시 경쟁력 있는 단가

■ 택배비 협상 팁
• 월 발송량 기준 계약 (100건 이상부터 협상 가능)
• 복수 택배사 견적 비교 후 협상
• 월 500건 이상: 2,500~3,000원/건 가능
• 월 1,000건 이상: 2,000~2,500원/건 가능
• 택배 비교 플랫폼 활용 (스마트택배, 택배파인더 등)

■ 배송비 설정 전략
• 무료배송: 구매 전환율 30% 이상 높음
• 조건부 무료배송: "3만원 이상 무료배송" → 객단가 상승
• 유료배송: 마진이 낮은 저가 상품에 적합

■ 포장 비용 절감
• 택배 박스: 대량 구매 시 개당 200~500원
• 에어캡: 롤 구매 (1롤 약 5,000~10,000원)
• 테이프/스티커: 자체 브랜드 인쇄 시 홍보 효과

💡 팁: 쿠팡은 배송 지연에 엄격합니다. 발송 기한(D+2 영업일) 반드시 준수하세요!`,
  },
  {
    id: 'sh2',
    category: 'shipping',
    question: '반품/교환 처리는 어떻게 해야 하나요?',
    answer: `쿠팡 반품/교환 정책과 효율적 처리 방법:

■ 반품 사유별 비용 부담
1. 고객 단순변심 (수거비: 고객 부담)
   • 배송완료 후 7일 이내
   • 상품 훼손 없는 경우

2. 상품 하자/오배송 (수거비: 셀러 부담)
   • 불량, 파손, 오배송
   • 상품 설명과 다른 경우

■ 반품 처리 절차
1. Wing > 반품관리에서 반품 요청 확인
2. 반품 사유 확인 (단순변심 vs 하자)
3. 반품 승인 처리
4. 상품 수거 (택배사 자동 배정)
5. 상품 도착 확인 후 환불 처리

■ 반품률 줄이는 방법
✅ 상세페이지에 정확한 사이즈/스펙 표기
✅ 실측 사이즈 + 모델 착용컷 (패션)
✅ 포장 강화로 배송 중 파손 방지
✅ 검수 프로세스 강화 (출고 전 이중 체크)
✅ Q&A 빠른 답변으로 구매 전 불안 해소

■ 반품 관련 페널티
• 반품률 과다 시 검색 노출 불이익
• 셀러 귀책 반품 비율 높으면 경고/제재
• 반품 처리 지연 시 자동 환불 처리

💡 팁: 반품 상품의 재판매 가능 여부를 빨리 판단하여 재고에 반영하세요.`,
  },

  // ═══════════════════════════════════════
  // 페널티/정책
  // ═══════════════════════════════════════
  {
    id: 'pe1',
    category: 'penalty',
    question: '쿠팡 셀러 페널티 종류와 대응 방법은?',
    answer: `쿠팡 주요 페널티 유형과 예방/대응 방법:

■ 페널티 유형
1. 배송 지연 페널티
   • 발송기한(D+2) 미준수 시 부과
   • 반복 시 상품 노출 제한

2. 취소율 페널티
   • 셀러 귀책 주문취소 비율 과다 시
   • 재고 부족으로 인한 취소 포함

3. 반품률 페널티
   • 셀러 귀책 반품 비율 과다 시
   • 상품 하자, 오배송 등

4. 지식재산권 침해
   • 위조품 판매, 상표권 침해
   • 즉시 상품 삭제 + 계정 경고

5. 정책 위반
   • 가격 담합, 리뷰 조작
   • 외부 채널 유도
   • 과대/허위 광고

■ 페널티 등급
⚠️ 경고 → 일시 정지 → 영구 정지

■ 대응 방법
1단계: Wing > 셀러 등급 > 페널티 현황 확인
2단계: 이의신청 가능 (증빙 서류 첨부)
3단계: 재발 방지 대책 수립 및 시행

■ 예방 체크리스트
✅ 재고 실시간 관리 (품절 시 즉시 판매 중지)
✅ 발송 기한 엄수 (D+2 이내)
✅ 상품 정보 정확히 기재
✅ 정품 증빙 서류 보관
✅ 고객 CS 24시간 내 응답

💡 팁: 셀러 등급이 높을수록 검색 노출 우대를 받습니다. 페널티 없는 운영이 곧 매출 성장입니다.`,
  },
  {
    id: 'pe2',
    category: 'penalty',
    question: '쿠팡 판매자 등급(골드/실버 등) 시스템은 어떻게 되나요?',
    answer: `쿠팡 판매자 등급 시스템 상세 안내:

■ 등급 체계
🥇 골드 셀러: 최상위 등급
🥈 실버 셀러: 중상위 등급
🥉 일반 셀러: 기본 등급
⚠️ 주의 셀러: 관리 대상

■ 등급 산정 기준 (주요 지표)
1. 배송 준수율: 발송기한 내 정상 발송 비율
2. 고객 만족도: 리뷰 평점, CS 응답률
3. 주문 취소율: 셀러 귀책 취소 비율
4. 반품률: 셀러 귀책 반품 비율
5. 판매 실적: 일정 기간 매출/판매량

■ 등급별 혜택
🥇 골드 셀러
• 검색 결과 상위 노출 우대
• 프로모션 우선 참여권
• 수수료 할인 혜택 (이벤트성)
• 전담 매니저 배정

🥈 실버 셀러
• 검색 노출 일부 우대
• 일부 프로모션 참여 가능

■ 등급 올리는 방법
✅ 배송 준수율 98% 이상 유지
✅ 주문 취소율 1% 이하 유지
✅ 고객 문의 12시간 내 응답
✅ 상품 리뷰 평점 4.0 이상 유지
✅ 반품률 3% 이하 유지

💡 팁: 등급은 보통 직전 90일 데이터 기준으로 산정됩니다. 꾸준한 관리가 중요합니다.`,
  },

  // ═══════════════════════════════════════
  // 매출성장
  // ═══════════════════════════════════════
  {
    id: 'g1',
    category: 'growth',
    question: '쿠팡에서 매출을 빠르게 성장시키는 검증된 전략은?',
    answer: `쿠팡 매출 성장을 위한 단계별 전략:

■ Phase 1: 기반 구축 (월 0~100만원)
• 3~5개 상품 집중 (너무 많이 등록하지 않기)
• 상품명/이미지/상세페이지 완벽하게 최적화
• 경쟁사 대비 5~10% 저렴하게 가격 설정
• 지인 네트워크 활용한 초기 판매 + 리뷰

■ Phase 2: 성장 가속 (월 100~500만원)
• CPC 광고 시작 (일 1~3만원)
• 리뷰 50개 이상 확보된 상품에 광고 집중
• 번들/세트 상품으로 객단가 상승
• 시즌/트렌드 키워드 선점

■ Phase 3: 스케일업 (월 500만원~)
• 로켓그로스 전환 (노출 우대)
• 베스트셀러 카테고리 진입 전략
• 쿠팡 프로모션 적극 참여 (로켓와우 할인 등)
• 상품 라인업 확장 (인기 상품의 변형/연관 상품)

■ 핵심 성장 지표 (KPI)
• 전환율: 5% 이상 (업종 평균 3%)
• 리뷰 평점: 4.5 이상
• 재구매율: 20% 이상 (소모품 기준)
• 광고 ROAS: 300% 이상

■ 매출 공식
매출 = 노출수 × 클릭률 × 전환율 × 객단가
→ 각 지표를 10%씩만 개선해도 매출 46% 증가!

💡 팁: "잘 파는 1개 상품"이 "안 팔리는 100개 상품"보다 낫습니다. 선택과 집중이 핵심입니다.`,
    source: '쿠팡 셀러 성공 사례',
  },
  {
    id: 'g2',
    category: 'growth',
    question: '쿠팡 트렌드 상품/블루오션 찾는 방법은?',
    answer: `쿠팡에서 수익성 높은 상품을 찾는 리서치 방법:

■ 쿠팡 내부 데이터 활용
1. 쿠팡 베스트셀러 분석
   • 카테고리별 베스트셀러 TOP 100 모니터링
   • 신규 진입 상품 주목 (급상승 = 트렌드)
   • 리뷰 수 대비 판매 순위 분석

2. 쿠팡 검색어 분석
   • 자동완성 키워드 = 실시간 수요
   • 연관 검색어 = 파생 상품 기회
   • 검색 결과 상품 수가 적은 키워드 = 블루오션

■ 외부 도구 활용
• 네이버 데이터랩: 검색 트렌드 분석
• 네이버 쇼핑 인사이트: 카테고리별 클릭 추이
• 셀러노트/아이템스카우트: 쿠팡 판매 데이터 분석
• 구글 트렌드: 글로벌 트렌드 선점

■ 블루오션 상품 판별 기준
✅ 월 검색량 1,000~10,000 (너무 적지도 많지도 않게)
✅ 경쟁 상품 수 100개 이하
✅ 상위 상품 리뷰 수 100개 이하 (진입 가능)
✅ 평균 판매가 2만원 이상 (마진 확보)
✅ 가벼운 소형 상품 (물류비 절감)

■ 시즌 상품 캘린더
• 1~2월: 설날 선물세트, 겨울 의류 할인
• 3~4월: 봄맞이 정리, 입학/졸업, 꽃가루 마스크
• 5~6월: 가정의 달 선물, 여름 준비 (선풍기, 제습기)
• 7~8월: 여름 시즌 (물놀이, 캠핑, 냉감 제품)
• 9~10월: 추석 선물, 가을 의류, 할로윈
• 11~12월: 블랙프라이데이, 크리스마스, 연말 선물

💡 팁: 트렌드를 따라가기보다 2~3개월 앞서 준비하는 것이 핵심입니다.`,
  },
  {
    id: 'g3',
    category: 'growth',
    question: '쿠팡 외에 다른 마켓과 동시 판매(멀티채널) 전략은?',
    answer: `멀티채널 판매로 매출을 극대화하는 전략:

■ 주요 판매 채널
1. 쿠팡: 최대 트래픽, 로켓배송 경쟁력
2. 네이버 스마트스토어: 검색 유입 강점, 낮은 수수료
3. 11번가: SKT 고객층, 프로모션 다양
4. G마켓/옥션: 장년층 고객, 경매/딜 문화
5. 위메프/티몬: 소셜커머스, 타임딜 강점
6. 카카오톡 선물하기: 선물 특화
7. 자사 쇼핑몰: 장기적 브랜드 구축

■ 멀티채널 운영 시 주의점
• 가격 통일: 채널별 가격 차이가 크면 고객 불만
• 재고 동기화: 하나의 재고 관리 시스템 사용
• CS 통합: 채널별 CS 분산 → 통합 관리 도구 필요

■ 채널별 특성 활용
• 쿠팡: 소모품/일상용품 (로켓배송 강점)
• 네이버: 브랜드/차별화 상품 (블로그 마케팅 연계)
• 11번가: 전자기기/대형가전
• 카카오: 선물용 패키지 상품

■ 추천 통합 솔루션
• 사방넷, 플레이오토, 셀메이트 등
• 재고/주문/배송 통합 관리
• 자동 가격 조정 기능

💡 팁: 처음부터 모든 채널에 입점하기보다, 쿠팡 + 네이버 2개로 시작하여 점진적으로 확장하세요.`,
  },

  // ═══════════════════════════════════════
  // 세금/사업자
  // ═══════════════════════════════════════
  {
    id: 't1',
    category: 'tax',
    question: '쿠팡 셀러의 세금 신고는 어떻게 해야 하나요?',
    answer: `쿠팡 셀러가 알아야 할 세금 신고 가이드:

■ 부가가치세 (부가세)
• 신고 주기: 연 2회 (1월, 7월) + 예정 신고
  - 1기: 1~6월 매출 → 7월 25일까지 신고
  - 2기: 7~12월 매출 → 다음 해 1월 25일까지 신고
• 간이과세자: 연 1회 (1월)
• 계산: 매출세액 - 매입세액 = 납부세액

■ 종합소득세 (개인사업자)
• 신고 기간: 매년 5월 1일~31일
• 대상: 쿠팡 등 온라인 판매 수입 전체
• 세율: 6~45% (과세표준 구간별 누진)

■ 법인세 (법인사업자)
• 신고 기간: 사업연도 종료 후 3개월 이내
• 세율: 9~24% (2025년 기준)

■ 필수 증빙 서류
✅ 쿠팡 Wing 정산 내역 (엑셀 다운로드)
✅ 매입 세금계산서/영수증
✅ 택배비 영수증
✅ 광고비 증빙
✅ 사무실/창고 임대료 증빙
✅ 포장재/소모품 영수증

■ 절세 팁
• 사업 관련 모든 비용 영수증 보관 (매입세액 공제)
• 사업용 신용카드 등록 (자동 경비 처리)
• 홈택스에서 전자세금계산서 발행
• 세무사 기장 대행: 월 10~15만원 (연 매출 4,800만원 이상 시 추천)
• 사업용 차량, 사무실 비용도 공제 가능

💡 팁: 연 매출 8,000만원 이상이면 간이과세에서 일반과세로 자동 전환됩니다. 미리 부가세 납부를 대비하세요.`,
    source: '국세청 홈택스',
  },
  {
    id: 't2',
    category: 'tax',
    question: '간이과세자 vs 일반과세자, 쿠팡 셀러에게 유리한 것은?',
    answer: `간이과세자와 일반과세자 비교 (쿠팡 셀러 관점):

■ 간이과세자
• 대상: 연 매출 8,000만원 미만
• 부가세: 매출의 1.5~4% (업종별 부가가치율 적용)
• 세금계산서: 발행 불가 (연 매출 4,800만원 미만 시)
• 매입세액 공제: 제한적 (매입액의 0.5% 수준)
• 장점: 세금 부담 적음
• 단점: 세금계산서 발행 못하면 B2B 거래 불리

■ 일반과세자
• 대상: 연 매출 8,000만원 이상 (또는 자발적 선택)
• 부가세: 매출세액(10%) - 매입세액(10%) = 납부
• 세금계산서: 발행 가능
• 매입세액 공제: 전액 가능
• 장점: 매입이 많으면 환급 가능, B2B 거래 유리
• 단점: 기장의무, 세무 관리 복잡

■ 쿠팡 셀러 추천 기준

📌 간이과세자가 유리한 경우
• 연 매출 4,800만원 이하 예상
• 매입이 적은 경우 (해외 직구, 핸드메이드 등)
• 부업으로 소규모 판매

📌 일반과세자가 유리한 경우
• 연 매출 4,800만원 이상 예상
• 매입(원가)이 많은 경우 (도매 사입)
• 세금계산서 발행이 필요한 B2B 거래
• 본격적으로 사업 확장 계획

■ 실전 예시
매출 5,000만원, 매입 3,000만원일 때:
• 간이과세: 부가세 약 100만원
• 일반과세: 부가세 200만원 (500만-300만)
→ 이 경우 간이과세가 유리

매출 1억원, 매입 7,000만원일 때:
• 일반과세: 부가세 300만원 (1,000만-700만)
→ 매입이 많으면 일반과세가 절세

💡 팁: 초기엔 간이과세자로 시작하고, 매출이 커지면 자연스럽게 일반과세자로 전환됩니다.`,
  },
  {
    id: 't3',
    category: 'tax',
    question: '쿠팡 셀러가 경비로 인정받을 수 있는 항목은?',
    answer: `쿠팡 판매 사업에서 경비(비용)로 인정받을 수 있는 항목 총정리:

■ 상품 관련
• 상품 매입비 (원가)
• 포장재 (박스, 에어캡, 테이프 등)
• 라벨/스티커 인쇄비
• 사은품 비용

■ 물류/배송
• 택배비 (계약 택배비)
• 로켓그로스 물류비
• 반품 배송비 (셀러 부담분)
• 창고 임대료

■ 마케팅/광고
• 쿠팡 CPC 광고비
• 상품 촬영비 (사진/영상)
• 상세페이지 제작비 (디자인 외주)
• 인플루언서 마케팅 비용
• 체험단 운영 비용

■ 사무/운영
• 사무실 임대료 (자택 사용 시 일부 인정)
• 인터넷/통신비
• 사무용품 (프린터, 잉크, 용지 등)
• 컴퓨터/모니터 (감가상각)
• 소프트웨어 구독료 (사방넷, 포토샵 등)

■ 인건비
• 직원 급여/4대보험
• 아르바이트 인건비
• 외주비 (디자인, CS 대행 등)

■ 기타
• 세무사 기장 비용
• 사업용 차량 유류비/감가상각
• 교육/세미나 참가비
• 사업 관련 도서 구입비

■ 증빙 방법
✅ 전자세금계산서 (가장 확실)
✅ 사업용 신용카드 (홈택스 등록)
✅ 현금영수증 (사업자번호로 발급)
✅ 계좌이체 영수증 + 거래명세서

💡 팁: 사업용 신용카드를 홈택스에 등록하면 매입세액이 자동으로 집계됩니다. 개인 카드와 반드시 분리하세요!`,
  },
>>>>>>> Stashed changes
];

/** 간단한 마크다운 렌더러 (이미지, 볼드, 링크 지원) */
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 이미지: ![alt](url)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      elements.push(
        <img
          key={i}
          src={imgMatch[2]}
          alt={imgMatch[1]}
          className="my-3 rounded-lg max-w-full h-auto border border-gray-200"
          loading="lazy"
        />
      );
      continue;
    }

    // 인라인 이미지가 포함된 라인
    if (line.includes('![')) {
      const parts: React.ReactNode[] = [];
      let remaining = line;
      let partIdx = 0;
      const inlineImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      let match;
      let lastIndex = 0;

      while ((match = inlineImgRegex.exec(remaining)) !== null) {
        if (match.index > lastIndex) {
          parts.push(<span key={`t${partIdx++}`}>{remaining.slice(lastIndex, match.index)}</span>);
        }
        parts.push(
          <img
            key={`img${partIdx++}`}
            src={match[2]}
            alt={match[1]}
            className="inline-block my-2 rounded-lg max-w-full h-auto border border-gray-200"
            loading="lazy"
          />
        );
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < remaining.length) {
        parts.push(<span key={`t${partIdx++}`}>{remaining.slice(lastIndex)}</span>);
      }
      elements.push(<div key={i}>{parts}</div>);
      continue;
    }

    // 헤더: 【...】
    if (line.startsWith('【') && line.endsWith('】')) {
      elements.push(
        <h4 key={i} className="font-bold text-gray-900 mt-4 mb-1 text-sm">
          {line}
        </h4>
      );
      continue;
    }

    // 구분선
    if (line.match(/^-{3,}$/)) {
      elements.push(<hr key={i} className="my-3 border-gray-200" />);
      continue;
    }

    // 볼드 처리 **text**
    const renderInline = (text: string): React.ReactNode => {
      const boldParts = text.split(/\*\*(.+?)\*\*/g);
      if (boldParts.length === 1) return text;
      return boldParts.map((part, idx) =>
        idx % 2 === 1 ? <strong key={idx} className="font-semibold text-gray-900">{part}</strong> : part
      );
    };

    // 빈 줄
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // 일반 텍스트
    elements.push(
      <div key={i} className="leading-relaxed">
        {renderInline(line)}
      </div>
    );
  }

  return elements;
}

export default function FaqPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

<<<<<<< Updated upstream
  const fetchFaqs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/faqs');
      if (!res.ok) throw new Error('FAQ 조회 실패');
      const json = await res.json();
      setFaqs(json.data || []);
      setError(null);
    } catch {
      setError('FAQ를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

=======
>>>>>>> Stashed changes
  const filteredFaqs = useMemo(() => {
    let result = FAQ_DATA;

    if (selectedCategory !== 'all') {
      result = result.filter(f => f.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        f => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
      );
    }

    return result;
  }, [selectedCategory, searchQuery]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: FAQ_DATA.length };
    for (const faq of FAQ_DATA) {
      counts[faq.category] = (counts[faq.category] || 0) + 1;
    }
    return counts;
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: faqs.length };
    for (const faq of faqs) {
      counts[faq.category] = (counts[faq.category] || 0) + 1;
    }
    return counts;
  }, [faqs]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-green-100 rounded-lg">
          <HelpCircle className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">자주 묻는 질문</h1>
          <p className="text-sm text-gray-500">쿠팡 셀러 운영에 필요한 핵심 정보를 모았습니다</p>
        </div>
      </div>

      {/* 검색 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="궁금한 내용을 검색하세요... (예: 수수료, 로켓그로스, 세금)"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837]"
        />
      </div>

      {/* 카테고리 필터 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {CATEGORY_TABS.map(tab => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setSelectedCategory(tab.value)}
            className={`px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition flex items-center gap-1.5 ${
              selectedCategory === tab.value
                ? 'bg-[#E31837] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
            <span className={`text-xs ${
              selectedCategory === tab.value ? 'text-white/70' : 'text-gray-400'
            }`}>
              {categoryCounts[tab.value] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* 결과 카운트 */}
      {searchQuery && (
        <p className="text-sm text-gray-500 mb-3">
          검색 결과: {filteredFaqs.length}개
        </p>
      )}

<<<<<<< Updated upstream
      {/* 로딩 */}
      {loading ? (
        <Card>
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-gray-300 mx-auto mb-3 animate-spin" />
            <p className="text-gray-500">FAQ를 불러오는 중...</p>
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div className="text-center py-12">
            <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-3" />
            <p className="text-red-500">{error}</p>
            <button
              type="button"
              onClick={fetchFaqs}
              className="mt-3 text-sm text-[#E31837] hover:underline"
            >
              다시 시도
            </button>
          </div>
        </Card>
      ) : filteredFaqs.length === 0 ? (
=======
      {filteredFaqs.length === 0 ? (
>>>>>>> Stashed changes
        <Card>
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-1">
              {searchQuery ? '검색 결과가 없습니다' : '해당 카테고리에 FAQ가 없습니다'}
            </p>
            <p className="text-sm text-gray-400">다른 키워드나 카테고리를 선택해보세요</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredFaqs.map(faq => {
<<<<<<< Updated upstream
            const config = CATEGORY_CONFIG[faq.category] || CATEGORY_CONFIG.other;
=======
            const config = CATEGORY_CONFIG[faq.category];
>>>>>>> Stashed changes
            const isExpanded = expandedId === faq.id;

            return (
              <div
                key={faq.id}
                className={`bg-white rounded-xl border transition-all ${
                  isExpanded ? 'border-gray-300 shadow-sm' : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-3"
                  onClick={() => setExpandedId(isExpanded ? null : faq.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${config.color}`}>
                      {config.label}
                    </span>
                    <span className="font-medium text-gray-900 text-sm">
                      {faq.question}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-100">
<<<<<<< Updated upstream
                    <div className="pt-4 text-sm text-gray-700">
                      {renderMarkdown(faq.answer)}
                    </div>
=======
                    <div className="pt-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {faq.answer}
                    </div>
                    {faq.source && (
                      <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-400">
                        <ExternalLink className="w-3 h-3" />
                        출처: {faq.source}
                      </div>
                    )}
>>>>>>> Stashed changes
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 하단 안내 */}
      <div className="mt-8 p-4 bg-gray-50 rounded-xl text-center">
        <p className="text-sm text-gray-500">
          원하는 답변을 찾지 못하셨나요?
        </p>
        <a
          href="/my/support"
          className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-[#E31837] hover:underline"
        >
          <MessageCircle className="w-4 h-4" />
          1:1 문의하기
        </a>
      </div>
    </div>
  );
}

'use client';

import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { BUSINESS_INFO } from '@/lib/constants/business-info';

const toc = [
  { id: 'article-1', title: '목적' },
  { id: 'article-2', title: '청약철회' },
  { id: 'article-3', title: '구독 서비스 환불' },
  { id: 'article-4', title: 'PT 서비스 환불' },
  { id: 'article-5', title: '환불 불가 사유' },
  { id: 'article-6', title: '환불 절차' },
  { id: 'article-7', title: '서비스 장애 보상' },
  { id: 'article-8', title: '부칙' },
];

export default function RefundPage() {
  return (
    <LegalPageLayout
      title="환불정책"
      lastUpdated={BUSINESS_INFO.effectiveDate}
      toc={toc}
    >
      {/* 환불 시나리오 요약 테이블 */}
      <div className="not-prose mb-10 overflow-x-auto">
        <h3 className="text-base font-bold text-gray-900 mb-4">
          환불 시나리오 요약
        </h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left p-3 border border-gray-200 font-semibold text-gray-900">
                구분
              </th>
              <th className="text-left p-3 border border-gray-200 font-semibold text-gray-900">
                환불 기준
              </th>
              <th className="text-left p-3 border border-gray-200 font-semibold text-gray-900">
                환불 금액
              </th>
            </tr>
          </thead>
          <tbody className="text-gray-600">
            <tr>
              <td className="p-3 border border-gray-200">
                무료 체험 중 해지
              </td>
              <td className="p-3 border border-gray-200">체험 기간 내</td>
              <td className="p-3 border border-gray-200 text-green-700 font-medium">
                비용 없음
              </td>
            </tr>
            <tr className="bg-gray-50/50">
              <td className="p-3 border border-gray-200">
                월간 구독 7일 이내
              </td>
              <td className="p-3 border border-gray-200">
                결제일로부터 7일 이내
              </td>
              <td className="p-3 border border-gray-200 text-green-700 font-medium">
                전액 환불
              </td>
            </tr>
            <tr>
              <td className="p-3 border border-gray-200">
                월간 구독 7일 초과
              </td>
              <td className="p-3 border border-gray-200">
                결제일로부터 7일 초과
              </td>
              <td className="p-3 border border-gray-200">
                잔여 기간 일할 계산
              </td>
            </tr>
            <tr className="bg-gray-50/50">
              <td className="p-3 border border-gray-200">연간 구독 환불</td>
              <td className="p-3 border border-gray-200">사용 기간에 따라</td>
              <td className="p-3 border border-gray-200">
                월 정가 기준 차감 후 환불
              </td>
            </tr>
            <tr>
              <td className="p-3 border border-gray-200">PT 시작 전</td>
              <td className="p-3 border border-gray-200">첫 세션 시작 전</td>
              <td className="p-3 border border-gray-200 text-green-700 font-medium">
                전액 환불
              </td>
            </tr>
            <tr className="bg-gray-50/50">
              <td className="p-3 border border-gray-200">PT 진행 중</td>
              <td className="p-3 border border-gray-200">진행률에 따라</td>
              <td className="p-3 border border-gray-200">
                비율 차감 후 환불
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 제1조 */}
      <h2 id="article-1">제1조 (목적)</h2>
      <p>
        이 환불정책은 {BUSINESS_INFO.companyName}(이하 &quot;회사&quot;)가
        제공하는 {BUSINESS_INFO.serviceName} 서비스(이하 &quot;서비스&quot;)의
        이용료 환불에 관한 사항을 규정합니다. 이 정책은 이용약관의 일부를
        구성하며, 「전자상거래 등에서의 소비자보호에 관한 법률」 등 관련 법령을
        준수합니다.
      </p>

      {/* 제2조 */}
      <h2 id="article-2">제2조 (청약철회)</h2>
      <p>
        「전자상거래 등에서의 소비자보호에 관한 법률」 제17조에 따라 회원은 서비스
        결제일로부터 7일 이내에 청약철회를 할 수 있습니다.
      </p>
      <ul>
        <li>
          청약철회 기간 내 환불 요청 시 전액 환불됩니다.
        </li>
        <li>
          다만 서비스를 실질적으로 이용한 경우(상품 등록 처리 등), 이용한 부분에
          대한 비용을 공제한 후 환불될 수 있습니다.
        </li>
        <li>
          디지털 콘텐츠의 특성상, 서비스 이용이 개시된 이후에는 「전자상거래법」
          제17조 제2항 제5호에 따라 청약철회가 제한될 수 있습니다. 이 경우 회사는
          청약철회 제한 사실을 사전에 고지합니다.
        </li>
      </ul>

      {/* 제3조 */}
      <h2 id="article-3">제3조 (구독 서비스 환불)</h2>
      <h3>1. 월간 구독</h3>
      <ul>
        <li>
          <strong>결제일로부터 7일 이내:</strong> 전액 환불 (서비스 미이용 시)
        </li>
        <li>
          <strong>결제일로부터 7일 초과:</strong> 잔여 기간을 일할 계산하여 환불
          (환불 금액 = 결제 금액 × 잔여일수 ÷ 30)
        </li>
        <li>
          환불 시 이미 사용한 API 호출, 상품 등록 건수에 대한 비용이 추가로 공제될
          수 있습니다.
        </li>
      </ul>
      <h3>2. 연간 구독</h3>
      <ul>
        <li>
          <strong>결제일로부터 7일 이내:</strong> 전액 환불 (서비스 미이용 시)
        </li>
        <li>
          <strong>결제일로부터 7일 초과:</strong> 사용 기간에 대해 월 정가(비할인
          가격) 기준으로 비용을 차감한 후 잔액을 환불합니다.
        </li>
      </ul>
      <h3>3. 무료 체험</h3>
      <ul>
        <li>
          무료 체험 기간 중에는 이용료가 부과되지 않으므로 별도의 환불 절차가
          없습니다.
        </li>
        <li>
          무료 체험 종료 후 유료 전환이 이루어진 경우 상기 월간/연간 구독 환불
          정책이 적용됩니다.
        </li>
      </ul>

      {/* 제4조 */}
      <h2 id="article-4">제4조 (PT 서비스 환불)</h2>
      <ul>
        <li>
          <strong>첫 세션 시작 전:</strong> 전액 환불
        </li>
        <li>
          <strong>전체 세션의 1/3 미만 진행:</strong> 결제 금액의 2/3 환불
        </li>
        <li>
          <strong>전체 세션의 1/3 이상 ~ 1/2 미만 진행:</strong> 결제 금액의 1/2
          환불
        </li>
        <li>
          <strong>전체 세션의 1/2 이상 진행:</strong> 환불 불가
        </li>
      </ul>
      <p>
        PT 서비스 환불 시 이미 제공된 교육 자료(PDF, 동영상 등)에 대한 비용은
        공제됩니다.
      </p>

      {/* 제5조 */}
      <h2 id="article-5">제5조 (환불 불가 사유)</h2>
      <p>다음 각 호에 해당하는 경우에는 환불이 제한됩니다.</p>
      <ul>
        <li>
          회원의 귀책사유로 서비스 이용이 불가능한 경우 (계정 정지, 약관 위반 등)
        </li>
        <li>서비스를 통한 상품 등록이 완료된 이후의 등록 건수에 대한 환불</li>
        <li>이벤트, 프로모션 등 특별 할인으로 제공된 서비스 (별도 고지된 경우)</li>
        <li>
          쿠팡 정책 변경, 쿠팡 API 변경 등 회사의 귀책사유가 아닌 외부 요인에 의한
          서비스 이용 불가
        </li>
      </ul>

      {/* 제6조 */}
      <h2 id="article-6">제6조 (환불 절차)</h2>
      <ul>
        <li>
          환불 신청은 서비스 내 &quot;마이페이지&quot; 또는 이메일(
          {BUSINESS_INFO.email})을 통해 접수할 수 있습니다.
        </li>
        <li>
          환불 신청 접수 후 3~7영업일 이내에 환불이 처리됩니다.
        </li>
        <li>
          환불은 원칙적으로 결제 시 사용한 수단과 동일한 방법으로 처리됩니다.
        </li>
        <li>
          카드 결제의 경우 카드사 사정에 따라 환불 처리에 추가 시일이 소요될 수
          있습니다.
        </li>
      </ul>
      <div className="not-prose my-6 p-5 bg-blue-50 border border-blue-100 rounded-xl">
        <h4 className="text-sm font-bold text-blue-900 mb-2">환불 절차 안내</h4>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>마이페이지 또는 이메일로 환불 신청</li>
          <li>환불 사유 확인 및 환불 금액 산정 (1~2영업일)</li>
          <li>환불 금액 안내 및 동의 확인</li>
          <li>환불 처리 (동의 후 3~5영업일)</li>
          <li>환불 완료 알림</li>
        </ol>
      </div>

      {/* 제7조 */}
      <h2 id="article-7">제7조 (서비스 장애 보상)</h2>
      <ul>
        <li>
          회사의 귀책사유로 서비스가 연속 24시간 이상 중단된 경우, 중단 기간만큼
          이용 기간을 무상으로 연장합니다.
        </li>
        <li>
          월 누적 서비스 장애 시간이 72시간을 초과하는 경우, 해당 월 이용료의
          50%를 환불합니다.
        </li>
        <li>
          쿠팡 API, OpenAI API 등 외부 서비스의 장애로 인한 서비스 중단은 회사의
          귀책사유에 해당하지 않습니다.
        </li>
      </ul>

      {/* 제8조 */}
      <h2 id="article-8">제8조 (부칙)</h2>
      <ul>
        <li>이 환불정책은 {BUSINESS_INFO.effectiveDate}부터 시행합니다.</li>
        <li>
          이 환불정책에 명시되지 않은 사항은 이용약관 및 관련 법령에 따릅니다.
        </li>
        <li>
          이 환불정책과 이용약관이 상충하는 경우 환불정책이 우선 적용됩니다.
        </li>
      </ul>

      <p className="text-sm text-gray-400 mt-8">
        환불 관련 문의: {BUSINESS_INFO.email}
      </p>
    </LegalPageLayout>
  );
}

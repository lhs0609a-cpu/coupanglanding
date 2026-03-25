'use client';

import LegalPageLayout from '@/components/legal/LegalPageLayout';
import { BUSINESS_INFO } from '@/lib/constants/business-info';

const toc = [
  { id: 'article-1', title: '개인정보의 처리 목적' },
  { id: 'article-2', title: '처리하는 개인정보 항목' },
  { id: 'article-3', title: '개인정보의 보유 및 이용 기간' },
  { id: 'article-4', title: '개인정보의 제3자 제공' },
  { id: 'article-5', title: '개인정보 처리의 위탁' },
  { id: 'article-6', title: '개인정보의 파기 절차 및 방법' },
  { id: 'article-7', title: '정보주체의 권리·의무 및 행사 방법' },
  { id: 'article-8', title: '안전성 확보 조치' },
  { id: 'article-9', title: '쿠키의 사용' },
  { id: 'article-10', title: '개인정보 보호책임자' },
  { id: 'article-11', title: '개인정보 처리방침의 변경' },
  { id: 'article-12', title: '권익침해 구제방법' },
];

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="개인정보 처리방침"
      lastUpdated={BUSINESS_INFO.effectiveDate}
      toc={toc}
    >
      <p>
        {BUSINESS_INFO.companyName}(이하 &quot;회사&quot;)는 「개인정보 보호법」
        제30조에 따라 정보주체의 개인정보를 보호하고 이와 관련한 고충을 신속하고
        원활하게 처리할 수 있도록 다음과 같이 개인정보 처리방침을 수립·공개합니다.
      </p>

      {/* 제1조 */}
      <h2 id="article-1">제1조 (개인정보의 처리 목적)</h2>
      <p>
        회사는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는
        개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며, 이용 목적이
        변경되는 경우에는 「개인정보 보호법」 제18조에 따라 별도의 동의를 받는 등
        필요한 조치를 이행할 예정입니다.
      </p>
      <ul>
        <li>
          <strong>회원 가입 및 관리:</strong> 회원 가입의사 확인, 서비스 제공에
          따른 본인 식별·인증, 회원자격 유지·관리, 서비스 부정이용 방지
        </li>
        <li>
          <strong>서비스 제공:</strong> 쿠팡 상품 등록 자동화, AI 카테고리 매칭,
          상품명 생성, 가격 계산, 대량 등록 서비스 제공
        </li>
        <li>
          <strong>요금 결제 및 정산:</strong> 유료 서비스 이용에 따른 결제 처리,
          구독 관리, 환불 처리
        </li>
        <li>
          <strong>고충 처리:</strong> 민원인의 신원 확인, 민원사항 확인, 사실조사를
          위한 연락·통지, 처리결과 통보
        </li>
        <li>
          <strong>마케팅 및 서비스 개선:</strong> 신규 서비스 개발, 이벤트 및
          광고성 정보 제공, 접속 빈도 파악, 서비스 이용 통계
        </li>
      </ul>

      {/* 제2조 */}
      <h2 id="article-2">제2조 (처리하는 개인정보 항목)</h2>
      <p>회사는 다음의 개인정보 항목을 처리하고 있습니다.</p>

      <h3>1. 회원 가입 시 수집 항목</h3>
      <ul>
        <li>
          <strong>필수:</strong> 이름, 이메일 주소, 비밀번호, 전화번호
        </li>
        <li>
          <strong>선택:</strong> 사업자등록번호, 상호명, 쿠팡 Wing API 키(Access
          Key, Secret Key)
        </li>
      </ul>

      <h3>2. 서비스 이용 과정에서 수집되는 항목</h3>
      <ul>
        <li>
          <strong>자동 수집:</strong> IP 주소, 쿠키, 접속 일시, 서비스 이용 기록,
          기기 정보(브라우저 종류, OS)
        </li>
        <li>
          <strong>결제 정보:</strong> 결제 수단 정보, 결제 기록
        </li>
      </ul>

      <h3>3. PT 서비스 이용 시 추가 수집 항목</h3>
      <ul>
        <li>쿠팡 셀러 계정 정보, 판매 카테고리, 사업 규모</li>
      </ul>

      {/* 제3조 */}
      <h2 id="article-3">제3조 (개인정보의 보유 및 이용 기간)</h2>
      <p>
        회사는 법령에 따른 개인정보 보유·이용 기간 또는 정보주체로부터 개인정보를
        수집 시 동의받은 개인정보 보유·이용 기간 내에서 개인정보를 처리·보유합니다.
      </p>
      <table>
        <thead>
          <tr>
            <th>구분</th>
            <th>보유 기간</th>
            <th>근거 법률</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>계약 또는 청약철회 등에 관한 기록</td>
            <td>5년</td>
            <td>전자상거래법</td>
          </tr>
          <tr>
            <td>대금결제 및 재화 등의 공급에 관한 기록</td>
            <td>5년</td>
            <td>전자상거래법</td>
          </tr>
          <tr>
            <td>소비자의 불만 또는 분쟁처리에 관한 기록</td>
            <td>3년</td>
            <td>전자상거래법</td>
          </tr>
          <tr>
            <td>표시·광고에 관한 기록</td>
            <td>6개월</td>
            <td>전자상거래법</td>
          </tr>
          <tr>
            <td>웹사이트 방문 기록</td>
            <td>3개월</td>
            <td>통신비밀보호법</td>
          </tr>
        </tbody>
      </table>

      {/* 제4조 */}
      <h2 id="article-4">제4조 (개인정보의 제3자 제공)</h2>
      <p>
        회사는 정보주체의 개인정보를 제1조에서 명시한 범위 내에서만 처리하며,
        원칙적으로 제3자에게 제공하지 않습니다. 다만 다음의 경우에는 예외로 합니다.
      </p>
      <ul>
        <li>정보주체가 사전에 동의한 경우</li>
        <li>법률에 특별한 규정이 있거나 법령상 의무를 준수하기 위한 경우</li>
        <li>
          <strong>쿠팡 Wing API 연동:</strong> 회원이 설정한 쿠팡 API 키를 통해
          쿠팡 플랫폼에 상품 정보를 전송합니다. 이 과정에서 회원의 API 키와 상품
          데이터가 쿠팡 서버로 전달됩니다.
        </li>
      </ul>

      {/* 제5조 */}
      <h2 id="article-5">제5조 (개인정보 처리의 위탁)</h2>
      <p>
        회사는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를
        위탁하고 있습니다.
      </p>
      <table>
        <thead>
          <tr>
            <th>수탁업체</th>
            <th>위탁 업무</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase Inc.</td>
            <td>데이터베이스 호스팅, 사용자 인증</td>
          </tr>
          <tr>
            <td>OpenAI, Inc.</td>
            <td>AI 기반 카테고리 매칭, 상품명 생성</td>
          </tr>
          <tr>
            <td>Vercel Inc.</td>
            <td>웹 애플리케이션 호스팅</td>
          </tr>
          <tr>
            <td>Cloudflare, Inc.</td>
            <td>이미지 저장(R2 스토리지), CDN 서비스</td>
          </tr>
        </tbody>
      </table>

      {/* 제6조 */}
      <h2 id="article-6">제6조 (개인정보의 파기 절차 및 방법)</h2>
      <p>
        회사는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게
        되었을 때에는 지체 없이 해당 개인정보를 파기합니다.
      </p>
      <h3>1. 파기 절차</h3>
      <p>
        불필요한 개인정보는 개인정보의 처리가 불필요한 것으로 인정되는 날로부터
        5일 이내에 그 개인정보를 파기합니다.
      </p>
      <h3>2. 파기 방법</h3>
      <ul>
        <li>
          <strong>전자적 파일 형태:</strong> 복구 및 재생이 불가능한 방법으로 영구
          삭제
        </li>
        <li>
          <strong>기록물, 인쇄물, 서면:</strong> 분쇄기로 분쇄하거나 소각
        </li>
      </ul>

      {/* 제7조 */}
      <h2 id="article-7">제7조 (정보주체의 권리·의무 및 행사 방법)</h2>
      <p>정보주체는 회사에 대해 언제든지 다음 각 호의 권리를 행사할 수 있습니다.</p>
      <ul>
        <li>개인정보 열람 요구</li>
        <li>오류 등이 있을 경우 정정 요구</li>
        <li>삭제 요구</li>
        <li>처리정지 요구</li>
      </ul>
      <p>
        위 권리 행사는 회사에 대해 이메일({BUSINESS_INFO.email})로 할 수 있으며,
        회사는 이에 대해 지체 없이 조치하겠습니다.
      </p>

      {/* 제8조 */}
      <h2 id="article-8">제8조 (안전성 확보 조치)</h2>
      <p>
        회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.
      </p>
      <ul>
        <li>
          <strong>개인정보 암호화:</strong> 비밀번호는 bcrypt 해시 처리, 쿠팡 API
          키는 AES-256 암호화 저장
        </li>
        <li>
          <strong>접근 권한 관리:</strong> 개인정보에 대한 접근 권한을 최소
          인원으로 제한
        </li>
        <li>
          <strong>보안 프로그램 설치:</strong> SSL/TLS 256비트 암호화 통신 적용
        </li>
        <li>
          <strong>접속 기록 보관:</strong> 개인정보 처리 시스템에 대한 접속 기록을
          최소 1년 이상 보관·관리
        </li>
      </ul>

      {/* 제9조 */}
      <h2 id="article-9">제9조 (쿠키의 사용)</h2>
      <p>
        회사는 이용자에게 개별적인 맞춤 서비스를 제공하기 위해 쿠키(Cookie)를
        사용합니다.
      </p>
      <h3>1. 쿠키의 사용 목적</h3>
      <ul>
        <li>로그인 상태 유지, 사용자 인증</li>
        <li>서비스 이용 설정 저장</li>
        <li>이용 통계 수집 및 서비스 개선</li>
      </ul>
      <h3>2. 쿠키 거부 방법</h3>
      <p>
        이용자는 웹 브라우저 설정을 통해 쿠키 저장을 거부할 수 있습니다. 다만,
        쿠키 저장을 거부할 경우 로그인이 필요한 일부 서비스 이용이 제한될 수
        있습니다.
      </p>

      {/* 제10조 */}
      <h2 id="article-10">제10조 (개인정보 보호책임자)</h2>
      <p>
        회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와
        관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보
        보호책임자를 지정하고 있습니다.
      </p>
      <div className="not-prose bg-gray-50 rounded-xl border border-gray-100 p-5 my-4">
        <p className="text-sm text-gray-600">
          <strong className="text-gray-900">개인정보 보호책임자</strong>
        </p>
        <p className="text-sm text-gray-600 mt-1">
          성명: {BUSINESS_INFO.representative}
        </p>
        <p className="text-sm text-gray-600">직책: 대표</p>
        <p className="text-sm text-gray-600">
          이메일: {BUSINESS_INFO.email}
        </p>
        <p className="text-sm text-gray-600">
          전화: {BUSINESS_INFO.phone}
        </p>
      </div>

      {/* 제11조 */}
      <h2 id="article-11">제11조 (개인정보 처리방침의 변경)</h2>
      <p>이 개인정보 처리방침은 시행일로부터 적용됩니다.</p>
      <ul>
        <li>
          개인정보 처리방침이 변경되는 경우 변경사항을 시행일 7일 전부터
          웹사이트를 통해 공지합니다.
        </li>
        <li>
          중요한 변경사항(수집 항목, 이용 목적, 제3자 제공 등)이 있는 경우 시행일
          30일 전부터 공지하며, 필요한 경우 이용자 동의를 다시 받겠습니다.
        </li>
      </ul>

      {/* 제12조 */}
      <h2 id="article-12">제12조 (권익침해 구제방법)</h2>
      <p>
        정보주체는 개인정보 침해로 인한 구제를 받기 위하여 개인정보분쟁조정위원회,
        한국인터넷진흥원 개인정보침해신고센터 등에 분쟁해결이나 상담 등을 신청할 수
        있습니다.
      </p>
      <div className="not-prose bg-gray-50 rounded-xl border border-gray-100 p-5 my-4 space-y-2">
        <p className="text-sm text-gray-600">
          <strong className="text-gray-900">
            개인정보분쟁조정위원회:
          </strong>{' '}
          (국번없이) 1833-6972 | www.kopico.go.kr
        </p>
        <p className="text-sm text-gray-600">
          <strong className="text-gray-900">
            개인정보침해신고센터 (한국인터넷진흥원):
          </strong>{' '}
          (국번없이) 118 | privacy.kisa.or.kr
        </p>
        <p className="text-sm text-gray-600">
          <strong className="text-gray-900">대검찰청:</strong> (국번없이) 1301 |
          www.spo.go.kr
        </p>
        <p className="text-sm text-gray-600">
          <strong className="text-gray-900">경찰청:</strong> (국번없이) 182 |
          ecrm.cyber.go.kr
        </p>
      </div>

      <p className="text-sm text-gray-400 mt-8">
        이 개인정보 처리방침은 {BUSINESS_INFO.effectiveDate}부터 적용됩니다.
      </p>
    </LegalPageLayout>
  );
}

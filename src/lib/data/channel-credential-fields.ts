/**
 * 채널별 자격증명 입력 필드 — 연동 마법사 마지막 단계에서 키를 입력받아
 * /api/megaload/channels/test 와 /credentials 에 보내는 키 스키마.
 *
 * 여기 key 는 각 어댑터의 authenticate(credentials) 가 읽는 키와 일치해야 한다.
 * 토스/카카오는 공개 등록 API 가 없어 필드 없음(준비중).
 */
import type { Channel } from '@/lib/megaload/types';

export interface CredentialField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  optional?: boolean;
}

export const CHANNEL_CREDENTIAL_FIELDS: Partial<Record<Channel, CredentialField[]>> = {
  coupang: [
    { key: 'vendorId', label: '판매자 ID (Vendor ID)', placeholder: '예: A00012345' },
    { key: 'accessKey', label: 'Access Key', placeholder: '쿠팡 윙 API Key 관리에서 발급' },
    { key: 'secretKey', label: 'Secret Key', placeholder: '발급 시 1회만 표시', secret: true },
  ],
  naver: [
    { key: 'clientId', label: 'Client ID (애플리케이션 ID)', placeholder: '네이버 커머스 앱 ID' },
    { key: 'clientSecret', label: 'Client Secret', placeholder: '$2a$04$... 형태', secret: true },
  ],
  elevenst: [
    { key: 'apiKey', label: 'API Key (openapikey)', placeholder: '11번가 셀러 API 키', secret: true },
    { key: 'skAppKey', label: 'SK Open API Key (선택)', placeholder: '카테고리용 · 비워도 됨', optional: true },
  ],
  gmarket: [
    { key: 'masterId', label: 'ESM+ 마스터 ID', placeholder: 'ESM 마스터 계정 ID' },
    { key: 'sellerId', label: 'G마켓 셀러 ID', placeholder: 'G마켓 판매자 ID' },
    { key: 'secretKey', label: 'HMAC Secret Key', placeholder: '이메일 신청으로 발급', secret: true },
  ],
  auction: [
    { key: 'masterId', label: 'ESM+ 마스터 ID', placeholder: 'ESM 마스터 계정 ID' },
    { key: 'sellerId', label: '옥션 셀러 ID', placeholder: '옥션 판매자 ID' },
    { key: 'secretKey', label: 'HMAC Secret Key', placeholder: '이메일 신청으로 발급', secret: true },
  ],
  lotteon: [
    { key: 'sellerId', label: '판매자 ID', placeholder: '롯데온 판매자 ID' },
    { key: 'apiKey', label: 'API Key', placeholder: '스토어센터 OpenAPI 관리에서 발급', secret: true },
    { key: 'accountNo', label: '거래처번호', placeholder: '거래처 번호' },
  ],
  // 테무 — 자체개발 앱(SDA) 기준. partner.temu.com 에서 앱 승인 후 appKey/appSecret 이 나오고,
  // access_token 은 셀러센터(kr.seller.temu.com) > 앱 및 서비스 > 앱스토어에서 앱 승인 시 발급된다.
  // 우리가 ISV 앱을 게시하는 방식으로 바꾸면 appKey/appSecret 은 서버 환경변수로 옮기고
  // 여기엔 accessToken 한 줄만 남는다(샵플링 등 국내 OMS 가 쓰는 방식).
  temu: [
    { key: 'appKey', label: 'App Key', placeholder: 'partner.temu.com 앱 승인 후 발급' },
    { key: 'appSecret', label: 'App Secret', placeholder: '앱 상세에서 확인', secret: true },
    { key: 'accessToken', label: 'Access Token', placeholder: '셀러센터 > 앱 및 서비스 > 앱스토어에서 복사', secret: true },
  ],
};

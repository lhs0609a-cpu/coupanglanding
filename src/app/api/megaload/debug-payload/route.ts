import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAuthenticatedAdapter } from '@/lib/megaload/adapters/factory';
import { CoupangAdapter } from '@/lib/megaload/adapters/coupang.adapter';
import { ensureMegaloadUser } from '@/lib/megaload/ensure-user';

/**
 * GET — 쿠팡 API 연결 테스트 + 디버그 정보 반환
 * 프록시 경유 출고지 목록 조회로 인증 동작 확인
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = await createServiceClient();
    const shUserId = await ensureMegaloadUser(supabase, serviceClient, user.id);

    const adapter = await getAuthenticatedAdapter(serviceClient, shUserId, 'coupang');
    const coupangAdapter = adapter as CoupangAdapter;
    const vendorId = coupangAdapter.getVendorId();

    // 카테고리 메타 조회 테스트 (58786 = 한방음료) — 3개 엔드포인트 시도
    let noticeMeta = null;
    try {
      noticeMeta = await coupangAdapter.getNoticeCategoryFields('58786');
    } catch (e) {
      noticeMeta = { error: e instanceof Error ? e.message : String(e) };
    }

    // 고시정보 카테고리 테스트: 모든 가능한 카테고리명으로 최소 페이로드 전송
    const noticeTestResults: Record<string, string> = {};
    const testCategories = [
      '식품(농수산물)', '가공식품', '건강기능식품', '영유아용품',
      '화장품', '의류', '구두/신발', '가방', '패션잡화(모자/벨트/액세서리)',
      '침구류/커튼', '가구(침대/소파/싱크대/DIY제품)', '영상가전(TV류)',
      '가정용 전기제품(냉장고/세탁기/식기세척기/전자레인지)', '계절가전(에어컨/온풍기)',
      '사무용기기(컴퓨터/노트북/프린터)', '광학기기(디지털카메라/캠코더)',
      '소형전자(MP3/전자사전/전자계산기 등)', '휴대폰', '내비게이션',
      '자동차용품(자동차부품/기타 자동차용품)', '의료기기', '주방용품',
      '귀금속/보석/시계류', '악기', '스포츠용품', '서적',
      '호텔/펜션 숙박권', '여행상품', '항공권', '자동차 대여 서비스(렌터카)',
      '물품대여 서비스(정수기, 비데, 공기청정기 등)',
      '디지털 콘텐츠(음원, 게임, 인터넷 강의 등)', '상품권/쿠폰',
      '기타 재화', '생활화학제품 및 살균살충제', '살생물제품', '기타 용역',
    ];

    // 유력 카테고리별 정확한 상세명으로 테스트
    const NOTICE_TEMPLATES: Record<string, { name: string; details: string[] }> = {
      '가공식품': { name: '가공식품', details: ['식품의 유형', '생산자 및 소재지', '제조연월일, 유통기한 또는 품질유지기한', '포장단위별 내용물의 용량(중량), 수량', '원재료명 및 함량', '영양성분', '유전자변형식품에 해당하는 경우의 표시', '소비자안전을 위한 주의사항', '수입식품에 해당하는 경우 "수입식품안전관리 특별법에 따른 수입신고를 필함"의 문구', '소비자상담 관련 전화번호'] },
      '건강기능식품': { name: '건강기능식품', details: ['식품의 유형', '제조업소의 명칭과 소재지', '제조연월일, 유통기한 또는 품질유지기한', '포장단위별 내용물의 용량(중량), 수량', '원재료명 및 함량', '영양정보', '기능정보', '섭취량, 섭취방법 및 섭취 시 주의사항 및 부작용 가능성', '질병의 예방 및 치료를 위한 의약품이 아니라는 내용의 표현', '유전자변형건강기능식품에 해당하는 경우의 표시', '수입식품에 해당하는 경우 "수입식품안전관리 특별법에 따른 수입신고를 필함"의 문구', '소비자상담 관련 전화번호'] },
      '식품(농수산물)': { name: '식품(농수산물)', details: ['품목 또는 명칭', '포장단위별 내용물의 용량(중량), 수량, 크기', '생산자, 수입품의 경우 수입자를 함께 표기', '농수산물의 원산지 표시에 관한 법률에 따른 원산지', '제조연월일, 유통기한 또는 품질유지기한', '농산물 - 농약잔류량 및 방사능 검사 합격 유무', '유전자변형농수산물 표시', '상품구성', '보관방법 또는 취급방법', '소비자상담 관련 전화번호'] },
      '기타 재화': { name: '기타 재화', details: ['품명 및 모델명', '법에 의한 인증·허가 등을 받았음을 확인할 수 있는 경우 그에 대한 사항', '제조국 또는 원산지', '제조자, 수입품의 경우 수입자를 함께 표기', 'A/S 책임자와 전화번호 또는 소비자상담 관련 전화번호'] },
    };

    const testCategories = Object.keys(NOTICE_TEMPLATES);

    for (const catName of testCategories) {
      const template = NOTICE_TEMPLATES[catName];
      try {
        const testPayload = {
          displayCategoryCode: 58786,
          sellerProductName: 'TEST_NOTICE_' + catName,
          vendorId,
          saleStartedAt: '2026-03-28T00:00:00',
          saleEndedAt: '2099-01-01T23:59:59',
          brand: 'TEST',
          generalProductName: 'TEST',
          deliveryMethod: 'SEQUENCIAL',
          deliveryCompanyCode: 'CJGLS',
          deliveryChargeType: 'FREE',
          deliveryCharge: 0,
          freeShipOverAmount: 0,
          deliveryChargeOnReturn: 2500,
          remoteAreaDeliverable: 'N',
          unionDeliveryType: 'NOT_UNION_DELIVERY',
          returnCenterCode: 'NO_RETURN_CENTERCODE',
          returnChargeName: 'test',
          companyContactNumber: '010-0000-0000',
          returnZipCode: '06159',
          returnAddress: '서울특별시 강남구',
          returnAddressDetail: '테스트',
          returnCharge: 2500,
          outboundShippingPlaceCode: 74010,
          vendorUserId: 'test',
          requested: false,
          items: [{
            itemName: 'test',
            originalPrice: 10000,
            salePrice: 10000,
            maximumBuyCount: 1,
            maximumBuyForPerson: 0,
            maximumBuyForPersonPeriod: 1,
            outboundShippingTimeDay: 2,
            unitCount: 1,
            adultOnly: 'EVERYONE',
            taxType: 'TAX',
            parallelImported: 'NOT_PARALLEL_IMPORTED',
            overseasPurchased: 'NOT_OVERSEAS_PURCHASED',
            pccNeeded: 'false',
            externalVendorSku: 'TEST_NOTICE',
            emptyBarcode: true,
            emptyBarcodeReason: 'test',
            certifications: [{ certificationType: 'NOT_REQUIRED', certificationCode: '' }],
            images: [{ imageOrder: 0, imageType: 'REPRESENTATION', vendorPath: 'https://via.placeholder.com/500' }],
            notices: template.details.map(d => ({
              noticeCategoryName: template.name,
              noticeCategoryDetailName: d,
              content: '상세페이지 참조',
            })),
            attributes: [{ attributeTypeName: '수량', attributeValueName: '1개' }],
            contents: [{ contentsType: 'TEXT', contentDetails: [{ content: 'test', detailType: 'TEXT' }] }],
          }],
          manufacture: 'TEST',
        };

        const path = '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products';
        const res = await (coupangAdapter as any).coupangApi('POST', path, '', testPayload);
        const code = res?.code || res?.data?.code || '';
        const msg = res?.message || res?.data?.message || '';
        if (code === 'ERROR' || code === 'error') {
          if (String(msg).includes('입력할 수 없습니다') || String(msg).includes('subschemas')) {
            noticeTestResults[catName] = 'REJECTED';
          } else {
            noticeTestResults[catName] = `ERROR: ${String(msg).slice(0, 150)}`;
          }
        } else {
          // 진짜 성공!
          const pid = String(res?.data?.data || res?.data || '');
          noticeTestResults[catName] = `SUCCESS (id=${pid})`;
          // 테스트 상품 삭제
          if (pid && pid !== 'null' && pid !== 'undefined') {
            try { await (coupangAdapter as any).coupangApi('DELETE', `/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/${pid}`); } catch {}
          }
          break; // 성공 찾으면 중단
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('입력할 수 없습니다') || msg.includes('subschemas')) {
          noticeTestResults[catName] = 'REJECTED';
        } else {
          noticeTestResults[catName] = `THROW: ${msg.slice(0, 100)}`;
        }
      }
    }

    const rawMeta = noticeTestResults;

    return NextResponse.json({
      vendorId,
      proxyUrl: process.env.COUPANG_PROXY_URL || '(not set)',
      proxySecretSet: !!process.env.COUPANG_PROXY_SECRET,
      shUserId,
      noticeMeta,
      rawMeta: rawMeta ? JSON.stringify(rawMeta).slice(0, 3000) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}

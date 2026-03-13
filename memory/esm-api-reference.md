# ESM Trading API Reference (G마켓/옥션)

> Last updated: 2026-03-13
> Official docs: https://etapi.gmarket.com (formerly etapi.ebaykorea.com)
> Support: etapihelp@gmail.com
> Key issuance: et_api@ebay.co.kr

---

## 1. Base URL

```
Production: https://sa2.esmplus.com
```

All API calls use this base. Documentation previously referenced `sa.esmplus.com` but current endpoints all use `sa2.esmplus.com`.

---

## 2. Authentication - JWT (HS256 HMAC)

### 2.1 Key Issuance

- **Requirements**: Must be a G마켓/옥션 seller with ESM+ login and Master ID
- **Process**: Email `et_api@ebay.co.kr` with your 판매자마스터ID to request Secret Key
- **Keys issued**: Access Key (Master ID) + Secret Key (for HMAC signing)
- Key pairs can be reissued on loss or expiration

### 2.2 JWT Token Structure

```
Authorization: Bearer {base64(header)}.{base64(payload)}.{signature}
```

#### Header
```json
{
  "alg": "HS256",
  "typ": "JWT",
  "kid": "{ESM+ Master ID}"
}
```
- `kid`: Always the Master ID (hosting companies must use their hosting Master ID)

#### Payload
```json
{
  "iss": "{token issuer domain, e.g. www.yoursite.com}",
  "sub": "sell",
  "aud": "sa.esmplus.com",
  "iat": 1503294000,
  "ssi": "A:{auction_seller_id},G:{gmarket_seller_id}"
}
```
- `iss`: Your client domain/identifier
- `sub`: Fixed "sell" for Sell API
- `aud`: Fixed "sa.esmplus.com"
- `iat`: Unix timestamp (seconds) when token was issued
- `ssi`: Site ID + Seller ID. "A" = Auction, "G" = G마켓. Comma-separated for both sites.

#### Signature
```
HMAC-SHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret_key
)
```

### 2.3 Token Generation Example (Node.js)

```typescript
import jwt from 'jsonwebtoken';

function generateESMToken(
  masterID: string,
  secretKey: string,
  auctionSellerId: string,
  gmarketSellerId: string
): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
    kid: masterID
  };

  const payload = {
    iss: 'your-app-domain.com',
    sub: 'sell',
    aud: 'sa.esmplus.com',
    iat: Math.floor(Date.now() / 1000),
    ssi: `A:${auctionSellerId},G:${gmarketSellerId}`
  };

  return jwt.sign(payload, secretKey, {
    algorithm: 'HS256',
    header
  });
}

// Usage in API call:
// headers: { 'Authorization': `Bearer ${token}` }
```

---

## 3. Product APIs

Base path: `/item/v1/`

### 3.1 Product CRUD

| Operation | Method | URL |
|-----------|--------|-----|
| Register | POST | `/item/v1/goods` |
| Modify | PUT | `/item/v1/goods/{goodsNo}` |
| Retrieve | GET | `/item/v1/goods/{goodsNo}` |
| Delete | DELETE | `/item/v1/goods/{goodsNo}` |
| Convert Legacy | POST | `/item/v1/goods/convert-legacy-goods` |
| Search/List | POST | `/item/v1/goods/search` |

#### Product Register (POST /item/v1/goods)

Key request fields:
```json
{
  "itemBasicInfo": {
    "goodsName": {
      "kor": "상품명 (필수, max 100 bytes)",
      "promotion": "프로모션명",
      "eng": "", "chi": "", "jpn": ""
    },
    "category": {
      "site": {
        "catCode": "leaf category code (필수)",
        "siteType": 1  // 1=Auction, 2=G마켓
      }
    }
  },
  "itemAddtionalInfo": {
    "price": { "Gmkt": 10000, "Iac": 10000 },
    "stock": { "Gmkt": 100, "Iac": 100 },
    "shipping": {
      "type": 1,  // 1=택배, 2=직접배송
      "companyNo": 10013,
      "policy": { "placeNo": 12345 }
    },
    "images": {
      "basicImgURL": "https://... (필수, min 600x600px, max 2MB, JPG/PNG)"
    },
    "descriptions": {
      "kor": { "html": "<p>상품 상세설명 HTML (필수)</p>" }
    },
    "officialNotice": {
      "officialNoticeNo": 1  // 고시정보 카테고리 (1-41)
    },
    "isVatFree": false,
    "recommendedOpts": { "type": 0 }  // 옵션 구성 (0-9)
  }
}
```

Response (success):
```json
{
  "siteDetail": {
    "gmkt": { "SiteGoodsNo": "1553307993", "SiteGoodsComment": "성공" },
    "iac": { "SiteGoodsNo": "B629941783", "SiteGoodsComment": "성공" }
  },
  "goodsNo": 1158387297,
  "resultCode": 0,
  "message": null
}
```

Constraints:
- Post-registration modifications require 2-3 minute delay
- Stock must be >= 1 (zero not allowed)
- Price: 10원 minimum, 10억원 maximum

#### Product Delete (DELETE /item/v1/goods/{goodsNo})

- All products must be in [판매중지] status before deletion

#### Product Search (POST /item/v1/goods/search)

Rate limit: 30 calls/minute, max 500 items per query

```json
{
  "query": {
    "goodsNo": [0],
    "siteId": [1],          // 1=Auction, 2=G마켓
    "siteGoodsNo": ["string"],
    "keyword": "검색어",
    "sellStatus": ["11"],    // 11=판매중, 21=판매중지, 22=강제중지, 31=SKU품절
    "category": {
      "site": [{ "siteId": 2, "siteCatCode": "string" }],
      "esm": "string"
    },
    "registrationDate": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }
  },
  "pageIndex": 1,
  "pageSize": 100,
  "sortField": 0,    // 0=생성일, 2=재고, 3=가격, 4=마스터번호
  "sortOrder": 1     // 0=오름차순, 1=내림차순
}
```

### 3.2 Product Function APIs

| Operation | Method | URL |
|-----------|--------|-----|
| Get/Set price/stock/status | GET/PUT | `/item/v1/goods/{goodsNo}/sell-status` |
| Modify images | POST | `/item/v1/goods/{goodsNo}/images` |
| Get/Set options | GET/PUT | `/item/v1/goods/{goodsNo}/recommended-options` |
| Get product status | GET | `/item/v1/goods/{goodsNo}/status` |
| Site->Master number | GET | `/item/v1/site-goods/{siteGoodsNo}/goods-no` |

#### Price/Stock/Status Modify (PUT /item/v1/goods/{goodsNo}/sell-status)
```json
{
  "isSell": { "gmkt": true, "iac": true },
  "itemBasicInfo": {
    "price": { "gmkt": 15000, "iac": 15000 },
    "stock": { "gmkt": 50, "iac": 50 },
    "sellingPeriod": { "gmkt": 20260401, "iac": 20260401 }
  }
}
```

#### Image Modify (POST /item/v1/goods/{goodsNo}/images)
```json
{
  "imageModel": {
    "BasicImage": { "URL": "https://..." },
    "AdditionalImage1": { "URL": "https://..." },
    "AdditionalImage2": { "URL": "https://..." }
    // ... up to AdditionalImage14
  }
}
```
- BasicImage required, min 600x600px (1000x1000px recommended)
- Additional images must be sequential (no gaps)

### 3.3 Official Notice (고시정보)

| Operation | Method | URL |
|-----------|--------|-----|
| Get notice groups | GET | `/item/v1/official-notice/groups` |
| Get notice detail | GET | `/item/v1/official-notice/groups/{officialNoticeNo}/codes` |

Response (groups):
```json
{
  "groups": [
    { "officialNoticeNo": 1, "officialNoticeName": "의류" }
  ]
}
```

Response (codes):
```json
{
  "codes": [
    {
      "officialNoticeItemelementCode": "string",
      "officialNoticeItemelementName": "소재",
      "guideText": "입력 안내",
      "isExtraMark": false
    }
  ]
}
```

### 3.4 Origin/Country of Origin

| Operation | Method | URL |
|-----------|--------|-----|
| Get all origin codes | GET | `/item/v1/origin/codes` |

Response:
```json
{
  "codes": [
    { "type": 1, "code": "5101", "lname": "강원", "mname": "강릉시" },
    { "type": 2, "code": "232", "lname": "유럽", "mname": "핀란드" }
  ]
}
```
- type: 1=국산, 2=수입, 3=기타

---

## 4. Category APIs

| Operation | Method | URL |
|-----------|--------|-----|
| ESM top categories | GET | `/item/v1/categories/sd-cats/0` |
| ESM subcategories | GET | `/item/v1/categories/sd-cats/{sdCatCode}` |
| Site top categories | GET | `/item/v1/categories/site-cats` |
| Site subcategories | GET | `/item/v1/categories/site-cats/{siteCatCode}` |
| Category options | GET | `/item/v1/options/recommended-opts?catCode={siteCatCode}` |
| Option detail | GET | `/item/v1/options/recommended-opts/{recommendedOptNo}` |

#### ESM Category Response
```json
{
  "sdCategoryTree": [
    {
      "SDCategoryCode": "string",
      "SDCategoryName": "string",
      "IsLeafCategory": false
    }
  ]
}
```

#### Site Category Response
```json
{
  "catCode": "string",
  "catName": "string",
  "isLeaf": true,
  "subCats": [
    { "catCode": "string", "catName": "string", "isLeaf": true }
  ]
}
```

Note: Only leaf categories (isLeaf=true / IsLeafCategory=true) can be used for product registration.

---

## 5. Order / Shipping APIs

Base path: `/shipping/v1/`

### 5.1 Order Management

| Operation | Method | URL | Rate Limit |
|-----------|--------|-----|------------|
| Payment pending orders | POST | `/shipping/v1/Order/PreRequestOrders` | 1/5s |
| Paid orders | POST | `/shipping/v1/Order/RequestOrders` | 1/5s |
| Order confirmation | POST | `/shipping/v1/Order/OrderCheck/{OrderNo}` | - |
| Set expected ship date | POST | `/shipping/v1/Order/ShippingExpectedDate` | - |

#### Order Inquiry (POST /shipping/v1/Order/RequestOrders)
```json
{
  "siteType": 2,          // 1=Auction, 2=G마켓
  "orderStatus": 0,       // 0=전체
  "orderNo": 0,
  "payNo": 0,
  "requestDateType": 0,
  "orderType": 0,
  "requestDateFrom": "2026-03-01 00:00",
  "requestDateTo": "2026-03-13 23:59",
  "pageIndex": 1,
  "pageSize": 100
}
```

Response:
```json
{
  "ResultCode": 0,
  "Message": "Success",
  "Data": {
    "SiteType": 2,
    "TotalCount": 150,
    "RequestOrders": [
      {
        "OrderStatus": 1,
        "PayNo": 12345,
        "OrderNo": 2503423671,
        "OrderDate": "2026-03-10T10:00:00",
        "PayDate": "2026-03-10T10:05:00",
        "TransDueDate": "2026-03-13T23:59:59",
        "GoodsName": "상품명",
        "SalePrice": "15000",
        "BuyerName": "구매자",
        "ReceiverName": "수령인",
        "ZipCode": "12345",
        "DelFullAddress": "서울시 강남구...",
        "TakbaeName": "CJ대한통운",
        "NoSongjang": "123456789012"
      }
    ]
  }
}
```

Date range limits: G마켓 31일, 옥션 180일

#### Order Confirm (POST /shipping/v1/Order/OrderCheck/{OrderNo})
```json
{
  "SellerOrderNo": "optional-seller-order-no",
  "SellerItemNo": "optional-seller-item-no"
}
```
Response: `{ "ResultCode": 0, "Message": "Success", "Data": { "IsChanged": 0 } }`
- IsChanged=1 means recipient address changed before confirmation

### 5.2 Shipping Management

| Operation | Method | URL |
|-----------|--------|-----|
| Register invoice | POST | `/shipping/v1/Delivery/ShippingInfo` |
| Complete delivery | POST | `/shipping/v1/Delivery/AddShippingCompleteInfo/{OrderNo}` |
| Delivery status | POST | `/shipping/v1/Delivery/GetDeliveryStatus` |
| Delivery progress | POST | `/shipping/v1/Delivery/Progress` |
| Non-receipt withdrawal | POST | `/shipping/v1/Delivery/ClaimRelease` |

#### Register Invoice (POST /shipping/v1/Delivery/ShippingInfo)
```json
{
  "OrderNo": 2503423671,
  "ShippingDate": "2026-03-13T14:00:00",
  "DeliveryCompanyCode": 10013,
  "InvoiceNo": "123456789012",
  "SellerOrderNo": "optional",
  "SellerItemNo": "optional"
}
```
- ShippingDate must be within 2 days of API call
- Star Shipping: only CJ(10013), Hanjin(10007), Lotte(10008)

#### Delivery Status (POST /shipping/v1/Delivery/GetDeliveryStatus)
```json
{
  "OrderNo": 0,              // 0 for period-based search
  "SearchDateConditionType": 1,  // 1=결제일, 2=주문확인, 3=최초발송...
  "FromDate": "2026-03-06",
  "ToDate": "2026-03-13",
  "Page": 1
}
```
- Max 7-day window

---

## 6. Claim APIs

Base path: `/claim/v1/sa/`

### 6.1 Cancel (취소)

| Operation | Method | URL |
|-----------|--------|-----|
| Cancel inquiry | POST | `/claim/v1/sa/Cancels` |
| Cancel approval | PUT | `/claim/v1/sa/Cancel/{OrderNo}` |
| Seller cancel (sold out) | POST | `/claim/v1/sa/Cancel/{OrderNo}/SoldOut` |
| Seller cancel (general) | POST | `/claim/v1/sa/Cancel/{OrderNo}` |
| Post-completion refund (Auction) | POST | `/claim/v1/sa/Cancel/{orderNo}/AfterRemittanceBySeller` |

#### Cancel Inquiry (POST /claim/v1/sa/Cancels)
```json
{
  "SiteType": 1,        // 1=Auction, 3=G마켓 (NOTE: G마켓 is 3, not 2!)
  "CancelStatus": 0,    // 0=전체, 1=요청, 2=처리중, 3=완료, 4=철회, 5=사이트환불, 6=완료후환불
  "Type": 2,            // 0=주문번호, 1=장바구니번호, 2=요청일, 3=완료일, 4=결제일
  "StartDate": "2026-03-06",
  "EndDate": "2026-03-13"
}
```
- Max 7-day date range

### 6.2 Return (반품)

| Operation | Method | URL |
|-----------|--------|-----|
| Return inquiry | POST | `/claim/v1/sa/Returns` |
| Return approval | PUT | `/claim/v1/sa/return/{orderNo}` |
| Seller return request | POST | (see docs /54) |
| Return pickup invoice | POST | (see docs /55) |
| Return hold | POST | (see docs /56) |

#### Return Inquiry (POST /claim/v1/sa/Returns)
```json
{
  "SiteType": 1,         // 1=Auction, 2=G마켓
  "ReturnStatus": 0,     // 1-6 return states
  "Type": 2,
  "StartDate": "2026-03-06",
  "EndDate": "2026-03-13"
}
```

### 6.3 Exchange (교환)

| Operation | Method | URL |
|-----------|--------|-----|
| Exchange inquiry | POST | `/claim/v1/sa/Exchanges` |
| Exchange pickup invoice | POST | `/claim/v1/sa/exchange/{orderNo}/pickup` |
| Exchange pickup complete | PUT | `/claim/v1/sa/exchange/{orderNo}/pickup` |
| Exchange hold | POST | (see docs /61) |
| Exchange hold release | PUT | (see docs /64) |
| Exchange resend invoice | POST | (see docs /62) |
| Exchange resend complete | POST | (see docs /63) |
| Exchange->Return convert | POST | (see docs /65) |
| Return->Exchange convert | POST | (see docs /58) |

### 6.4 Non-Receipt (미수령)

| Operation | Method | URL |
|-----------|--------|-----|
| Non-receipt inquiry | POST | (see docs /74) |
| Non-receipt withdrawal | POST | `/shipping/v1/Delivery/ClaimRelease` |

---

## 7. Settlement APIs

Base path: `/account/v1/`

| Operation | Method | URL |
|-----------|--------|-----|
| Sales settlement | POST | `/account/v1/settle/getsettleorder` |
| Shipping fee settlement | POST | `/account/v1/settle/getsettledeliveryfee` |
| Global seller transfer | POST | `/account/v1/settle/GetGlobalSellerTransfer` |

#### Sales Settlement (POST /account/v1/settle/getsettleorder)
```json
{
  "SiteType": "G",       // "A"=Auction, "G"=G마켓
  "SrchType": "D1",      // D1=입금확인일, D6=송금일, D7=환불일, etc.
  "SrchStartDate": "2026-03-01",
  "SrchEndDate": "2026-03-13",
  "PageNo": 1,
  "PageRowCnt": 100
}
```

---

## 8. CS API

| Operation | Method | URL |
|-----------|--------|-----|
| Respond to inquiry | POST | `/item/v1/communications/customer/bulletin-board/qna` |

```json
{
  "title": "답변 제목",
  "messageNo": "inquiry-number",
  "comments": "답변 내용 (max 1000 bytes)",
  "token": "token-from-inquiry-query",
  "answerStatus": 2     // 1=처리중, 2=완료
}
```

---

## 9. Shipping Configuration APIs

### 9.1 Shipping Place (출하지)

| Operation | Method | URL |
|-----------|--------|-----|
| Create | POST | `/item/v1/shipping/places` |
| Update | PUT | `/item/v1/shipping/places/{placeNo}` |
| Get one | GET | `/item/v1/shipping/places/{placeNo}` |
| Get all | GET | `/item/v1/shipping/places` |

```json
{
  "placeName": "출하지명",
  "addrNo": 12345,
  "isSetAdditionalShippingFee": true,
  "backwoodsAdditionalShippingFee": 3000,
  "jejuAdditionalShippingFee": 3000,
  "isDefaultShippingPlace": true,
  "imposeType": 1
}
```

### 9.2 Dispatch Policy (발송정책)

| Operation | Method | URL |
|-----------|--------|-----|
| Create | POST | `/item/v1/shipping/dispatch-policies` |
| Set default | POST | `/item/v1/shipping/dispatch-policies/{no}/default` |
| Get one | GET | `/item/v1/shipping/dispatch-policies/{no}` |
| Get all | GET | `/item/v1/shipping/dispatch-policies` |

### 9.3 Bundle Shipping Fee (묶음배송비)

| Operation | Method | URL |
|-----------|--------|-----|
| Create | POST | `/item/v1/shipping/policies` |
| Update | PUT | `/item/v1/shipping/policies/{policyNo}` |
| Get by place | GET | `/item/v1/shipping/places/{placeNo}/policies` |

### 9.4 Delivery Companies

| Operation | Method | URL |
|-----------|--------|-----|
| List all | GET | `/item/v1/shipping/delivery-company` |

Key codes: CJ대한통운(10013), 한진(10007), 롯데(10008), 우체국(10005), DHL(10022), FedEx(10023), EMS(10036)

---

## 10. Service APIs

| Category | Description |
|----------|-------------|
| 당일배송 | Same-day delivery |
| 홈쇼핑 | Home shopping integration |
| 실시간 가격/재고 | Real-time price/stock check |

### Star Shipping (스타배송) APIs

| Operation | Method | URL |
|-----------|--------|-----|
| SKU register/modify | POST/PUT | `/item/v1/sku/...` |
| Inbound register | POST | (see docs /106) |
| Inbound status | GET | (see docs /108) |
| External orders | GET/POST | (see docs /96, /102) |

---

## 11. Common Response Format

### Success
```json
{
  "ResultCode": 0,
  "Message": "Success",
  "Data": { ... }
}
```

### Failure
```json
{
  "ResultCode": 1000,   // or 3000, 8668, etc.
  "Message": "에러 설명",
  "Data": null
}
```

Common error codes:
- `1000`: Invalid request / item not found / validation error
- `3000`: Invalid order state / parameter error / date range exceeded
- `8668`: Business rule violation

---

## 12. Site Type Values (IMPORTANT - varies by API!)

| API Group | Auction | G마켓 |
|-----------|---------|-------|
| Product APIs (siteType) | 1 | 2 |
| Order/Shipping APIs (siteType) | 1 | 2 |
| Cancel Inquiry (SiteType) | 1 | **3** |
| Return/Exchange (SiteType) | 1 | 2 |
| Settlement (SiteType) | "A" | "G" |

Note the inconsistency: Cancel Inquiry uses SiteType=3 for G마켓, while most others use 2.

---

## 13. Documentation Index

All documentation pages at https://etapi.gmarket.com/:

### Product API
- /20 - 상품등록/수정/전환/조회
- /140 - 상품 등록/수정/전환 전문 (sample)
- /30 - 상품번호 조회
- /29 - 상품삭제
- /162 - 원산지 리스트 조회
- /161 - 고시정보 조회
- /160 - 상품 목록 조회
- /23 - 이미지 수정
- /21 - 가격/재고/판매상태 수정
- /5 - ESM 카테고리 조회
- /4 - G마켓/옥션 카테고리 조회
- /17 - 출하지 관리
- /18 - 묶음배송비 관리
- /19 - 발송정책 관리
- /142 - 택배사 리스트 조회

### Order/Shipping API
- /66 - 입금확인중 주문조회
- /67 - 주문조회
- /68 - 주문확인
- /69 - 발송예정일 등록
- /70 - 발송처리
- /71 - 배송완료
- /72 - 주문상태조회
- /73 - 배송진행정보 조회

### Claim API
- /50 - 취소조회
- /51 - 취소승인
- /52 - 판매취소
- /53 - 반품조회
- /54 - 판매자 직접 반품 신청
- /55 - 반품수거 송장등록
- /56 - 반품보류
- /57 - 반품승인
- /58 - 반품건 교환전환
- /59 - 교환조회
- /60 - 교환수거 송장등록
- /61 - 교환보류
- /62 - 교환재발송 송장등록
- /63 - 교환재발송 배송완료
- /64 - 교환보류해제
- /65 - 교환건 반품전환
- /74 - 미수령신고조회
- /75 - 미수령신고 철회요청
- /147 - 교환 수거완료 처리
- /157 - 옥션 거래완료 후 환불

### Settlement API
- /41 - 판매대금 정산조회
- /42 - 배송비 정산조회

### CS API
- /48 - 판매자문의 답변
- /49 - ESM 공지사항 조회

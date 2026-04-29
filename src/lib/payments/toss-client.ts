/**
 * 토스페이먼츠 빌링 (자동결제) 클라이언트
 * - 프론트엔드: SDK 동적 로드 + requestBillingAuth
 * - 백엔드: billingKey 발급, 결제, 취소 API
 */

const TOSS_API_BASE = 'https://api.tosspayments.com/v1/billing';
const TOSS_PAYMENTS_BASE = 'https://api.tosspayments.com/v1/payments';

// ─── 프론트엔드 SDK ─────────────────────────────

interface TossPaymentsSDK {
  requestBillingAuth: (method: string, params: {
    customerKey: string;
    successUrl: string;
    failUrl: string;
  }) => Promise<void>;
}

interface TossPaymentsModule {
  (clientKey: string): TossPaymentsSDK;
}

let sdkPromise: Promise<TossPaymentsModule> | null = null;

export function loadTossPaymentsSDK(): Promise<TossPaymentsModule> {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('SDK는 브라우저에서만 사용할 수 있습니다'));
      return;
    }

    // 이미 로드된 경우
    const existing = (window as unknown as Record<string, unknown>).TossPayments;
    if (typeof existing === 'function') {
      resolve(existing as TossPaymentsModule);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.tosspayments.com/v1/payment';
    script.onload = () => {
      const tp = (window as unknown as Record<string, unknown>).TossPayments;
      if (typeof tp === 'function') {
        resolve(tp as TossPaymentsModule);
      } else {
        reject(new Error('토스페이먼츠 SDK 로드 실패'));
      }
    };
    script.onerror = () => reject(new Error('토스페이먼츠 SDK 스크립트 로드 실패'));
    document.head.appendChild(script);
  });

  return sdkPromise;
}

// ─── 백엔드 API 클라이언트 ──────────────────────

interface BillingKeyResponse {
  billingKey: string;
  customerKey: string;
  cardCompany: string;
  cardNumber: string;
  cardType: string; // "신용" | "체크"
  authenticatedAt: string;
}

interface PaymentResult {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  approvedAt: string;
  receipt: { url: string } | null;
  card?: {
    company: string;
    number: string;
  };
  failure?: {
    code: string;
    message: string;
  };
}

interface CancelResult {
  paymentKey: string;
  status: string;
  cancels: { cancelAmount: number; canceledAt: string }[];
}

/**
 * 토스페이먼츠 관련 env 변수 검증 — 모든 호출 진입점에서 동일한 체크 수행.
 * 필수:   TOSS_PAYMENTS_SECRET_KEY (없으면 결제 자체 불가능)
 * 필수(prod): TOSS_CUSTOMER_KEY_SECRET (미설정 시 ptUserId 평문 노출, 운영에서 throw)
 * 선택:   TOSS_WEBHOOK_SECRET / TOSS_WEBHOOK_SIGNING_KEY (웹훅 검증용, webhook 라우트에서 별도 체크)
 */
export function assertTossEnv(): { secretKey: string; customerKeySecret: string | null } {
  const secretKey = process.env.TOSS_PAYMENTS_SECRET_KEY;
  if (!secretKey) {
    throw Object.assign(
      new Error('결제 설정 누락: TOSS_PAYMENTS_SECRET_KEY 가 설정되지 않았습니다'),
      { code: 'TOSS_ENV_MISSING' },
    );
  }
  const customerKeySecret = process.env.TOSS_CUSTOMER_KEY_SECRET || null;
  if (!customerKeySecret && process.env.NODE_ENV === 'production') {
    // 운영에서 미설정이면 즉시 throw — 평문 ptUserId 가 토스/로그에 노출되는 것 차단.
    // dev/staging 은 호환성 위해 경고만.
    throw Object.assign(
      new Error('결제 설정 누락: TOSS_CUSTOMER_KEY_SECRET 가 운영 환경에서 필수입니다'),
      { code: 'TOSS_CUSTOMER_KEY_SECRET_MISSING' },
    );
  }
  if (!customerKeySecret) {
    console.warn('[toss-client] TOSS_CUSTOMER_KEY_SECRET 미설정 — customerKey 가 ptUserId 평문 기반으로 생성됩니다 (dev/staging 만 허용)');
  }
  return { secretKey, customerKeySecret };
}

function getAuthHeader(): string {
  const { secretKey } = assertTossEnv();
  return 'Basic ' + Buffer.from(secretKey + ':').toString('base64');
}

export class TossPaymentsAPI {
  /** authKey로 빌링키 발급 */
  static async issueBillingKey(authKey: string, customerKey: string): Promise<BillingKeyResponse> {
    const res = await fetch(`${TOSS_API_BASE}/authorizations/issue`, {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ authKey, customerKey }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      const rawMsg = (error as { message?: unknown }).message;
      const msg =
        typeof rawMsg === 'string'
          ? rawMsg
          : rawMsg != null
            ? JSON.stringify(rawMsg)
            : `빌링키 발급 실패 (${res.status})`;
      throw Object.assign(new Error(msg), {
        code: (error as { code?: string }).code || `HTTP_${res.status}`,
        raw: error,
        status: res.status,
      });
    }

    return res.json();
  }

  /** 빌링키로 결제 실행 */
  static async payWithBillingKey(
    billingKey: string,
    customerKey: string,
    amount: number,
    orderId: string,
    orderName: string,
  ): Promise<PaymentResult> {
    const res = await fetch(`${TOSS_API_BASE}/${billingKey}`, {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerKey,
        amount,
        orderId,
        orderName,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const error = data as { code?: string; message?: string };
      throw Object.assign(
        new Error(error.message || `결제 실패 (${res.status})`),
        { code: error.code || 'UNKNOWN', raw: data, status: res.status },
      );
    }

    // 200 OK 라도 status 가 DONE 이 아니면 "돈 안 들어옴" — 실패로 처리.
    // 토스는 카드 자동결제에서 즉시 DONE 을 반환한다. READY/WAITING_FOR_DEPOSIT/ABORTED/EXPIRED 등이
    // 떨어지면 정산을 확정해서는 안 된다.
    const paymentStatus = (data as PaymentResult).status;
    if (paymentStatus !== 'DONE') {
      throw Object.assign(
        new Error(`결제 미완료 상태: ${paymentStatus}`),
        {
          code: `NOT_DONE_${paymentStatus || 'UNKNOWN'}`,
          raw: data,
          status: res.status,
        },
      );
    }

    return data as PaymentResult;
  }

  /** 빌링키 폐기 — 카드 삭제 시 호출. 실패해도 throw 하되 호출자가 판단. */
  static async revokeBillingKey(billingKey: string, customerKey: string, reason: string): Promise<void> {
    const res = await fetch(`${TOSS_API_BASE}/authorizations/${billingKey}`, {
      method: 'DELETE',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customerKey, reason }),
    });

    if (!res.ok && res.status !== 404) {
      const error = await res.json().catch(() => ({}));
      throw Object.assign(
        new Error((error as { message?: string }).message || `빌링키 폐기 실패 (${res.status})`),
        { code: (error as { code?: string }).code || `HTTP_${res.status}`, raw: error, status: res.status },
      );
    }
  }

  /** 결제 취소 (환불) */
  static async cancelPayment(paymentKey: string, reason: string): Promise<CancelResult> {
    const res = await fetch(`${TOSS_PAYMENTS_BASE}/${paymentKey}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cancelReason: reason }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.message || `결제 취소 실패 (${res.status})`);
    }

    return res.json();
  }
}

// ─── 헬퍼 ────────────────────────────────────

import { createHmac, randomBytes } from 'crypto';

/**
 * customer_key: 토스 측 고객 식별자.
 * 서버 비밀과 HMAC 하여 ptUserId 가 직접 노출되지 않게 한다.
 * 단, 기존에 `MEGALOAD_<ptUserId>` 형식으로 발급된 빌링키는 여전히 그 customerKey 로
 * 결제해야 하므로 DB 의 billing_cards.customer_key 를 반드시 사용해야 한다.
 * 이 함수는 "신규 발급" 시점의 기본값 계산에만 쓴다.
 */
export function generateCustomerKey(ptUserId: string): string {
  const { customerKeySecret } = assertTossEnv();
  if (!customerKeySecret) {
    // 하위호환: 시크릿 미설정 시 기존 형식 유지 (이미 발급된 빌링키 호환)
    return `MEGALOAD_${ptUserId}`;
  }
  const hmac = createHmac('sha256', customerKeySecret).update(ptUserId).digest('hex').slice(0, 32);
  return `ML_${hmac}`;
}

/**
 * orderId 는 토스에서 유일해야 한다. payment_transactions.toss_order_id UNIQUE 제약과 맞물려
 * 충돌 시 insert 가 실패하도록 한다. Date.now() 만으로는 동시호출 충돌 여지가 있으므로
 * 암호적 랜덤 8바이트를 추가한다.
 */
export function generateOrderId(yearMonth: string, ptUserId: string): string {
  const id8 = ptUserId.replace(/-/g, '').substring(0, 8);
  const ts = Date.now().toString(36);
  const rand = randomBytes(6).toString('hex');
  return `FEE_${yearMonth.replace('-', '')}_${id8}_${ts}_${rand}`;
}

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

function getAuthHeader(): string {
  const secretKey = process.env.TOSS_PAYMENTS_SECRET_KEY;
  if (!secretKey) throw new Error('TOSS_PAYMENTS_SECRET_KEY not configured');
  return 'Basic ' + Buffer.from(secretKey + ':').toString('base64');
}

export class TossPaymentsAPI {
  /** authKey로 빌링키 발급 */
  static async issueBillingKey(authKey: string, customerKey: string): Promise<BillingKeyResponse> {
    const res = await fetch(TOSS_API_BASE, {
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
        { code: error.code || 'UNKNOWN', raw: data },
      );
    }

    return data;
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

export function generateCustomerKey(ptUserId: string): string {
  return `MEGALOAD_${ptUserId}`;
}

export function generateOrderId(yearMonth: string, ptUserId: string): string {
  const id8 = ptUserId.replace(/-/g, '').substring(0, 8);
  const ts = Date.now().toString(36);
  return `FEE_${yearMonth.replace('-', '')}_${id8}_${ts}`;
}

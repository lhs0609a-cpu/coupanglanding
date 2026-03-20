/** 운영비용 설정 + 정산 비율 동적 로더 */

export interface CostRateSettings {
  cost_product: number;
  cost_commission: number;
  cost_returns: number;
  cost_shipping: number;
  cost_tax: number;
}

export interface OperatingCostItem {
  amount: number;
  partnerId: string | null;
}

export interface OperatingCostSettings {
  server: OperatingCostItem;
  ai: OperatingCostItem;
  fixed: OperatingCostItem;
  marketing: OperatingCostItem;
}

export interface AllCostSettings {
  rates: CostRateSettings;
  operatingCosts: OperatingCostSettings;
  defaultSharePercentage: number;
}

const DEFAULT_RATES: CostRateSettings = {
  cost_product: 0.40,
  cost_commission: 0.10,
  cost_returns: 0.03,
  cost_shipping: 0.05,
  cost_tax: 0.10,
};

const DEFAULT_OPERATING: OperatingCostSettings = {
  server: { amount: 0, partnerId: null },
  ai: { amount: 0, partnerId: null },
  fixed: { amount: 0, partnerId: null },
  marketing: { amount: 0, partnerId: null },
};

const RATE_KEY_MAP: Record<string, keyof CostRateSettings> = {
  cost_rate_product: 'cost_product',
  cost_rate_commission: 'cost_commission',
  cost_rate_returns: 'cost_returns',
  cost_rate_shipping: 'cost_shipping',
  cost_rate_tax: 'cost_tax',
};

const OP_KEY_MAP: Record<string, keyof OperatingCostSettings> = {
  op_cost_server: 'server',
  op_cost_ai: 'ai',
  op_cost_fixed: 'fixed',
  op_cost_marketing: 'marketing',
};

const OP_PARTNER_KEY_MAP: Record<string, keyof OperatingCostSettings> = {
  op_cost_server_partner_id: 'server',
  op_cost_ai_partner_id: 'ai',
  op_cost_fixed_partner_id: 'fixed',
  op_cost_marketing_partner_id: 'marketing',
};

export function parseCostSettings(
  items: { key: string; value: string }[]
): AllCostSettings {
  const rates = { ...DEFAULT_RATES };
  const operatingCosts: OperatingCostSettings = {
    server: { ...DEFAULT_OPERATING.server },
    ai: { ...DEFAULT_OPERATING.ai },
    fixed: { ...DEFAULT_OPERATING.fixed },
    marketing: { ...DEFAULT_OPERATING.marketing },
  };
  let defaultSharePercentage = 30;

  for (const item of items) {
    if (item.key in RATE_KEY_MAP) {
      const parsed = parseFloat(item.value);
      if (!isNaN(parsed)) {
        rates[RATE_KEY_MAP[item.key]] = parsed;
      }
    } else if (item.key in OP_KEY_MAP) {
      const parsed = parseInt(item.value, 10);
      if (!isNaN(parsed)) {
        operatingCosts[OP_KEY_MAP[item.key]].amount = parsed;
      }
    } else if (item.key in OP_PARTNER_KEY_MAP) {
      operatingCosts[OP_PARTNER_KEY_MAP[item.key]].partnerId = item.value || null;
    } else if (item.key === 'default_share_percentage') {
      const parsed = parseInt(item.value, 10);
      if (!isNaN(parsed)) {
        defaultSharePercentage = parsed;
      }
    }
  }

  return { rates, operatingCosts, defaultSharePercentage };
}

export async function loadCostSettings(): Promise<AllCostSettings> {
  try {
    const res = await fetch('/api/system-settings');
    if (!res.ok) throw new Error('fetch failed');
    const data: { key: string; value: string }[] = await res.json();
    return parseCostSettings(data);
  } catch {
    return {
      rates: { ...DEFAULT_RATES },
      operatingCosts: { ...DEFAULT_OPERATING },
      defaultSharePercentage: 30,
    };
  }
}

export { DEFAULT_RATES, DEFAULT_OPERATING };

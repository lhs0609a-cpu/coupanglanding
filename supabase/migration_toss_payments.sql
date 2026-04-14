-- 토스페이먼츠 자동결제 관련 테이블
-- billing_cards, payment_transactions, payment_schedules

-- 1. billing_cards: 등록된 결제 카드
CREATE TABLE IF NOT EXISTS billing_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  customer_key TEXT NOT NULL,
  billing_key TEXT UNIQUE NOT NULL,
  card_company TEXT NOT NULL,
  card_number TEXT NOT NULL,
  card_type TEXT NOT NULL DEFAULT '신용',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  failed_count INTEGER NOT NULL DEFAULT 0,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_cards_pt_user ON billing_cards(pt_user_id);
CREATE INDEX idx_billing_cards_active ON billing_cards(pt_user_id, is_active) WHERE is_active = true;

-- 2. payment_transactions: 결제 내역
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_user_id UUID NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  monthly_report_id UUID NOT NULL REFERENCES monthly_reports(id) ON DELETE CASCADE,
  billing_card_id UUID REFERENCES billing_cards(id) ON DELETE SET NULL,
  toss_payment_key TEXT,
  toss_order_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  penalty_amount INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL DEFAULT 'card',
  is_auto_payment BOOLEAN NOT NULL DEFAULT false,
  receipt_url TEXT,
  raw_response JSONB,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_code TEXT,
  failure_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_transactions_pt_user ON payment_transactions(pt_user_id);
CREATE INDEX idx_payment_transactions_report ON payment_transactions(monthly_report_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);

-- 3. payment_schedules: 자동결제 스케줄 (사용자당 1개)
CREATE TABLE IF NOT EXISTS payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pt_user_id UUID UNIQUE NOT NULL REFERENCES pt_users(id) ON DELETE CASCADE,
  auto_payment_enabled BOOLEAN NOT NULL DEFAULT false,
  billing_day INTEGER NOT NULL DEFAULT 10 CHECK (billing_day >= 1 AND billing_day <= 28),
  billing_card_id UUID REFERENCES billing_cards(id) ON DELETE SET NULL,
  total_success_count INTEGER NOT NULL DEFAULT 0,
  total_failed_count INTEGER NOT NULL DEFAULT 0,
  last_charged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS 정책
ALTER TABLE billing_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;

-- billing_cards RLS
CREATE POLICY "billing_cards_select_own" ON billing_cards
  FOR SELECT USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "billing_cards_insert_own" ON billing_cards
  FOR INSERT WITH CHECK (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
  );

CREATE POLICY "billing_cards_update_own" ON billing_cards
  FOR UPDATE USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- payment_transactions RLS
CREATE POLICY "payment_transactions_select_own" ON payment_transactions
  FOR SELECT USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "payment_transactions_admin_all" ON payment_transactions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- payment_schedules RLS
CREATE POLICY "payment_schedules_select_own" ON payment_schedules
  FOR SELECT USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "payment_schedules_upsert_own" ON payment_schedules
  FOR INSERT WITH CHECK (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
  );

CREATE POLICY "payment_schedules_update_own" ON payment_schedules
  FOR UPDATE USING (
    pt_user_id IN (SELECT id FROM pt_users WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- updated_at 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER billing_cards_updated_at
  BEFORE UPDATE ON billing_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER payment_transactions_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER payment_schedules_updated_at
  BEFORE UPDATE ON payment_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

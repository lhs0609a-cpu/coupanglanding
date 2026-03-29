-- 운영비용 설정 + 정산 비율 동적 관리
-- system_settings 테이블에 비용/비율 기본값 INSERT

-- 월 고정 운영비 (원 단위)
INSERT INTO system_settings (key, value) VALUES ('op_cost_server', '0') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('op_cost_ai', '0') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('op_cost_fixed', '0') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('op_cost_marketing', '0') ON CONFLICT (key) DO NOTHING;

-- 운영비 부담 파트너 ID (partner_id)
INSERT INTO system_settings (key, value) VALUES ('op_cost_server_partner_id', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('op_cost_ai_partner_id', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('op_cost_fixed_partner_id', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('op_cost_marketing_partner_id', '') ON CONFLICT (key) DO NOTHING;

-- 비용 비율 (소수)
INSERT INTO system_settings (key, value) VALUES ('cost_rate_product', '0.40') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('cost_rate_commission', '0.10') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('cost_rate_returns', '0.03') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('cost_rate_shipping', '0.05') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('cost_rate_tax', '0.10') ON CONFLICT (key) DO NOTHING;

-- 기본 수수료율 (%)
INSERT INTO system_settings (key, value) VALUES ('default_share_percentage', '30') ON CONFLICT (key) DO NOTHING;

-- RLS: admin INSERT 정책 (이미 SELECT/UPDATE 정책이 있다고 가정)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'system_settings'
      AND policyname = 'admin_insert_system_settings'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY admin_insert_system_settings ON system_settings
        FOR INSERT
        TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
          )
        )
    $policy$;
  END IF;
END
$$;

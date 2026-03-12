'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AutomationRule, TriggerType, ActionType } from '@/lib/sellerhub/types';
import { Zap, Plus, Power, Trash2, Clock, ShoppingCart, Package, Key } from 'lucide-react';

const TRIGGER_LABELS: Record<TriggerType, { label: string; icon: typeof Clock }> = {
  SCHEDULE: { label: '스케줄 (Cron)', icon: Clock },
  ORDER_STATUS: { label: '주문 상태 변경', icon: ShoppingCart },
  INVENTORY_LEVEL: { label: '재고 수준 변동', icon: Package },
  API_KEY_EXPIRY: { label: 'API 키 만료 임박', icon: Key },
};

const ACTION_LABELS: Record<ActionType, string> = {
  CONFIRM_ORDER: '발주확인',
  SEND_INVOICE: '송장등록',
  SUSPEND_PRODUCT: '상품 품절처리',
  RESUME_PRODUCT: '판매 재개',
  ADJUST_PRICE: '가격 조정',
  SYNC_INVENTORY: '재고 동기화',
  NOTIFY: '알림 발송',
};

export default function AutomationPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newRule, setNewRule] = useState({
    rule_name: '',
    trigger_type: 'SCHEDULE' as TriggerType,
    action_type: 'CONFIRM_ORDER' as ActionType,
  });

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    setLoading(true);
    const res = await fetch('/api/sellerhub/automation/rules');
    const data = await res.json();
    setRules(data.rules || []);
    setLoading(false);
  };

  const createRule = async () => {
    if (!newRule.rule_name) return;
    await fetch('/api/sellerhub/automation/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRule),
    });
    setShowCreate(false);
    setNewRule({ rule_name: '', trigger_type: 'SCHEDULE', action_type: 'CONFIRM_ORDER' });
    fetchRules();
  };

  const toggleRule = async (ruleId: string, isActive: boolean) => {
    await supabase.from('sh_automation_rules').update({ is_active: !isActive }).eq('id', ruleId);
    fetchRules();
  };

  const deleteRule = async (ruleId: string) => {
    await supabase.from('sh_automation_rules').delete().eq('id', ruleId);
    fetchRules();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">자동화</h1>
          <p className="text-sm text-gray-500 mt-1">설정 1회 → 이후 전부 자동</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition"
        >
          <Plus className="w-4 h-4" />
          규칙 추가
        </button>
      </div>

      {/* 생성 폼 */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">새 자동화 규칙</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">규칙 이름</label>
            <input
              type="text"
              value={newRule.rule_name}
              onChange={(e) => setNewRule({ ...newRule, rule_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              placeholder="예: 신규 주문 자동 발주확인"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">트리거</label>
              <select
                value={newRule.trigger_type}
                onChange={(e) => setNewRule({ ...newRule, trigger_type: e.target.value as TriggerType })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((t) => (
                  <option key={t} value={t}>{TRIGGER_LABELS[t].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">액션</label>
              <select
                value={newRule.action_type}
                onChange={(e) => setNewRule({ ...newRule, action_type: e.target.value as ActionType })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {(Object.keys(ACTION_LABELS) as ActionType[]).map((a) => (
                  <option key={a} value={a}>{ACTION_LABELS[a]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              취소
            </button>
            <button
              onClick={createRule}
              className="px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-red-700"
            >
              생성
            </button>
          </div>
        </div>
      )}

      {/* 규칙 목록 */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            불러오는 중...
          </div>
        ) : rules.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            <Zap className="w-8 h-8 mx-auto mb-2" />
            <p>설정된 자동화 규칙이 없습니다</p>
            <p className="text-xs mt-1">규칙을 추가해서 반복 작업을 자동화하세요</p>
          </div>
        ) : rules.map((rule) => {
          const TriggerIcon = TRIGGER_LABELS[rule.trigger_type]?.icon || Zap;
          return (
            <div key={rule.id} className={`bg-white rounded-xl border p-4 transition ${rule.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${rule.is_active ? 'bg-[#E31837]/10' : 'bg-gray-100'}`}>
                    <TriggerIcon className={`w-5 h-5 ${rule.is_active ? 'text-[#E31837]' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{rule.rule_name}</h3>
                    <p className="text-xs text-gray-500">
                      {TRIGGER_LABELS[rule.trigger_type]?.label} → {ACTION_LABELS[rule.action_type]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {rule.last_run_at && (
                    <span className="text-xs text-gray-400">
                      마지막 실행: {new Date(rule.last_run_at).toLocaleString('ko-KR')}
                    </span>
                  )}
                  <button
                    onClick={() => toggleRule(rule.id, rule.is_active)}
                    className={`p-2 rounded-lg transition ${rule.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={rule.is_active ? '비활성화' : '활성화'}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

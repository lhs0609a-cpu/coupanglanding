'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Settings, Save, Loader2, User, Gift, Tag, FileText, Bell } from 'lucide-react';

type SettingsTab = 'account' | 'gifts' | 'sku' | 'names' | 'notifications';

const TABS: { key: SettingsTab; label: string; icon: typeof Settings }[] = [
  { key: 'account', label: '계정 설정', icon: User },
  { key: 'gifts', label: '사은품 규칙', icon: Gift },
  { key: 'sku', label: 'SKU 매핑', icon: Tag },
  { key: 'names', label: '상품명 관리', icon: FileText },
  { key: 'notifications', label: '알림 설정', icon: Bell },
];

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [defaultCourier, setDefaultCourier] = useState('CJ대한통운');
  const [returnAddress, setReturnAddress] = useState('');
  const [returnPhone, setReturnPhone] = useState('');

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return;

    const { data: shUser } = await supabase
      .from('sellerhub_users')
      .select('*')
      .eq('profile_id', user.id)
      .single();

    if (shUser) {
      const d = shUser as Record<string, unknown>;
      setBusinessName((d.business_name as string) || '');
      setBusinessNumber((d.business_number as string) || '');
      setDefaultCourier((d.default_courier_code as string) || 'CJ대한통운');
      const addr = d.return_address as Record<string, string> | null;
      setReturnAddress(addr?.address || '');
      setReturnPhone(addr?.phone || '');
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const saveSettings = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (user) {
      await supabase
        .from('sellerhub_users')
        .update({
          business_name: businessName,
          business_number: businessNumber,
          default_courier_code: defaultCourier,
          return_address: { address: returnAddress, phone: returnPhone },
          updated_at: new Date().toISOString(),
        })
        .eq('profile_id', user.id);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>
        <p className="text-sm text-gray-500 mt-1">SellerHub 환경 설정</p>
      </div>

      <div className="flex gap-6">
        {/* 사이드 탭 */}
        <div className="w-48 space-y-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg transition ${
                  activeTab === tab.key
                    ? 'bg-[#E31837] text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 컨텐츠 */}
        <div className="flex-1">
          {activeTab === 'account' && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">계정 설정</h2>
              {loading ? (
                <p className="text-gray-400 text-sm">불러오는 중...</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">사업체명</label>
                      <input
                        type="text"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">사업자번호</label>
                      <input
                        type="text"
                        value={businessNumber}
                        onChange={(e) => setBusinessNumber(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                        placeholder="000-00-00000"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">기본 택배사</label>
                    <select
                      value={defaultCourier}
                      onChange={(e) => setDefaultCourier(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="CJ대한통운">CJ대한통운</option>
                      <option value="한진택배">한진택배</option>
                      <option value="롯데택배">롯데택배</option>
                      <option value="우체국택배">우체국택배</option>
                      <option value="로젠택배">로젠택배</option>
                      <option value="경동택배">경동택배</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">반품지 주소</label>
                      <input
                        type="text"
                        value={returnAddress}
                        onChange={(e) => setReturnAddress(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">반품지 연락처</label>
                      <input
                        type="text"
                        value={returnPhone}
                        onChange={(e) => setReturnPhone(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={saveSettings}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      저장
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'gifts' && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-2">사은품 규칙</h2>
              <p className="text-sm text-gray-500">조건에 따라 자동으로 사은품을 지정합니다.</p>
              <div className="mt-4 text-center text-gray-400 py-8">
                <Gift className="w-8 h-8 mx-auto mb-2" />
                사은품 규칙 관리는 준비 중입니다
              </div>
            </div>
          )}

          {activeTab === 'sku' && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-2">SKU 매핑 관리</h2>
              <p className="text-sm text-gray-500">채널 옵션명과 내부 SKU를 매핑합니다.</p>
              <div className="mt-4 text-center text-gray-400 py-8">
                <Tag className="w-8 h-8 mx-auto mb-2" />
                SKU 매핑 관리는 준비 중입니다
              </div>
            </div>
          )}

          {activeTab === 'names' && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-2">상품명 관리</h2>
              <p className="text-sm text-gray-500">긴 상품명을 짧은 관리명으로 매핑합니다.</p>
              <div className="mt-4 text-center text-gray-400 py-8">
                <FileText className="w-8 h-8 mx-auto mb-2" />
                상품명 관리는 준비 중입니다
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-2">알림 설정</h2>
              <p className="text-sm text-gray-500">알림 채널 및 자동 발송 조건을 설정합니다.</p>
              <div className="mt-4 text-center text-gray-400 py-8">
                <Bell className="w-8 h-8 mx-auto mb-2" />
                알림 설정은 준비 중입니다
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

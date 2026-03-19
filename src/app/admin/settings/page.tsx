'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import { Settings, Save, Users, Plus, Trash2, RefreshCw, FileCheck, Building2 } from 'lucide-react';
import type { Partner, CompanySettings } from '@/lib/supabase/types';

interface PartnerForm {
  id?: string;
  display_name: string;
  bank_name: string;
  bank_account: string;
  share_ratio: number;
  profile_id: string;
  is_active: boolean;
}

export default function AdminSettingsPage() {
  const [partners, setPartners] = useState<PartnerForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingExpiry, setCheckingExpiry] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [companySaving, setCompanySaving] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const fetchPartners = async () => {
    const { data } = await supabase
      .from('partners')
      .select('*')
      .order('share_ratio', { ascending: false });

    if (data && data.length > 0) {
      setPartners(data.map((p: Partner) => ({
        id: p.id,
        display_name: p.display_name,
        bank_name: p.bank_name,
        bank_account: p.bank_account,
        share_ratio: p.share_ratio,
        profile_id: p.profile_id,
        is_active: p.is_active ?? true,
      })));
    } else {
      setPartners([
        { display_name: '', bank_name: '', bank_account: '', share_ratio: 5, profile_id: '', is_active: true },
        { display_name: '', bank_name: '', bank_account: '', share_ratio: 3, profile_id: '', is_active: true },
        { display_name: '', bank_name: '', bank_account: '', share_ratio: 2, profile_id: '', is_active: true },
      ]);
    }
    setLoading(false);
  };

  const fetchCompanySettings = async () => {
    try {
      const res = await fetch('/api/company-settings');
      if (res.ok) {
        const data = await res.json();
        setCompany(data);
      }
    } catch {
      // 무시
    }
  };

  const handleCompanySave = async () => {
    if (!company) return;
    setCompanySaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/company-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(company),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '회사 사업자 정보가 저장되었습니다.' });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || '저장 실패' });
      }
    } catch {
      setMessage({ type: 'error', text: '저장 중 오류가 발생했습니다.' });
    }
    setCompanySaving(false);
  };

  useEffect(() => {
    fetchPartners();
    fetchCompanySettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePartner = (index: number, field: keyof PartnerForm, value: string | number | boolean) => {
    setPartners((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addPartner = () => {
    setPartners((prev) => [
      ...prev,
      { display_name: '', bank_name: '', bank_account: '', share_ratio: 0, profile_id: '', is_active: true },
    ]);
  };

  const removePartner = async (index: number) => {
    const partner = partners[index];
    if (partner.id) {
      if (!confirm(`${partner.display_name || '이 파트너'}를 삭제하시겠습니까?`)) return;
      await supabase.from('partners').update({ is_active: false }).eq('id', partner.id);
    }
    setPartners((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    const activePartners = partners.filter((p) => p.is_active);
    for (const partner of activePartners) {
      if (!partner.display_name) {
        setMessage({ type: 'error', text: '모든 파트너의 이름을 입력해주세요.' });
        setSaving(false);
        return;
      }
    }

    const totalRatio = activePartners.reduce((sum, p) => sum + p.share_ratio, 0);
    if (totalRatio !== 10) {
      setMessage({ type: 'error', text: `비율 합계가 10이어야 합니다. (현재: ${totalRatio})` });
      setSaving(false);
      return;
    }

    for (const partner of partners) {
      const data = {
        display_name: partner.display_name,
        bank_name: partner.bank_name,
        bank_account: partner.bank_account,
        share_ratio: partner.share_ratio,
        profile_id: partner.profile_id || null,
        is_active: partner.is_active,
      };

      if (partner.id) {
        const { error } = await supabase.from('partners').update(data).eq('id', partner.id);
        if (error) {
          setMessage({ type: 'error', text: `파트너 수정 실패: ${error.message}` });
          setSaving(false);
          return;
        }
      } else {
        const { error } = await supabase.from('partners').insert(data);
        if (error) {
          setMessage({ type: 'error', text: `파트너 추가 실패: ${error.message}` });
          setSaving(false);
          return;
        }
      }
    }

    setMessage({ type: 'success', text: '설정이 저장되었습니다.' });
    await fetchPartners();
    setSaving(false);
  };

  const handleCheckExpiry = async () => {
    setCheckingExpiry(true);
    try {
      const res = await fetch('/api/contracts/check-expiry', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: 'success',
          text: data.expiredCount > 0
            ? `${data.expiredCount}건의 만료 계약이 처리되었습니다.`
            : '만료된 계약이 없습니다.',
        });
      }
    } catch {
      setMessage({ type: 'error', text: '계약 만료 체크 실패' });
    }
    setCheckingExpiry(false);
  };

  const totalRatio = partners.filter((p) => p.is_active).reduce((sum, p) => sum + p.share_ratio, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400">불러오는 중...</div>
      ) : (
        <>
          {/* 파트너 관리 */}
          <Card>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg font-bold text-gray-900">파트너 관리</h2>
              </div>
              <button
                type="button"
                onClick={addPartner}
                className="flex items-center gap-1 text-sm text-[#E31837] hover:underline font-medium"
              >
                <Plus className="w-4 h-4" />
                파트너 추가
              </button>
            </div>

            <div className="space-y-4">
              {partners.filter((p) => p.is_active).map((partner, idx) => (
                <div key={partner.id || `new-${idx}`} className="p-4 bg-gray-50 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700">
                      파트너 {idx + 1} (비율: {partner.share_ratio})
                    </h3>
                    {partners.filter((p) => p.is_active).length > 2 && (
                      <button
                        type="button"
                        onClick={() => removePartner(partners.indexOf(partner))}
                        className="p-1 text-gray-400 hover:text-red-500 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      id={`name-${idx}`}
                      label="이름"
                      value={partner.display_name}
                      onChange={(e) => updatePartner(partners.indexOf(partner), 'display_name', e.target.value)}
                      placeholder="파트너 이름"
                    />
                    <NumberInput
                      id={`ratio-${idx}`}
                      label="배분 비율"
                      value={partner.share_ratio}
                      onChange={(val) => updatePartner(partners.indexOf(partner), 'share_ratio', val)}
                      suffix=""
                    />
                    <Input
                      id={`bank-${idx}`}
                      label="은행명"
                      value={partner.bank_name}
                      onChange={(e) => updatePartner(partners.indexOf(partner), 'bank_name', e.target.value)}
                      placeholder="예: 국민은행"
                    />
                    <Input
                      id={`account-${idx}`}
                      label="계좌번호"
                      value={partner.bank_account}
                      onChange={(e) => updatePartner(partners.indexOf(partner), 'bank_account', e.target.value)}
                      placeholder="000-000-000000"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className={`mt-4 text-sm ${totalRatio === 10 ? 'text-green-600' : 'text-red-600'}`}>
              비율 합계: <span className="font-bold">{totalRatio}</span> / 10
              {totalRatio !== 10 && ' (10이 되어야 합니다)'}
            </div>
          </Card>

          {/* 회사 사업자 정보 (세금계산서 발행용) */}
          {company && (
            <Card>
              <div className="flex items-center gap-2 mb-6">
                <Building2 className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg font-bold text-gray-900">회사 사업자 정보</h2>
              </div>
              <p className="text-sm text-gray-500 mb-4">세금계산서 발행 시 공급자(회사) 정보로 사용됩니다.</p>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    id="company-name"
                    label="상호 (법인명)"
                    value={company.business_name}
                    onChange={(e) => setCompany({ ...company, business_name: e.target.value })}
                    placeholder="(주)쿠팡 메가로드"
                  />
                  <Input
                    id="company-reg-num"
                    label="사업자등록번호"
                    value={company.business_registration_number}
                    onChange={(e) => setCompany({ ...company, business_registration_number: e.target.value })}
                    placeholder="000-00-00000"
                  />
                  <Input
                    id="company-rep"
                    label="대표자명"
                    value={company.representative_name}
                    onChange={(e) => setCompany({ ...company, representative_name: e.target.value })}
                    placeholder="홍길동"
                  />
                  <Input
                    id="company-address"
                    label="사업장 소재지"
                    value={company.business_address}
                    onChange={(e) => setCompany({ ...company, business_address: e.target.value })}
                    placeholder="서울특별시 강남구 ..."
                  />
                  <Input
                    id="company-type"
                    label="업태"
                    value={company.business_type}
                    onChange={(e) => setCompany({ ...company, business_type: e.target.value })}
                    placeholder="서비스업"
                  />
                  <Input
                    id="company-category"
                    label="종목"
                    value={company.business_category}
                    onChange={(e) => setCompany({ ...company, business_category: e.target.value })}
                    placeholder="교육서비스, 컨설팅"
                  />
                  <Input
                    id="company-email"
                    label="이메일"
                    value={company.email || ''}
                    onChange={(e) => setCompany({ ...company, email: e.target.value })}
                    placeholder="tax@example.com"
                  />
                  <Input
                    id="company-phone"
                    label="전화번호"
                    value={company.phone || ''}
                    onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                    placeholder="02-0000-0000"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCompanySave}
                  disabled={companySaving}
                  className="w-full py-2.5 bg-[#E31837] text-white font-semibold rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {companySaving ? '저장 중...' : '사업자 정보 저장'}
                </button>
              </div>
            </Card>
          )}

          {/* 시스템 관리 */}
          <Card>
            <h2 className="text-lg font-bold text-gray-900 mb-4">시스템 관리</h2>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleCheckExpiry}
                disabled={checkingExpiry}
                className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <FileCheck className="w-5 h-5 text-gray-600" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">계약 만료 자동 감지</p>
                    <p className="text-xs text-gray-500">만료일이 지난 계약을 자동으로 expired 처리합니다</p>
                  </div>
                </div>
                <RefreshCw className={`w-4 h-4 text-gray-400 ${checkingExpiry ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </Card>

          {message && (
            <div className={`px-4 py-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`} role="alert">
              {message.text}
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-[#E31837] text-white font-semibold rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? '저장 중...' : '설정 저장'}
          </button>
        </>
      )}
    </div>
  );
}

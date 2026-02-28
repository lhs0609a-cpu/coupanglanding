'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import { Settings, Save, Users } from 'lucide-react';
import type { Partner } from '@/lib/supabase/types';

interface PartnerForm {
  id?: string;
  display_name: string;
  bank_name: string;
  bank_account: string;
  share_ratio: number;
  profile_id: string;
}

export default function AdminSettingsPage() {
  const [partners, setPartners] = useState<PartnerForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function fetchPartners() {
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
        })));
      } else {
        // 기본 3명
        setPartners([
          { display_name: '', bank_name: '', bank_account: '', share_ratio: 5, profile_id: '' },
          { display_name: '', bank_name: '', bank_account: '', share_ratio: 3, profile_id: '' },
          { display_name: '', bank_name: '', bank_account: '', share_ratio: 2, profile_id: '' },
        ]);
      }
      setLoading(false);
    }

    fetchPartners();
  }, [supabase]);

  const updatePartner = (index: number, field: keyof PartnerForm, value: string | number) => {
    setPartners((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    for (const partner of partners) {
      if (!partner.display_name) {
        setMessage({ type: 'error', text: '모든 파트너의 이름을 입력해주세요.' });
        setSaving(false);
        return;
      }
    }

    // 비율 합계 확인
    const totalRatio = partners.reduce((sum, p) => sum + p.share_ratio, 0);
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
      };

      if (partner.id) {
        const { error } = await supabase
          .from('partners')
          .update(data)
          .eq('id', partner.id);
        if (error) {
          setMessage({ type: 'error', text: `파트너 수정 실패: ${error.message}` });
          setSaving(false);
          return;
        }
      } else {
        const { error } = await supabase
          .from('partners')
          .insert(data);
        if (error) {
          setMessage({ type: 'error', text: `파트너 추가 실패: ${error.message}` });
          setSaving(false);
          return;
        }
      }
    }

    setMessage({ type: 'success', text: '설정이 저장되었습니다.' });
    setSaving(false);
  };

  const ratioLabels = ['메인 파트너 (5)', '서브 파트너 1 (3)', '서브 파트너 2 (2)'];

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
            <div className="flex items-center gap-2 mb-6">
              <Users className="w-5 h-5 text-gray-600" />
              <h2 className="text-lg font-bold text-gray-900">파트너 관리</h2>
            </div>

            <div className="space-y-6">
              {partners.map((partner, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-gray-50 rounded-xl space-y-4"
                >
                  <h3 className="text-sm font-medium text-gray-700">
                    {ratioLabels[idx] || `파트너 ${idx + 1}`}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      id={`name-${idx}`}
                      label="이름"
                      value={partner.display_name}
                      onChange={(e) => updatePartner(idx, 'display_name', e.target.value)}
                      placeholder="파트너 이름"
                    />
                    <NumberInput
                      id={`ratio-${idx}`}
                      label="배분 비율"
                      value={partner.share_ratio}
                      onChange={(val) => updatePartner(idx, 'share_ratio', val)}
                      suffix=""
                    />
                    <Input
                      id={`bank-${idx}`}
                      label="은행명"
                      value={partner.bank_name}
                      onChange={(e) => updatePartner(idx, 'bank_name', e.target.value)}
                      placeholder="예: 국민은행"
                    />
                    <Input
                      id={`account-${idx}`}
                      label="계좌번호"
                      value={partner.bank_account}
                      onChange={(e) => updatePartner(idx, 'bank_account', e.target.value)}
                      placeholder="000-000-000000"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 text-sm text-gray-500">
              비율 합계: <span className="font-medium">{partners.reduce((sum, p) => sum + p.share_ratio, 0)}</span> / 10
            </div>
          </Card>

          {message && (
            <div
              className={`px-4 py-3 rounded-lg text-sm ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-600'
              }`}
              role="alert"
            >
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

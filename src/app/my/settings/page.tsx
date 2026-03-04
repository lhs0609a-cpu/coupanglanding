'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import { Settings, Eye, EyeOff, Save, CheckCircle } from 'lucide-react';

// UTF-8 안전 base64 인코딩/디코딩
function safeBase64Encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function safeBase64Decode(str: string): string {
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch {
    // 기존 Latin-1 base64 데이터 호환
    try { return atob(str); } catch { return str; }
  }
}

export default function MySettingsPage() {
  const [sellerId, setSellerId] = useState('');
  const [sellerPw, setSellerPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const supabase = useMemo(() => createClient(), []);

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('coupang_seller_id, coupang_seller_pw')
      .eq('profile_id', user.id)
      .single();

    if (ptUser) {
      setSellerId(ptUser.coupang_seller_id || '');
      if (ptUser.coupang_seller_pw) {
        setSellerPw(safeBase64Decode(ptUser.coupang_seller_pw));
      }
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');

      const encodedPw = sellerPw ? safeBase64Encode(sellerPw) : null;

      const { error: updateError } = await supabase
        .from('pt_users')
        .update({
          coupang_seller_id: sellerId || null,
          coupang_seller_pw: encodedPw,
        })
        .eq('profile_id', user.id);

      if (updateError) throw updateError;

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">계정 설정</h1>
      </div>

      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-1">쿠팡 셀러 계정 정보</h2>
        <p className="text-sm text-gray-500 mb-6">
          자동화 프로그램 연동을 위해 쿠팡 셀러 계정 정보를 등록해주세요.
          계정 정보 변경 시 3영업일 이내에 갱신이 필요합니다.
        </p>

        {loading ? (
          <div className="text-center py-8 text-gray-400">불러오는 중...</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="seller-id" className="block text-sm font-medium text-gray-700 mb-1">
                쿠팡 셀러 ID
              </label>
              <input
                id="seller-id"
                type="text"
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
                placeholder="쿠팡 셀러허브 아이디 입력"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="seller-pw" className="block text-sm font-medium text-gray-700 mb-1">
                쿠팡 셀러 비밀번호
              </label>
              <div className="relative">
                <input
                  id="seller-pw"
                  type={showPw ? 'text' : 'password'}
                  value={sellerPw}
                  onChange={(e) => setSellerPw(e.target.value)}
                  placeholder="쿠팡 셀러허브 비밀번호 입력"
                  className="w-full px-4 py-2.5 pr-12 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition"
                  aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {saved && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <p className="text-sm text-green-700">계정 정보가 저장되었습니다.</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-[#E31837] text-white rounded-xl font-semibold hover:bg-[#c81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        )}
      </Card>

      <Card>
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-sm font-semibold text-yellow-800 mb-1">안내사항</h3>
          <ul className="text-xs text-yellow-700 space-y-1">
            <li>- 계정 정보는 자동화 프로그램 연동 목적으로만 사용됩니다.</li>
            <li>- 비밀번호는 난독화 처리되어 저장됩니다.</li>
            <li>- 쿠팡에서 비밀번호 변경 시 반드시 여기서도 갱신해주세요.</li>
            <li>- 계정 정보 미갱신으로 인한 서비스 중단은 회원 책임입니다.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}

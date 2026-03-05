'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { API_STATUS_LABELS, API_STATUS_COLORS } from '@/lib/utils/constants';
import { Settings, Eye, EyeOff, Save, CheckCircle, Plug, AlertTriangle, Shield } from 'lucide-react';

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

function getApiStatus(hasCredentials: boolean, expiresAt: string | null): string {
  if (!hasCredentials) return 'not_connected';
  if (!expiresAt) return 'connected';
  const expires = new Date(expiresAt);
  const now = new Date();
  const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0) return 'expired';
  if (daysLeft <= 14) return 'expiring_soon';
  return 'connected';
}

export default function MySettingsPage() {
  const [sellerId, setSellerId] = useState('');
  const [sellerPw, setSellerPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // API 연동 상태
  const [apiVendorId, setApiVendorId] = useState('');
  const [apiAccessKey, setApiAccessKey] = useState('');
  const [apiSecretKey, setApiSecretKey] = useState('');
  const [apiHasCredentials, setApiHasCredentials] = useState(false);
  const [apiExpiresAt, setApiExpiresAt] = useState<string | null>(null);
  const [apiSaving, setApiSaving] = useState(false);
  const [apiTesting, setApiTesting] = useState(false);
  const [apiMessage, setApiMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

    // API 연동 상태 조회
    try {
      const res = await fetch('/api/coupang-credentials');
      if (res.ok) {
        const data = await res.json();
        setApiHasCredentials(data.hasCredentials);
        setApiExpiresAt(data.expiresAt);
        if (data.vendorId) setApiVendorId(data.vendorId);
      }
    } catch {
      // 조회 실패 시 무시
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

  // API 연동 테스트
  const handleApiTest = async () => {
    if (!apiVendorId || !apiAccessKey || !apiSecretKey) {
      setApiMessage({ type: 'error', text: '모든 필드를 입력해주세요.' });
      return;
    }

    setApiTesting(true);
    setApiMessage(null);

    try {
      const res = await fetch('/api/coupang-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: apiVendorId,
          accessKey: apiAccessKey,
          secretKey: apiSecretKey,
          validate: true,
        }),
      });
      const data = await res.json();

      if (data.valid) {
        setApiMessage({ type: 'success', text: 'API 연동 테스트 성공! 저장 버튼을 눌러 연동을 완료하세요.' });
      } else {
        setApiMessage({ type: 'error', text: data.message || 'API 연동 테스트에 실패했습니다.' });
      }
    } catch {
      setApiMessage({ type: 'error', text: 'API 테스트 중 오류가 발생했습니다.' });
    } finally {
      setApiTesting(false);
    }
  };

  // API 자격증명 저장
  const handleApiSave = async () => {
    if (!apiVendorId || !apiAccessKey || !apiSecretKey) {
      setApiMessage({ type: 'error', text: '모든 필드를 입력해주세요.' });
      return;
    }

    setApiSaving(true);
    setApiMessage(null);

    try {
      const res = await fetch('/api/coupang-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: apiVendorId,
          accessKey: apiAccessKey,
          secretKey: apiSecretKey,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setApiMessage({ type: 'success', text: 'API 연동이 완료되었습니다.' });
        setApiHasCredentials(true);
        setApiExpiresAt(data.expiresAt);
        setApiAccessKey('');
        setApiSecretKey('');
      } else {
        setApiMessage({ type: 'error', text: data.error || '저장에 실패했습니다.' });
      }
    } catch {
      setApiMessage({ type: 'error', text: 'API 저장 중 오류가 발생했습니다.' });
    } finally {
      setApiSaving(false);
    }
  };

  const apiStatus = getApiStatus(apiHasCredentials, apiExpiresAt);

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

      {/* 쿠팡 Open API 연동 */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-[#E31837]" />
            <h2 className="text-lg font-bold text-gray-900">쿠팡 Open API 연동</h2>
          </div>
          <Badge
            label={API_STATUS_LABELS[apiStatus]}
            colorClass={API_STATUS_COLORS[apiStatus]}
          />
        </div>
        <p className="text-sm text-gray-500 mb-6">
          쿠팡 Open API를 연동하면 매출 데이터를 자동으로 가져올 수 있습니다.
          스크린샷 없이 매출 보고가 가능합니다.
        </p>

        {loading ? (
          <div className="text-center py-8 text-gray-400">불러오는 중...</div>
        ) : (
          <div className="space-y-4">
            {/* 만료 경고 */}
            {apiStatus === 'expiring_soon' && apiExpiresAt && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">API 키 만료 임박</p>
                  <p className="text-xs text-yellow-700">
                    만료일: {new Date(apiExpiresAt).toLocaleDateString('ko-KR')} - 새 API 키를 발급받아 갱신해주세요.
                  </p>
                </div>
              </div>
            )}

            {apiStatus === 'expired' && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800">API 키가 만료되었습니다</p>
                  <p className="text-xs text-red-700">
                    쿠팡 Wing에서 새 API 키를 발급받아 등록해주세요.
                  </p>
                </div>
              </div>
            )}

            {/* 연동 완료 상태 */}
            {apiHasCredentials && apiStatus === 'connected' && (
              <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <Shield className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">API 연동 완료</p>
                  <p className="text-xs text-green-700">
                    Vendor ID: {apiVendorId}
                    {apiExpiresAt && ` | 만료일: ${new Date(apiExpiresAt).toLocaleDateString('ko-KR')}`}
                  </p>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="api-vendor-id" className="block text-sm font-medium text-gray-700 mb-1">
                Vendor ID (업체코드)
              </label>
              <input
                id="api-vendor-id"
                type="text"
                value={apiVendorId}
                onChange={(e) => setApiVendorId(e.target.value)}
                placeholder="쿠팡 Wing 업체코드 입력"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="api-access-key" className="block text-sm font-medium text-gray-700 mb-1">
                Access Key
              </label>
              <input
                id="api-access-key"
                type="text"
                value={apiAccessKey}
                onChange={(e) => setApiAccessKey(e.target.value)}
                placeholder={apiHasCredentials ? '(저장됨 - 변경 시에만 입력)' : 'Access Key 입력'}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="api-secret-key" className="block text-sm font-medium text-gray-700 mb-1">
                Secret Key
              </label>
              <input
                id="api-secret-key"
                type="password"
                value={apiSecretKey}
                onChange={(e) => setApiSecretKey(e.target.value)}
                placeholder={apiHasCredentials ? '(저장됨 - 변경 시에만 입력)' : 'Secret Key 입력'}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
            </div>

            {apiMessage && (
              <div
                className={`flex items-center gap-2 p-3 rounded-lg ${
                  apiMessage.type === 'success'
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}
              >
                {apiMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <p className={`text-sm ${apiMessage.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                  {apiMessage.text}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleApiTest}
                disabled={apiTesting || !apiVendorId || !apiAccessKey || !apiSecretKey}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-[#E31837] text-[#E31837] rounded-xl font-semibold hover:bg-[#FFF5F5] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {apiTesting ? (
                  <div className="w-5 h-5 border-2 border-[#E31837]/30 border-t-[#E31837] rounded-full animate-spin" />
                ) : (
                  <Plug className="w-5 h-5" />
                )}
                {apiTesting ? '테스트 중...' : '연동 테스트'}
              </button>
              <button
                type="button"
                onClick={handleApiSave}
                disabled={apiSaving || !apiVendorId || !apiAccessKey || !apiSecretKey}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#E31837] text-white rounded-xl font-semibold hover:bg-[#c81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {apiSaving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                {apiSaving ? '저장 중...' : '저장'}
              </button>
            </div>
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
            <li>- Open API 키는 6개월마다 갱신이 필요합니다.</li>
            <li>- API 키는 AES-256-GCM으로 암호화되어 저장됩니다.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}

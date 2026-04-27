'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { API_STATUS_LABELS, API_STATUS_COLORS, BUSINESS_RELATIONS } from '@/lib/utils/constants';
import FeatureTutorial from '@/components/tutorial/FeatureTutorial';
import { Settings, Eye, EyeOff, Save, CheckCircle, Plug, AlertTriangle, Shield, ChevronDown, ChevronUp, HelpCircle, ExternalLink, Building2, RefreshCw, CreditCard, Lock } from 'lucide-react';
import CardRegistration from '@/components/payments/CardRegistration';
import RegisteredCards from '@/components/payments/RegisteredCards';
import AutoPaymentSettings from '@/components/payments/AutoPaymentSettings';
import type { BillingCard } from '@/lib/supabase/types';

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

  // 사업자 정보
  const [bizName, setBizName] = useState('');
  const [bizRegNum, setBizRegNum] = useState('');
  const [bizRep, setBizRep] = useState('');
  const [bizAddress, setBizAddress] = useState('');
  const [bizType, setBizType] = useState('');
  const [bizCategory, setBizCategory] = useState('');
  const [bizSaving, setBizSaving] = useState(false);
  const [bizSaved, setBizSaved] = useState(false);
  const [isSelfBusiness, setIsSelfBusiness] = useState(true);
  const [businessRelation, setBusinessRelation] = useState('');

  // API 연동 상태
  const [apiVendorId, setApiVendorId] = useState('');
  const [apiAccessKey, setApiAccessKey] = useState('');
  const [apiSecretKey, setApiSecretKey] = useState('');
  const [apiHasCredentials, setApiHasCredentials] = useState(false);
  const [apiExpiresAt, setApiExpiresAt] = useState<string | null>(null);
  const [apiSaving, setApiSaving] = useState(false);
  const [apiTesting, setApiTesting] = useState(false);
  const [apiMessage, setApiMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [apiGuideOpen, setApiGuideOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [maskedAccessKey, setMaskedAccessKey] = useState<string | null>(null);
  const [maskedSecretKey, setMaskedSecretKey] = useState<string | null>(null);
  const [apiReconnecting, setApiReconnecting] = useState(false);

  // 결제 카드
  const [ptUserId, setPtUserId] = useState('');
  const [billingCards, setBillingCards] = useState<BillingCard[]>([]);
  const [paymentTab, setPaymentTab] = useState<'cards' | 'auto'>('cards');

  const router = useRouter();
  const searchParams = useSearchParams();
  const lockedParam = searchParams.get('locked');
  const supabase = useMemo(() => createClient(), []);

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: ptUser } = await supabase
      .from('pt_users')
      .select('id, coupang_seller_id, coupang_seller_pw, business_name, business_registration_number, business_representative, business_address, business_type, business_category, coupang_api_connected, coupang_vendor_id, coupang_api_key_expires_at, is_self_business, business_relation')
      .eq('profile_id', user.id)
      .single();

    if (ptUser) {
      setPtUserId(ptUser.id);
      setSellerId(ptUser.coupang_seller_id || '');
      if (ptUser.coupang_seller_pw) {
        setSellerPw(safeBase64Decode(ptUser.coupang_seller_pw));
      }
      setBizName(ptUser.business_name || '');
      setBizRegNum(ptUser.business_registration_number || '');
      setBizRep(ptUser.business_representative || '');
      setBizAddress(ptUser.business_address || '');
      setBizType(ptUser.business_type || '');
      setBizCategory(ptUser.business_category || '');
      setIsSelfBusiness(ptUser.is_self_business !== false);
      setBusinessRelation(ptUser.business_relation || '');

      // DB에서 직접 API 연동 상태 로드 (영구 유지)
      setApiHasCredentials(!!ptUser.coupang_api_connected);
      if (ptUser.coupang_vendor_id) setApiVendorId(ptUser.coupang_vendor_id);
      setApiExpiresAt(ptUser.coupang_api_key_expires_at || null);
    }

    // 마스킹된 키 미리보기 로드
    try {
      const credRes = await fetch('/api/coupang-credentials');
      if (credRes.ok) {
        const credData = await credRes.json();
        if (credData.maskedAccessKey) setMaskedAccessKey(credData.maskedAccessKey);
        if (credData.maskedSecretKey) setMaskedSecretKey(credData.maskedSecretKey);
      }
    } catch { /* ignore */ }

    setLoading(false);
  }, [supabase]);

  const fetchBillingCards = useCallback(async () => {
    try {
      const res = await fetch('/api/payments/cards');
      if (res.ok) {
        const data = await res.json();
        setBillingCards(data.cards || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchCredentials();
    fetchBillingCards();
  }, [fetchCredentials, fetchBillingCards]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
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
  const handleApiTest = async (forceUseExisting = false) => {
    const hasNewKeys = !!apiAccessKey && !!apiSecretKey;
    const canUseExisting = apiHasCredentials && !!maskedAccessKey;

    if (!apiVendorId || (!hasNewKeys && !canUseExisting && !forceUseExisting)) {
      setApiMessage({ type: 'error', text: '모든 필드를 입력해주세요.' });
      return;
    }

    setApiTesting(true);
    setApiMessage(null);

    try {
      const payload: Record<string, unknown> = {
        vendorId: apiVendorId.trim(),
        validate: true,
      };
      if (hasNewKeys) {
        payload.accessKey = apiAccessKey.trim();
        payload.secretKey = apiSecretKey.trim();
      } else {
        payload.useExisting = true;
      }

      const res = await fetch('/api/coupang-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.valid) {
        setApiMessage({ type: 'success', text: 'API 연동 테스트 성공! 저장 버튼을 눌러 연동을 완료하세요.' });
      } else {
        const detail = data.detail ? `\n\n[상세 진단]\n${data.detail}` : '';
        const status = data.statusCode ? ` (HTTP ${data.statusCode})` : '';
        const diag = data.diagnosis ? `\n\n[진단 정보] 모드: ${data.diagnosis.mode}, 프록시: ${data.diagnosis.proxyUrl}, Secret 설정: ${data.diagnosis.proxySecretSet ? 'O' : 'X'}` : '';
        setApiMessage({ type: 'error', text: `${data.message || 'API 연동 테스트에 실패했습니다.'}${status}${detail}${diag}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      setApiMessage({ type: 'error', text: `API 테스트 중 오류: ${msg}` });
    } finally {
      setApiTesting(false);
    }
  };

  // API 자격증명 저장
  const handleApiSave = async (forceUseExisting = false) => {
    const hasNewKeys = !!apiAccessKey && !!apiSecretKey;
    const canUseExisting = apiHasCredentials && !!maskedAccessKey;

    if (!apiVendorId || (!hasNewKeys && !canUseExisting && !forceUseExisting)) {
      setApiMessage({ type: 'error', text: '모든 필드를 입력해주세요.' });
      return;
    }

    setApiSaving(true);
    setApiMessage(null);

    try {
      const payload: Record<string, unknown> = {
        vendorId: apiVendorId.trim(),
      };
      if (hasNewKeys) {
        payload.accessKey = apiAccessKey.trim();
        payload.secretKey = apiSecretKey.trim();
      } else {
        payload.useExisting = true;
      }

      const res = await fetch('/api/coupang-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setApiMessage({ type: 'success', text: 'API 연동이 완료되었습니다.' });
        setApiHasCredentials(true);
        setApiExpiresAt(data.expiresAt);
        setApiAccessKey('');
        setApiSecretKey('');
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 3000);
        router.refresh();
      } else {
        setApiMessage({ type: 'error', text: data.error || '저장에 실패했습니다.' });
      }
    } catch {
      setApiMessage({ type: 'error', text: 'API 저장 중 오류가 발생했습니다.' });
    } finally {
      setApiSaving(false);
    }
  };

  // 기존 저장된 키로 재연동
  const handleReconnect = async () => {
    setApiReconnecting(true);
    setApiMessage(null);

    try {
      // 테스트 먼저
      const testRes = await fetch('/api/coupang-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: apiVendorId.trim(),
          useExisting: true,
          validate: true,
        }),
      });
      const testData = await testRes.json();

      if (!testData.valid) {
        setApiMessage({ type: 'error', text: `재연동 실패: ${testData.message || 'API 키가 유효하지 않습니다.'}` });
        return;
      }

      // 테스트 통과 → 저장 (만료일 갱신)
      const saveRes = await fetch('/api/coupang-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: apiVendorId.trim(),
          useExisting: true,
        }),
      });
      const saveData = await saveRes.json();

      if (saveData.success) {
        setApiMessage({ type: 'success', text: '기존 API 키로 재연동 완료!' });
        setApiHasCredentials(true);
        setApiExpiresAt(saveData.expiresAt);
        router.refresh();
      } else {
        setApiMessage({ type: 'error', text: saveData.error || '재연동 저장에 실패했습니다.' });
      }
    } catch {
      setApiMessage({ type: 'error', text: '재연동 중 오류가 발생했습니다.' });
    } finally {
      setApiReconnecting(false);
    }
  };

  const handleBizSave = async () => {
    setBizSaving(true);
    setBizSaved(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return;

      const { error: updateError } = await supabase
        .from('pt_users')
        .update({
          business_name: bizName || null,
          business_registration_number: bizRegNum || null,
          business_representative: bizRep || null,
          business_address: bizAddress || null,
          business_type: bizType || null,
          business_category: bizCategory || null,
          is_self_business: isSelfBusiness,
          business_relation: isSelfBusiness ? null : (businessRelation || null),
        })
        .eq('profile_id', user.id);

      if (updateError) throw updateError;
      setBizSaved(true);
      setTimeout(() => setBizSaved(false), 3000);
    } catch {
      setError('사업자 정보 저장 중 오류가 발생했습니다.');
    } finally {
      setBizSaving(false);
    }
  };

  const apiStatus = getApiStatus(apiHasCredentials, apiExpiresAt);

  return (
    <div className="space-y-6">
      {/* API 연동 축하 오버레이 */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-in fade-in duration-300">
          <div className="relative flex flex-col items-center gap-4 p-10 bg-white rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300">
            {/* 파티클 이모지 */}
            <span className="absolute -top-6 -left-4 text-3xl animate-bounce" style={{ animationDelay: '0ms' }}>🎉</span>
            <span className="absolute -top-4 -right-6 text-3xl animate-bounce" style={{ animationDelay: '200ms' }}>🎊</span>
            <span className="absolute -bottom-5 -left-6 text-2xl animate-bounce" style={{ animationDelay: '400ms' }}>✨</span>
            <span className="absolute -bottom-4 -right-4 text-2xl animate-bounce" style={{ animationDelay: '300ms' }}>🚀</span>
            {/* 체크 아이콘 */}
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <p className="text-xl font-bold text-gray-900">API 연동 완료!</p>
            <p className="text-sm text-gray-500">이제 매출 데이터를 자동으로 가져올 수 있습니다</p>
          </div>
        </div>
      )}
      <FeatureTutorial featureKey="settings" />

      {lockedParam && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-900 px-4 py-4 rounded-r-lg">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">서비스가 일시 차단되었습니다 (락 단계 {lockedParam})</p>
              <p className="text-sm mt-1 opacity-90">
                결제 미이행으로 메가로드 등 주요 페이지 접근이 제한된 상태입니다.
                아래에서 결제 카드를 등록하시면 모든 서비스가 즉시 복구됩니다.
              </p>
            </div>
          </div>
        </div>
      )}

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
                placeholder="쿠팡 메가로드 아이디 입력"
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
                  placeholder="쿠팡 메가로드 비밀번호 입력"
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
          스크린샷 없이 매출 정산이 가능합니다.
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

            {/* API 키 발급 가이드 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setApiGuideOpen(!apiGuideOpen)}
                className="w-full flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 transition"
              >
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">API 키 발급 방법 안내</span>
                </div>
                {apiGuideOpen ? (
                  <ChevronUp className="w-4 h-4 text-blue-600" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-blue-600" />
                )}
              </button>

              {apiGuideOpen && (
                <div className="p-4 space-y-5 border-t border-gray-200 bg-white">
                  {/* Step 1: Wing 로그인 */}
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-7 h-7 bg-[#E31837] text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
                      1
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">쿠팡 Wing에 로그인</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        <a
                          href="https://wing.coupang.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          wing.coupang.com
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        에 접속하여 셀러 계정으로 로그인합니다.
                      </p>
                    </div>
                  </div>

                  {/* Step 2: Vendor ID 확인 */}
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-7 h-7 bg-[#E31837] text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
                      2
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">Vendor ID (업체코드) 확인</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Wing 로그인 후 우측 상단의 <span className="font-medium text-gray-700">프로필 아이콘</span>을 클릭하면
                        드롭다운 메뉴에서 <span className="font-medium text-gray-700">업체코드</span>를 확인할 수 있습니다.
                      </p>
                      <div className="mt-2 rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                        <img
                          src="/images/guide/wing-vendor-id.png"
                          alt="Wing 우측 상단 프로필 클릭 시 업체코드 확인"
                          className="w-full max-w-sm mx-auto"
                        />
                      </div>
                      <div className="mt-2 p-2.5 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-600">
                          <span className="font-medium">위치:</span> Wing 우측 상단 프로필 클릭 &gt; 드롭다운에서 &quot;업체코드&quot; 확인
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          업체코드를 복사하여 아래 Vendor ID 란에 입력하세요.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: 추가판매정보에서 API 키 발급 */}
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-7 h-7 bg-[#E31837] text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
                      3
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">Open API 키 발급 페이지 이동</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        드롭다운 메뉴에서 <span className="font-medium text-gray-700">&quot;추가판매정보&quot;</span>를 클릭하면
                        하단에 <span className="font-medium text-gray-700">OPEN API 키 발급</span> 섹션이 있습니다.
                        <span className="font-medium text-gray-700"> &quot;API Key 발급 받기&quot;</span> 버튼을 클릭합니다.
                      </p>
                      <div className="mt-2 rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                        <img
                          src="/images/guide/wing-openapi-menu.png"
                          alt="API Key 발급 받기 버튼"
                          className="w-full max-w-md mx-auto"
                        />
                      </div>
                      <div className="mt-2 p-2.5 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-600">
                          <span className="font-medium">경로:</span> 프로필 &gt; 추가판매정보 &gt; 하단 &quot;OPEN API 키 발급&quot; &gt; &quot;API Key 발급 받기&quot;
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Step 4: API 키 확인 */}
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-7 h-7 bg-[#E31837] text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
                      4
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">Access Key / Secret Key 확인</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        발급이 완료되면 <span className="font-medium text-gray-700">업체코드, Access Key, Secret Key</span>가
                        표시됩니다. 유효기간은 <span className="font-medium text-gray-700">180일(6개월)</span>이며,
                        만료 14일 전부터 재발급 버튼이 활성화됩니다.
                      </p>
                      <div className="mt-2 rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                        <img
                          src="/images/guide/wing-api-keys.png"
                          alt="업체코드, Access Key, Secret Key 표시 화면"
                          className="w-full"
                        />
                      </div>
                      <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                          <div className="text-xs text-amber-700">
                            <p className="font-medium">Secret Key는 발급 직후에만 확인 가능합니다!</p>
                            <p className="mt-0.5">반드시 즉시 복사하여 아래 입력란에 붙여넣어 주세요. 페이지를 벗어나면 다시 확인할 수 없습니다.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 5: 입력 */}
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-7 h-7 bg-[#E31837] text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
                      5
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">아래 입력란에 붙여넣기</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        발급받은 Vendor ID, Access Key, Secret Key를 아래 입력란에 붙여넣고
                        <span className="font-medium text-gray-700"> &quot;연동 테스트&quot;</span>로 확인 후
                        <span className="font-medium text-gray-700"> &quot;저장&quot;</span>을 눌러주세요.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 필수: 연동 정보 (IP주소/URL) 설정 안내 */}
            <div className="border-2 border-[#E31837] rounded-lg overflow-hidden">
              <div className="bg-[#E31837] px-4 py-2.5 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-white" />
                <span className="text-sm font-bold text-white">필수 연동 정보 설정 (IP주소 / URL)</span>
              </div>
              <div className="p-4 bg-red-50 space-y-3">
                <p className="text-sm text-gray-800">
                  쿠팡 Wing에서 API 키를 발급받은 후, <span className="font-bold text-[#E31837]">반드시</span> 아래 연동 정보를 설정해야 API가 정상 동작합니다.
                </p>
                <div className="text-xs text-gray-700 space-y-1">
                  <p>1. Wing &gt; 마이페이지 &gt; 추가판매정보 &gt; OPEN API 키 발급 섹션 하단 <span className="font-medium">&quot;연동 정보&quot;</span>에서 <span className="font-medium">&quot;수정&quot;</span> 클릭</p>
                  <p>2. 업체명은 기존 그대로 유지</p>
                  <p>3. 아래 IP주소와 URL을 복사하여 붙여넣기</p>
                </div>
                <div className="space-y-2">
                  <div className="p-3 bg-white rounded-lg border border-red-200">
                    <p className="text-xs font-bold text-gray-700 mb-1.5">IP주소 (10개, 전체 복사하여 입력)</p>
                    <p className="text-xs font-mono text-gray-900 select-all break-all leading-relaxed bg-gray-50 p-2 rounded border border-gray-200">
                      209.71.88.111, 66.241.125.108, 216.246.19.71, 66.241.124.130, 216.246.19.84, 14.52.102.116, 54.116.7.181, 3.37.67.57, 79.127.159.103, 216.246.19.66
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-red-200">
                    <p className="text-xs font-bold text-gray-700 mb-1.5">URL</p>
                    <p className="text-xs font-mono text-gray-900 select-all bg-gray-50 p-2 rounded border border-gray-200">
                      https://coupanglanding.vercel.app/
                    </p>
                  </div>
                </div>
                <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg">
                  <p className="text-xs text-amber-800 font-medium">
                    이 설정을 하지 않으면 API 키를 입력해도 연동이 동작하지 않습니다. 반드시 복사하여 정확히 입력하세요.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="api-vendor-id" className="block text-sm font-medium text-gray-700 mb-1">
                Vendor ID (업체코드)
              </label>
              <input
                id="api-vendor-id"
                type="text"
                value={apiVendorId}
                onChange={(e) => setApiVendorId(e.target.value)}
                placeholder="쿠팡 Wing 업체코드 입력 (예: A00123456)"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">Wing 우측 상단 업체명 클릭 시 확인 가능</p>
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
                placeholder={maskedAccessKey ? `저장됨: ${maskedAccessKey}` : (apiHasCredentials ? '(저장됨 - 변경 시에만 입력)' : 'Access Key 입력')}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">Wing &gt; 개발자센터 &gt; Open API에서 발급{maskedAccessKey && ' (변경하려면 새 키 입력)'}</p>
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
                placeholder={maskedSecretKey ? `저장됨: ${maskedSecretKey}` : (apiHasCredentials ? '(저장됨 - 변경 시에만 입력)' : 'Secret Key 입력')}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">키 생성 직후에만 확인 가능{maskedSecretKey && ' (변경하려면 새 키 입력)'}</p>
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
                <p className={`text-sm whitespace-pre-wrap ${apiMessage.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                  {apiMessage.text}
                </p>
              </div>
            )}

            {/* 기존 키로 빠른 재연동 */}
            {apiHasCredentials && maskedAccessKey && !apiAccessKey && !apiSecretKey && (
              <button
                type="button"
                onClick={handleReconnect}
                disabled={apiReconnecting || !apiVendorId}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {apiReconnecting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <RefreshCw className="w-5 h-5" />
                )}
                {apiReconnecting ? '재연동 중...' : '저장된 키로 재연동'}
              </button>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleApiTest()}
                disabled={apiTesting || !apiVendorId || (!apiAccessKey && !maskedAccessKey) || (!apiSecretKey && !maskedSecretKey)}
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
                onClick={() => handleApiSave()}
                disabled={apiSaving || !apiVendorId || (!apiAccessKey && !maskedAccessKey) || (!apiSecretKey && !maskedSecretKey)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[#E31837] text-white rounded-xl font-semibold hover:bg-[#c81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {apiSaving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                {apiSaving ? '저장 중...' : apiAccessKey || apiSecretKey ? '새 키로 저장' : '저장'}
              </button>
            </div>

            {apiHasCredentials && maskedAccessKey && (
              <p className="text-xs text-center text-gray-400">
                키를 변경하려면 위 입력란에 새 Access Key / Secret Key를 입력하세요.
                기존 키를 그대로 사용하려면 &quot;저장된 키로 재연동&quot; 버튼을 누르세요.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* 사업자 정보 (세금계산서용) */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-5 h-5 text-[#E31837]" />
          <h2 className="text-lg font-bold text-gray-900">사업자 정보</h2>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          세금계산서 발행을 위해 사업자 정보를 등록해주세요.
          미등록 시 세금계산서를 발행받을 수 없습니다.
        </p>

        {loading ? (
          <div className="text-center py-8 text-gray-400">불러오는 중...</div>
        ) : (
          <div className="space-y-4">
            {/* 본인 명의 사업자 여부 */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">본인 명의 사업자입니까?</p>
                  <p className="text-xs text-gray-500 mt-0.5">타인 명의(배우자, 가족 등)인 경우 &apos;아니오&apos;를 선택해주세요.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setIsSelfBusiness(true); setBusinessRelation(''); }}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                      isSelfBusiness ? 'bg-[#E31837] text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    예
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSelfBusiness(false)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                      !isSelfBusiness ? 'bg-[#E31837] text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    아니오
                  </button>
                </div>
              </div>

              {!isSelfBusiness && (
                <div>
                  <label htmlFor="biz-relation" className="block text-sm font-medium text-gray-700 mb-1">
                    사업자 대표와의 관계
                  </label>
                  <select
                    id="biz-relation"
                    value={businessRelation}
                    onChange={(e) => setBusinessRelation(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                  >
                    <option value="">선택하세요</option>
                    {BUSINESS_RELATIONS.filter(r => r !== '본인').map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="biz-name" className="block text-sm font-medium text-gray-700 mb-1">상호 (법인명)</label>
                <input
                  id="biz-name"
                  type="text"
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  placeholder="상호명 입력"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="biz-reg-num" className="block text-sm font-medium text-gray-700 mb-1">사업자등록번호</label>
                <input
                  id="biz-reg-num"
                  type="text"
                  value={bizRegNum}
                  onChange={(e) => setBizRegNum(e.target.value)}
                  placeholder="000-00-00000"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="biz-rep" className="block text-sm font-medium text-gray-700 mb-1">대표자명</label>
                <input
                  id="biz-rep"
                  type="text"
                  value={bizRep}
                  onChange={(e) => setBizRep(e.target.value)}
                  placeholder="대표자 이름"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="biz-address" className="block text-sm font-medium text-gray-700 mb-1">사업장 소재지</label>
                <input
                  id="biz-address"
                  type="text"
                  value={bizAddress}
                  onChange={(e) => setBizAddress(e.target.value)}
                  placeholder="사업장 주소"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="biz-type" className="block text-sm font-medium text-gray-700 mb-1">업태</label>
                <input
                  id="biz-type"
                  type="text"
                  value={bizType}
                  onChange={(e) => setBizType(e.target.value)}
                  placeholder="소매업"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="biz-category" className="block text-sm font-medium text-gray-700 mb-1">종목</label>
                <input
                  id="biz-category"
                  type="text"
                  value={bizCategory}
                  onChange={(e) => setBizCategory(e.target.value)}
                  placeholder="전자상거래"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                />
              </div>
            </div>

            {bizSaved && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <p className="text-sm text-green-700">사업자 정보가 저장되었습니다.</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleBizSave}
              disabled={bizSaving}
              className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-[#E31837] text-white rounded-xl font-semibold hover:bg-[#c81530] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bizSaving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              {bizSaving ? '저장 중...' : '사업자 정보 저장'}
            </button>
          </div>
        )}
      </Card>

      {/* 자동결제 관리 */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">자동결제 관리</h2>
            <p className="text-sm text-gray-500">수수료 카드 결제 및 자동결제를 설정합니다</p>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b mb-5">
          <button
            type="button"
            onClick={() => setPaymentTab('cards')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              paymentTab === 'cards'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            등록 카드
          </button>
          <button
            type="button"
            onClick={() => setPaymentTab('auto')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              paymentTab === 'auto'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            자동결제 설정
          </button>
        </div>

        {paymentTab === 'cards' ? (
          <div className="space-y-5">
            <RegisteredCards cards={billingCards} onRefresh={fetchBillingCards} />
            {ptUserId && <CardRegistration ptUserId={ptUserId} />}
          </div>
        ) : (
          <AutoPaymentSettings cards={billingCards} />
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

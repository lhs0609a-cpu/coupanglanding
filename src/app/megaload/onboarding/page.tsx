'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_LABELS, CHANNEL_BG_COLORS } from '@/lib/megaload/constants';
import type { Channel } from '@/lib/megaload/types';
import { Check, ChevronRight, ChevronLeft, Loader2, Plug, Package, Settings, Rocket, HelpCircle } from 'lucide-react';
import ChannelSetupGuide from '@/components/megaload/ChannelSetupGuide';

const STEPS = [
  { title: '쿠팡 API 연동', desc: '쿠팡 Wing에서 발급받은 API 키를 입력하세요', icon: Plug },
  { title: '추가 채널 연동', desc: '다른 쇼핑몰도 함께 연동할 수 있어요', icon: Plug },
  { title: '상품 가져오기', desc: '쿠팡 상품을 자동으로 가져옵니다', icon: Package },
  { title: '기본 설정', desc: '배송비, 반품지 등 기본 정보를 설정하세요', icon: Settings },
  { title: '시작하기', desc: '모든 준비가 완료되었습니다!', icon: Rocket },
];

interface ChannelCreds {
  channel: Channel;
  fields: Record<string, string>;
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [testSuccess, setTestSuccess] = useState<Record<string, boolean>>({});
  const [guideChannel, setGuideChannel] = useState<Channel | null>(null);

  // Step 1: 쿠팡 API
  const [coupangVendorId, setCoupangVendorId] = useState('');
  const [coupangAccessKey, setCoupangAccessKey] = useState('');
  const [coupangSecretKey, setCoupangSecretKey] = useState('');

  // Step 2: 추가 채널
  const [channelCreds, setChannelCreds] = useState<Record<string, Record<string, string>>>({});

  // Step 4: 기본 설정
  const [defaultCourier, setDefaultCourier] = useState('CJ대한통운');
  const [returnAddress, setReturnAddress] = useState('');
  const [returnPhone, setReturnPhone] = useState('');

  const otherChannels = CHANNELS.filter((c) => c !== 'coupang');

  const testChannel = useCallback(async (channel: Channel, creds: Record<string, string>) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/megaload/channels/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, credentials: creds }),
      });
      const data = await res.json();
      if (data.success) {
        setTestSuccess((prev) => ({ ...prev, [channel]: true }));
      } else {
        setError(data.message || '연결 테스트 실패');
      }
    } catch {
      setError('연결 테스트 중 오류 발생');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveCredentials = useCallback(async (channel: Channel, creds: Record<string, string>) => {
    await fetch('/api/megaload/channels/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, credentials: creds }),
    });
  }, []);

  const handleNext = async () => {
    setError('');

    if (step === 0) {
      // 쿠팡 테스트 & 저장
      if (!coupangVendorId || !coupangAccessKey || !coupangSecretKey) {
        setError('모든 필드를 입력해주세요');
        return;
      }
      if (!testSuccess.coupang) {
        await testChannel('coupang', {
          vendorId: coupangVendorId,
          accessKey: coupangAccessKey,
          secretKey: coupangSecretKey,
        });
        return;
      }
      await saveCredentials('coupang', {
        vendorId: coupangVendorId,
        accessKey: coupangAccessKey,
        secretKey: coupangSecretKey,
      });
    }

    if (step === 1) {
      // 추가 채널 저장
      for (const ch of otherChannels) {
        const creds = channelCreds[ch];
        if (creds && Object.values(creds).some((v) => v)) {
          await saveCredentials(ch as Channel, creds);
        }
      }
    }

    if (step === 2) {
      // 상품 가져오기 트리거
      setLoading(true);
      try {
        await fetch('/api/megaload/products/sync-coupang', { method: 'POST' });
      } catch {
        // 백그라운드 처리이므로 에러 무시
      }
      setLoading(false);
    }

    if (step === 3) {
      // 기본 설정 저장
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (user) {
        await supabase
          .from('megaload_users')
          .update({
            default_courier_code: defaultCourier,
            return_address: { address: returnAddress, phone: returnPhone },
          })
          .eq('profile_id', user.id);
      }
    }

    if (step === 4) {
      // 온보딩 완료
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (user) {
        await supabase
          .from('megaload_users')
          .update({ onboarding_done: true })
          .eq('profile_id', user.id);
      }
      router.push('/megaload/dashboard');
      return;
    }

    setStep((s) => s + 1);
  };

  const updateChannelCred = (channel: string, field: string, value: string) => {
    setChannelCreds((prev) => ({
      ...prev,
      [channel]: { ...prev[channel], [field]: value },
    }));
  };

  const channelFieldConfig: Record<string, { label: string; fields: { key: string; label: string; placeholder: string }[] }> = {
    naver: {
      label: '네이버 스마트스토어',
      fields: [
        { key: 'clientId', label: 'Client ID', placeholder: 'Client ID' },
        { key: 'clientSecret', label: 'Client Secret', placeholder: 'Client Secret' },
      ],
    },
    elevenst: {
      label: '11번가',
      fields: [
        { key: 'apiKey', label: 'API Key', placeholder: 'Open API Key' },
      ],
    },
    gmarket: {
      label: 'G마켓',
      fields: [
        { key: 'userId', label: '판매자 ID', placeholder: '판매자 ID' },
        { key: 'apiKey', label: 'API Key', placeholder: 'API Key' },
      ],
    },
    auction: {
      label: '옥션',
      fields: [
        { key: 'userId', label: '판매자 ID', placeholder: '판매자 ID' },
        { key: 'apiKey', label: 'API Key', placeholder: 'API Key' },
      ],
    },
    lotteon: {
      label: '롯데온',
      fields: [
        { key: 'apiKey', label: 'API Key', placeholder: 'API Key' },
        { key: 'apiSecret', label: 'API Secret', placeholder: 'API Secret' },
      ],
    },
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* 스텝 인디케이터 */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                i < step
                  ? 'bg-green-500 text-white'
                  : i === step
                    ? 'bg-[#E31837] text-white'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i < step ? <Check className="w-5 h-5" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 sm:w-16 h-0.5 mx-1 ${i < step ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* 스텝 타이틀 */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{STEPS[step].title}</h1>
        <p className="text-gray-500 mt-1">{STEPS[step].desc}</p>
      </div>

      {/* 스텝 컨텐츠 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        {step === 0 && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setGuideChannel('coupang')}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              API 키 발급 방법 보기
            </button>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor ID</label>
              <input
                type="text"
                value={coupangVendorId}
                onChange={(e) => setCoupangVendorId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                placeholder="쿠팡 Wing 판매자 코드"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Access Key</label>
              <input
                type="text"
                value={coupangAccessKey}
                onChange={(e) => setCoupangAccessKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                placeholder="Open API Access Key"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
              <input
                type="password"
                value={coupangSecretKey}
                onChange={(e) => setCoupangSecretKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                placeholder="Open API Secret Key"
              />
            </div>
            {testSuccess.coupang && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">쿠팡 API 연결 성공!</span>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <p className="text-sm text-gray-500">연동하지 않을 채널은 비워두세요. 나중에 설정할 수 있습니다.</p>
            {otherChannels.map((ch) => {
              const config = channelFieldConfig[ch];
              if (!config) return null;
              return (
                <div key={ch} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: CHANNEL_BG_COLORS[ch] }}
                      />
                      <h3 className="font-medium text-gray-900">{config.label}</h3>
                      {testSuccess[ch] && <Check className="w-4 h-4 text-green-500" />}
                    </div>
                    <button
                      type="button"
                      onClick={() => setGuideChannel(ch)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition"
                    >
                      <HelpCircle className="w-3 h-3" />
                      발급 방법
                    </button>
                  </div>
                  <div className="space-y-2">
                    {config.fields.map((f) => (
                      <input
                        key={f.key}
                        type={f.key.toLowerCase().includes('secret') ? 'password' : 'text'}
                        value={channelCreds[ch]?.[f.key] || ''}
                        onChange={(e) => updateChannelCred(ch, f.key, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                        placeholder={f.placeholder}
                      />
                    ))}
                  </div>
                  {channelCreds[ch] && Object.values(channelCreds[ch]).some((v) => v) && !testSuccess[ch] && (
                    <button
                      onClick={() => testChannel(ch as Channel, channelCreds[ch])}
                      disabled={loading}
                      className="mt-2 px-3 py-1.5 text-xs font-medium text-[#E31837] border border-[#E31837] rounded-lg hover:bg-red-50 transition"
                    >
                      연결 테스트
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === 2 && (
          <div className="text-center py-8">
            <Package className="w-16 h-16 mx-auto text-[#E31837] mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">쿠팡 상품 가져오기</h3>
            <p className="text-sm text-gray-500 mb-4">
              쿠팡에 등록된 상품을 자동으로 가져와 마스터 DB에 저장합니다.<br />
              상품 수에 따라 수 분이 소요될 수 있으며, 백그라운드에서 처리됩니다.
            </p>
            {loading && (
              <div className="flex items-center justify-center gap-2 text-[#E31837]">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">상품 동기화 시작 중...</span>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">기본 택배사</label>
              <select
                value={defaultCourier}
                onChange={(e) => setDefaultCourier(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
              >
                <option value="CJ대한통운">CJ대한통운</option>
                <option value="한진택배">한진택배</option>
                <option value="롯데택배">롯데택배</option>
                <option value="우체국택배">우체국택배</option>
                <option value="로젠택배">로젠택배</option>
                <option value="경동택배">경동택배</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">반품지 주소</label>
              <input
                type="text"
                value={returnAddress}
                onChange={(e) => setReturnAddress(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                placeholder="반품/교환 수거지 주소"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">반품지 연락처</label>
              <input
                type="text"
                value={returnPhone}
                onChange={(e) => setReturnPhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
                placeholder="010-0000-0000"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-8">
            <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Rocket className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">준비 완료!</h3>
            <p className="text-sm text-gray-500">
              Megaload가 준비되었습니다. 대시보드에서 바로 시작하세요.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}
      </div>

      {/* 네비게이션 */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          이전
        </button>

        <div className="flex gap-2">
          {step === 1 && (
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              건너뛰기
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={loading}
            className="flex items-center gap-1 px-6 py-2.5 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-red-700 transition disabled:opacity-50"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {step === 4 ? '시작하기' : step === 0 && !testSuccess.coupang ? '연결 테스트' : '다음'}
            {step < 4 && !loading && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 채널 연동 가이드 모달 */}
      {guideChannel && (
        <ChannelSetupGuide
          channel={guideChannel}
          isOpen={!!guideChannel}
          onClose={() => setGuideChannel(null)}
        />
      )}
    </div>
  );
}

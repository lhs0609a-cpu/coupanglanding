'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CHANNELS, CHANNEL_LABELS, CHANNEL_BG_COLORS, CHANNEL_COMMISSION_RATES } from '@/lib/megaload/constants';
import type { Channel, ChannelCredential } from '@/lib/megaload/types';
import { Link as LinkIcon, Check, X, RefreshCw, Key, AlertTriangle, Loader2 } from 'lucide-react';
import ChannelSetupGuide from '@/components/megaload/ChannelSetupGuide';

export default function ChannelsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [credentials, setCredentials] = useState<ChannelCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [guideChannel, setGuideChannel] = useState<Channel | null>(null);

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/megaload/channels/credentials');
    const data = await res.json();
    setCredentials(data.credentials || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCredentials(); }, [fetchCredentials]);

  const getCredential = (channel: Channel): ChannelCredential | undefined => {
    return credentials.find((c) => c.channel === channel);
  };

  const testConnection = async (channel: Channel) => {
    setTestingChannel(channel);
    const cred = getCredential(channel);
    if (!cred) {
      setTestingChannel(null);
      return;
    }
    await fetch('/api/megaload/channels/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, credentials: cred.credentials }),
    });
    await fetchCredentials();
    setTestingChannel(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">채널관리</h1>
        <p className="text-sm text-gray-500 mt-1">쇼핑몰 API 연동 관리</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CHANNELS.map((ch) => {
          const cred = getCredential(ch);
          const isConnected = cred?.is_connected;
          const isExpiring = cred?.expires_at && new Date(cred.expires_at).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;

          return (
            <div key={ch} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: CHANNEL_BG_COLORS[ch] }}
                  >
                    {CHANNEL_LABELS[ch].charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{CHANNEL_LABELS[ch]}</h3>
                    <p className="text-xs text-gray-500">수수료 {CHANNEL_COMMISSION_RATES[ch]}%</p>
                  </div>
                </div>
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">상태</span>
                  <span className={`font-medium ${isConnected ? 'text-green-600' : 'text-gray-400'}`}>
                    {isConnected ? '연결됨' : '미연결'}
                  </span>
                </div>
                {cred?.last_verified_at && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">마지막 확인</span>
                    <span className="text-gray-600 text-xs">
                      {new Date(cred.last_verified_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                )}
                {cred?.expires_at && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">만료일</span>
                    <span className={`text-xs font-medium ${isExpiring ? 'text-orange-600' : 'text-gray-600'}`}>
                      {isExpiring && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                      {new Date(cred.expires_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {isConnected ? (
                  <>
                    <button
                      onClick={() => testConnection(ch)}
                      disabled={testingChannel === ch}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                    >
                      {testingChannel === ch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      연결 확인
                    </button>
                    <button className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                      <Key className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setGuideChannel(ch)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#E31837] rounded-lg hover:bg-red-700 transition"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    연동하기
                  </button>
                )}
              </div>
            </div>
          );
        })}
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

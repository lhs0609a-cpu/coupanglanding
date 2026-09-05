'use client';

import { useState } from 'react';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import { egressIpsForPaste, hasEgressIps } from '@/lib/megaload/egress-ip';

/**
 * 셀러가 채널 화면(11번가 Seller API 정보 수정 등)에 그대로 붙여넣을 우리 호출 서버 IP.
 *
 * 왜 별도 컴포넌트인가: 같은 가이드를 두 경로에서 렌더한다.
 *   /megaload/channels  → ChannelConnectWizard(② 연동하기 탭)   ← 셀러 주 경로
 *   /megaload/onboarding → ChannelSetupGuide(모달)
 * 한쪽에만 넣으면 셀러 절반이 IP 를 못 본다.
 */
export default function EgressIpBox({ separator = ';' }: { separator?: ';' | ',' }) {
  const [copied, setCopied] = useState(false);

  if (!hasEgressIps()) {
    return (
      <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg mb-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-800">
          호출 서버 IP가 아직 준비되지 않았습니다. 이 단계는 IP 안내를 받은 뒤 진행하세요.
        </p>
      </div>
    );
  }

  const value = egressIpsForPaste(separator);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 차단 환경 — 사용자가 직접 선택해 복사 */
    }
  };

  return (
    <div className="mb-2 p-3 bg-gray-900 rounded-lg">
      <p className="text-[11px] text-gray-400 mb-1.5">
        아래 값을 그대로 복사해 IP 입력란에 붙여넣으세요
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-sm text-green-300 font-mono break-all select-all">{value}</code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-100 bg-gray-700 hover:bg-gray-600 rounded-md transition"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
    </div>
  );
}

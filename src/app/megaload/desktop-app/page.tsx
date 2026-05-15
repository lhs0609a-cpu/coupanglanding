'use client';

import { useState } from 'react';
import { Download, Key, RefreshCw, Copy, CheckCircle2, AlertCircle, Monitor, Zap } from 'lucide-react';

export default function DesktopAppPage() {
  const [token, setToken] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [issuedAt, setIssuedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleIssue = async () => {
    setIssuing(true);
    setError(null);
    try {
      const res = await fetch('/api/megaload/desktop/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setIssuedAt(data.issuedAt);
      } else {
        setError(data.error || '토큰 발급 실패');
      }
    } catch {
      setError('네트워크 오류');
    } finally {
      setIssuing(false);
    }
  };

  const handleRevoke = async () => {
    if (!confirm('토큰을 폐기하면 데스크탑 앱이 더 이상 동작하지 않습니다. 계속하시겠습니까?')) return;
    setRevoking(true);
    try {
      const res = await fetch('/api/megaload/desktop/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke' }),
      });
      const data = await res.json();
      if (res.ok) {
        setToken(null);
        setIssuedAt(null);
        alert('토큰이 폐기되었습니다.');
      } else {
        setError(data.error || '폐기 실패');
      }
    } catch {
      setError('네트워크 오류');
    } finally {
      setRevoking(false);
    }
  };

  const handleCopy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Monitor className="w-6 h-6" />
          Megaload Desktop App
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          데스크탑 앱을 PC에 설치하면 사용자 IP에서 네이버를 직접 호출하여 차단을 회피합니다.
        </p>
      </div>

      {/* 안내 카드 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h2 className="font-semibold text-blue-900 mb-2">왜 데스크탑 앱이 필요한가요?</h2>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Megaload 서버 IP는 네이버 anti-scraping에 차단됨 (HTTP 429)</li>
          <li>사용자 PC IP는 가정/회사 네트워크라 네이버 친화적 — 차단 거의 0%</li>
          <li>PC 켜져 있으면 자동으로 백그라운드 동작, 사용자 액션 불필요</li>
          <li>비용 0원, 사용자 IP 사용으로 안정적</li>
        </ul>
      </div>

      {/* ⚡ 원클릭 자동 설정 (가장 추천) */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-300 rounded-xl p-6">
        <h2 className="font-semibold text-emerald-900 mb-2 flex items-center gap-2">
          <Zap className="w-5 h-5" />
          ⚡ 원클릭 자동 설정 (추천)
        </h2>
        <p className="text-sm text-emerald-800 mb-4">
          버튼 한 번 클릭으로 토큰 자동 발급 + 클립보드 복사 + installer 다운로드.
          설치 후 자동 실행 시 클립보드에서 토큰을 자동 인식하여 즉시 모니터링 시작합니다.
        </p>
        <button
          onClick={async () => {
            // 1. 토큰 발급
            setIssuing(true);
            setError(null);
            try {
              const res = await fetch('/api/megaload/desktop/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || '토큰 발급 실패');
              setToken(data.token);
              setIssuedAt(data.issuedAt);
              // 2. 클립보드 복사
              await navigator.clipboard.writeText(data.token);
              setCopied(true);
              // 3. installer 다운로드 (Win 기본, Mac은 별도)
              const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
              const downloadUrl = isMac
                ? 'https://github.com/lhs0609a-cpu/coupanglanding/releases/latest/download/Megaload-Monitor-0.1.0-x64.dmg'
                : 'https://github.com/lhs0609a-cpu/coupanglanding/releases/latest/download/Megaload-Monitor-Setup-0.1.0.exe';
              window.location.href = downloadUrl;
              alert(
                '✅ 토큰이 클립보드에 복사되었습니다.\n\n다운로드된 installer를 더블클릭하면:\n' +
                '1. 자동 설치 (묻지 않음)\n' +
                '2. 자동 실행 (트레이로 이동)\n' +
                '3. 클립보드에서 토큰 자동 인식 → 모니터링 즉시 시작',
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : '실패');
            } finally {
              setIssuing(false);
            }
          }}
          disabled={issuing}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-semibold text-base"
        >
          {issuing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
          원클릭 자동 설정
        </button>
        <div className="text-xs text-emerald-700 mt-3">
          ⓘ 토큰은 7일 동안 유효합니다. 만료 시 같은 버튼 다시 누르면 재발급 + 자동 적용.
        </div>
      </div>

      {/* Step 1: 다운로드 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-[#E31837] text-white rounded-full flex items-center justify-center text-sm">1</span>
          앱 다운로드
        </h2>
        <p className="text-sm text-gray-600 mb-4">아래에서 OS에 맞는 installer를 다운로드하세요.</p>
        <div className="grid grid-cols-3 gap-3">
          <a
            href="https://github.com/lhs0609a-cpu/coupanglanding/releases/latest/download/Megaload-Monitor-Setup-0.1.0.exe"
            className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
            target="_blank" rel="noopener"
          >
            <Download className="w-4 h-4" />
            Windows (.exe)
          </a>
          <a
            href="https://github.com/lhs0609a-cpu/coupanglanding/releases/latest/download/Megaload-Monitor-0.1.0-x64.dmg"
            className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
            target="_blank" rel="noopener"
          >
            <Download className="w-4 h-4" />
            macOS Intel (.dmg)
          </a>
          <a
            href="https://github.com/lhs0609a-cpu/coupanglanding/releases/latest/download/Megaload-Monitor-0.1.0-arm64.dmg"
            className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
            target="_blank" rel="noopener"
          >
            <Download className="w-4 h-4" />
            macOS M1/M2 (.dmg)
          </a>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          ⓘ 데스크탑 앱은 Phase 5 (빌드 단계)에서 GitHub Releases로 배포됩니다. 현재는 Phase 2 진행 중.
        </p>
      </div>

      {/* Step 2: 토큰 발급 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-[#E31837] text-white rounded-full flex items-center justify-center text-sm">2</span>
          인증 토큰 발급
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          데스크탑 앱 첫 실행 시 입력할 토큰을 발급받으세요. (7일 유효, 만료 시 재발급)
        </p>

        {!token && (
          <button
            onClick={handleIssue}
            disabled={issuing}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#E31837] text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
          >
            {issuing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            토큰 발급
          </button>
        )}

        {token && (
          <div className="space-y-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">발급된 토큰 (데스크탑 앱에 입력)</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-xs break-all bg-white p-2 rounded border">{token}</code>
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50 flex items-center gap-1"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? '복사됨' : '복사'}
                </button>
              </div>
              {issuedAt && (
                <div className="text-xs text-gray-500 mt-2">
                  발급 시각: {new Date(issuedAt).toLocaleString('ko-KR')} (7일 후 만료)
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleIssue}
                disabled={issuing}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                새 토큰 발급
              </button>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
              >
                토큰 폐기
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </div>

      {/* Step 3: 설치 + 실행 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-[#E31837] text-white rounded-full flex items-center justify-center text-sm">3</span>
          설치 및 첫 실행
        </h2>
        <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
          <li>다운로드한 installer 더블클릭 → 설치</li>
          <li>첫 실행 시 위에서 발급받은 토큰 입력</li>
          <li>로그인 완료 → 트레이로 자동 이동 (작업표시줄 우측 시계 근처)</li>
          <li>OS 부팅 시 자동 실행됨 (트레이 메뉴에서 OFF 가능)</li>
          <li>모니터링 결과는 메가로드 웹의 <strong>품절동기화</strong> 페이지에서 자동 반영</li>
        </ol>
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
          ⓘ PC가 켜져 있어야 모니터링이 동작합니다. PC 꺼지면 일시 중단되며, 다시 켜면 자동 재개됩니다.
        </div>
      </div>
    </div>
  );
}

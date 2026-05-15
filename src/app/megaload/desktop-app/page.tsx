'use client';

import { useState } from 'react';
import { Download, Key, RefreshCw, Copy, CheckCircle2, AlertCircle, Monitor, Zap } from 'lucide-react';

const APP_VERSION = '0.1.2';

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
          상품 모니터링 도우미
          <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">
            최신 v{APP_VERSION}
          </span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          내 PC에서 등록 상품의 품절·가격 변동을 자동으로 확인해 주는 보조 프로그램입니다.
        </p>
      </div>

      {/* 안내 카드 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h2 className="font-semibold text-blue-900 mb-2">어떤 프로그램인가요?</h2>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>등록한 상품의 원본 페이지를 주기적으로 열어 품절·가격 정보를 가져옵니다</li>
          <li>내 PC의 일반 네트워크에서 동작하므로 안정적이고 정확합니다</li>
          <li>한 번 설치하면 PC 켜져 있을 때 자동으로 백그라운드 동작 — 별도 조작 불필요</li>
          <li>설치·이용 모두 무료, 결과는 메가로드 품절동기화 페이지에 자동 반영</li>
        </ul>
      </div>

      {/* ⚡ 원클릭 자동 설정 (가장 추천) */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-300 rounded-xl p-6">
        <h2 className="font-semibold text-emerald-900 mb-2 flex items-center gap-2">
          <Zap className="w-5 h-5" />
          ⚡ 원클릭 자동 설치 (추천)
        </h2>
        <p className="text-sm text-emerald-800 mb-4">
          버튼 한 번 클릭으로 인증코드 자동 발급 + 설치 파일 다운로드.
          설치 후 자동 실행 시 인증코드까지 자동 인식하여 즉시 모니터링이 시작됩니다.
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
                ? `https://github.com/lhs0609a-cpu/coupanglanding/releases/latest/download/Megaload.Monitor-${APP_VERSION}-x64.dmg`
                : `https://github.com/lhs0609a-cpu/coupanglanding/releases/latest/download/Megaload.Monitor-Setup-${APP_VERSION}.exe`;
              window.location.href = downloadUrl;
              alert(
                '✅ 인증코드가 복사되었습니다.\n\n다운로드된 설치 파일을 더블클릭하면:\n' +
                '1. 자동 설치\n' +
                '2. 자동 실행 (작업표시줄로 이동)\n' +
                '3. 인증코드 자동 인식 → 모니터링 즉시 시작',
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
          원클릭 자동 설치
        </button>
        <div className="text-xs text-emerald-700 mt-3">
          ⓘ 인증코드는 7일간 유효합니다. 만료 시 같은 버튼 다시 누르면 자동 갱신됩니다.
        </div>
      </div>

      {/* Step 1: 다운로드 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-[#E31837] text-white rounded-full flex items-center justify-center text-sm">1</span>
          프로그램 다운로드
        </h2>
        <p className="text-sm text-gray-600 mb-4">사용 중인 OS에 맞는 설치 파일을 받아주세요. <span className="text-emerald-700 font-medium">현재 최신 v{APP_VERSION}</span></p>
        <div className="grid grid-cols-3 gap-3">
          <a
            href={`https://github.com/lhs0609a-cpu/coupanglanding/releases/latest/download/Megaload.Monitor-Setup-${APP_VERSION}.exe`}
            className="flex flex-col items-center gap-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
            target="_blank" rel="noopener"
          >
            <span className="flex items-center gap-2"><Download className="w-4 h-4" /> Windows (.exe)</span>
            <span className="text-xs text-gray-400">v{APP_VERSION}</span>
          </a>
          <a
            href={`https://github.com/lhs0609a-cpu/coupanglanding/releases/latest/download/Megaload.Monitor-${APP_VERSION}-x64.dmg`}
            className="flex flex-col items-center gap-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
            target="_blank" rel="noopener"
          >
            <span className="flex items-center gap-2"><Download className="w-4 h-4" /> macOS Intel (.dmg)</span>
            <span className="text-xs text-gray-400">v{APP_VERSION}</span>
          </a>
          <a
            href={`https://github.com/lhs0609a-cpu/coupanglanding/releases/latest/download/Megaload.Monitor-${APP_VERSION}-arm64.dmg`}
            className="flex flex-col items-center gap-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
            target="_blank" rel="noopener"
          >
            <span className="flex items-center gap-2"><Download className="w-4 h-4" /> macOS M1/M2 (.dmg)</span>
            <span className="text-xs text-gray-400">v{APP_VERSION}</span>
          </a>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          ⓘ 새 버전이 나오면 앱이 자동으로 알림 + 다운로드합니다 (실행 중일 때).
        </p>
      </div>

      {/* Step 2: 인증코드 발급 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-[#E31837] text-white rounded-full flex items-center justify-center text-sm">2</span>
          인증코드 발급
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          프로그램 첫 실행 시 입력할 인증코드를 발급받으세요. (7일 유효, 만료 시 재발급)
        </p>

        {!token && (
          <button
            onClick={handleIssue}
            disabled={issuing}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#E31837] text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
          >
            {issuing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            인증코드 발급
          </button>
        )}

        {token && (
          <div className="space-y-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">발급된 인증코드 (프로그램에 입력)</div>
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
                새 인증코드 발급
              </button>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
              >
                인증코드 해제
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
          <li>다운로드한 설치 파일을 더블클릭 → 자동 설치</li>
          <li>첫 실행 시 위에서 발급받은 인증코드 입력</li>
          <li>등록 완료 → 작업표시줄 우측 시계 근처로 자동 최소화</li>
          <li>PC 부팅 시 자동 실행 (필요 시 메뉴에서 OFF 가능)</li>
          <li>확인 결과는 메가로드 웹의 <strong>품절동기화</strong> 페이지에 자동 반영</li>
        </ol>
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
          ⓘ PC가 켜져 있을 때만 동작합니다. PC를 꺼도 다시 켜면 자동으로 이어서 진행합니다.
        </div>
      </div>
    </div>
  );
}

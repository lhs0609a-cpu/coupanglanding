'use client';

import { useState } from 'react';
import { Download, Key, RefreshCw, Copy, CheckCircle2, AlertCircle, Monitor, Zap, Activity, Settings2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { WORKER_SETTINGS_URL } from '@/lib/megaload/worker-download';
import { useLatestVersions } from '@/lib/megaload/use-latest-versions';

interface StatusInfo {
  isAlive: boolean;
  tokenIssued: boolean;
  lastHeartbeatAt: string | null;
  heartbeatAgeMin: number;
  monitorsTotal: number;
  monitorsPending: number;
  monitorsCheckedRecently: number;
  diagnosis: string;
}

export default function DesktopAppPage() {
  // 버전·다운로드 URL 의 출처는 실제 발행된 릴리스(설정 다운로드 허브와 자동으로 같은 값).
  const { versions } = useLatestVersions();
  const monitor = versions.monitor;
  const APP_VERSION = monitor.version;
  const [token, setToken] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [issuedAt, setIssuedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const handleCheckStatus = async () => {
    setCheckingStatus(true);
    try {
      const res = await fetch('/api/megaload/desktop/status');
      const data = await res.json();
      if (res.ok) setStatus(data);
      else setError(data.error || '진단 실패');
    } catch {
      setError('네트워크 오류');
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleTestVerify = async () => {
    if (!token) {
      setError('먼저 인증코드를 발급하세요');
      return;
    }
    try {
      const res = await fetch('/api/megaload/desktop/auth', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      alert(
        `검증 결과: ${res.status} ${res.ok ? 'OK' : 'FAIL'}\n\n` +
        `응답: ${JSON.stringify(data, null, 2)}\n\n` +
        (res.ok
          ? '✅ 토큰이 DB에서 정상 조회됨. 데스크탑 앱이 이 토큰으로 로그인 안 되면 데스크탑 → 서버 네트워크 문제.'
          : '❌ 토큰 자체가 DB에 없거나 만료됨. 새로 발급 후 즉시 시도하세요.'),
      );
    } catch (e) {
      alert(`네트워크 오류: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  };

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
          등록 상품의 품절·가격 변동을 자동으로 확인해 주는 보조 프로그램입니다.
        </p>
      </div>

      {/* 연결 상태 진단 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-gray-500" />
            연결 상태 확인
          </h2>
          <button
            onClick={handleCheckStatus}
            disabled={checkingStatus}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
          >
            {checkingStatus ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            진단 실행
          </button>
        </div>
        {!status && (
          <p className="text-sm text-gray-500">설치한 프로그램이 정상 동작 중인지, 데이터를 받고 있는지 확인합니다.</p>
        )}
        {status && (
          <div className="space-y-2 text-sm">
            <div className={`p-3 rounded-lg ${status.isAlive ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
              <div className="flex items-center gap-2 font-medium">
                <span className={`w-2 h-2 rounded-full ${status.isAlive ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                {status.isAlive ? '데스크탑 앱 정상 연결 중' : '데스크탑 앱 연결 끊김 또는 미실행'}
              </div>
              <div className="text-xs text-gray-600 mt-1">{status.diagnosis}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="p-2 bg-gray-50 rounded">
                <div className="text-gray-500">마지막 접속</div>
                <div className="font-semibold text-gray-900">
                  {status.heartbeatAgeMin < 0 ? '없음' : status.heartbeatAgeMin === 0 ? '방금 전' : `${status.heartbeatAgeMin}분 전`}
                </div>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <div className="text-gray-500">전체 모니터</div>
                <div className="font-semibold text-gray-900">{status.monitorsTotal.toLocaleString()}개</div>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <div className="text-gray-500">처리 대기</div>
                <div className="font-semibold text-amber-700">{status.monitorsPending.toLocaleString()}개</div>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <div className="text-gray-500">최근 1h 처리</div>
                <div className="font-semibold text-emerald-700">{status.monitorsCheckedRecently.toLocaleString()}건</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 안내 카드 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h2 className="font-semibold text-blue-900 mb-2">어떤 프로그램인가요?</h2>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>등록한 상품의 원본 페이지를 주기적으로 확인해 품절·가격 정보를 가져옵니다</li>
          <li>안정적인 환경에서 동작해 원본 상태를 정확하게 수집합니다</li>
          <li>한 번 설치하면 PC가 켜져 있을 때 자동으로 백그라운드 동작 — 별도 조작 불필요</li>
          <li>결과는 메가로드 품절동기화 페이지에 자동 반영됩니다</li>
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
              // ⚠️ mac 은 Intel(x64) dmg 가 없는 릴리스가 있다 → 있는 것만 고르고,
              //    둘 다 없으면 받으러 보내지 않는다(예전엔 x64 를 고정으로 가리켜 404 였다).
              const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
              const downloadUrl = isMac
                ? (monitor.urls.macIntel ?? monitor.urls.macArm)
                : monitor.urls.win;
              if (!downloadUrl) throw new Error('이 OS 용 설치 파일이 아직 발행되지 않았습니다.');
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
          ⓘ 인증코드는 폐기 전까지 영구 유효합니다. 버튼을 다시 눌러도 <b>같은 코드가 재사용</b>되어(실행 중인 도우미가 무효화되지 않음) 안전합니다. 도난·기기 이전 등으로 새 코드가 필요하면 아래 “인증코드 폐기” 후 다시 발급하세요.
        </div>
      </div>

      {/* Step 1: 다운로드 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-[#E31837] text-white rounded-full flex items-center justify-center text-sm">1</span>
          프로그램 다운로드
        </h2>
        <p className="text-sm text-gray-600 mb-4">사용 중인 OS에 맞는 설치 파일을 받아주세요. <span className="text-emerald-700 font-medium">현재 최신 v{APP_VERSION}</span></p>
        {/* 릴리스에 실제로 있는 자산만 노출 — 없는 플랫폼 버튼은 감춘다(404 방지). */}
        <div className="grid grid-cols-3 gap-3">
          {([
            { url: monitor.urls.win, label: 'Windows (.exe)' },
            { url: monitor.urls.macIntel, label: 'macOS Intel (.dmg)' },
            { url: monitor.urls.macArm, label: 'macOS M1/M2 (.dmg)' },
          ] as const).filter((o) => !!o.url).map((o) => (
            <a
              key={o.label}
              href={o.url}
              className="flex flex-col items-center gap-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
              target="_blank" rel="noopener"
            >
              <span className="flex items-center gap-2"><Download className="w-4 h-4" /> {o.label}</span>
              <span className="text-xs text-gray-500">v{APP_VERSION}</span>
            </a>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          ⓘ 새 버전이 나오면 앱이 자동으로 알림 + 다운로드합니다 (실행 중일 때).
        </p>
        <Link
          href={WORKER_SETTINGS_URL}
          className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          <Settings2 className="w-3.5 h-3.5" />
          설정 → 다운로드 센터에서 메가로드 도우미와 함께 받기
        </Link>
      </div>

      {/* SmartScreen 경고 안내 — 설치 파일 실행 시 뜨는 파란 화면 대처법 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <h2 className="font-semibold text-amber-900 mb-1 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" />
          설치할 때 이 파란 화면이 뜨면? — 정상이에요, 당황하지 마세요
        </h2>
        <p className="text-sm text-amber-800 mb-4 leading-relaxed">
          다운로드한 파일을 실행하면 Windows가 <b>&quot;Windows의 PC 보호&quot;</b> 화면을 띄웁니다.
          바이러스가 아니라, 아직 유료 코드서명이 안 된 <b>자체 배포 프로그램</b>이라 Windows가 한 번 확인하는 것뿐입니다.
          아래처럼 <b>①추가 정보 → ②실행</b> 두 번만 누르면 됩니다.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          {/* 1단계 재현 */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-sm font-semibold text-amber-900">
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center">1</span>
              &quot;추가 정보&quot;를 클릭
            </div>
            <div className="rounded-lg overflow-hidden shadow-md select-none" style={{ backgroundColor: '#0b57a4' }}>
              <div className="flex justify-end px-2 pt-1.5"><span className="text-white/60 text-xs">✕</span></div>
              <div className="px-4 pb-4 text-white">
                <div className="font-bold text-[15px] mb-2">Windows의 PC 보호</div>
                <p className="text-[11px] leading-relaxed text-white/90 mb-2">
                  Microsoft Defender SmartScreen에서 인식할 수 없는 앱의 시작을 차단했습니다. 이 앱을 실행하면 PC가 위험에 노출될 수 있습니다.
                </p>
                <span className="inline-block text-[12px] text-white underline underline-offset-2 rounded px-1 ring-2 ring-yellow-300 bg-white/10">추가 정보</span>
                <div className="flex justify-end mt-8">
                  <span className="text-[11px] bg-gray-200 text-gray-800 rounded px-3 py-1.5">실행 안 함</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-amber-700 mt-1.5">왼쪽 위 <b>&quot;추가 정보&quot;</b> 글자를 클릭하세요.</p>
          </div>

          {/* 2단계 재현 */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-sm font-semibold text-amber-900">
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center">2</span>
              새로 나타난 &quot;실행&quot; 버튼 클릭
            </div>
            <div className="rounded-lg overflow-hidden shadow-md select-none" style={{ backgroundColor: '#0b57a4' }}>
              <div className="flex justify-end px-2 pt-1.5"><span className="text-white/60 text-xs">✕</span></div>
              <div className="px-4 pb-4 text-white">
                <div className="font-bold text-[15px] mb-2">Windows의 PC 보호</div>
                <p className="text-[11px] leading-relaxed text-white/90 mb-1.5">
                  Microsoft Defender SmartScreen에서 인식할 수 없는 앱의 시작을 차단했습니다. 이 앱을 실행하면 PC가 위험에 노출될 수 있습니다.
                </p>
                <p className="text-[11px] text-white/80 mb-3">앱: 메가로드 도우미<br />게시자: 알 수 없는 게시자</p>
                <div className="flex justify-end gap-2 mt-4">
                  <span className="text-[11px] bg-yellow-300 text-gray-900 font-bold rounded px-3 py-1.5 ring-2 ring-yellow-400">실행</span>
                  <span className="text-[11px] bg-gray-200 text-gray-800 rounded px-3 py-1.5">실행 안 함</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-amber-700 mt-1.5"><b>&quot;추가 정보&quot;</b>를 누르면 <b>&quot;실행&quot;</b> 버튼이 생깁니다 → 클릭.</p>
          </div>
        </div>

        <div className="mt-4 bg-white/70 border border-amber-200 rounded-lg p-3 text-[12px] text-amber-800 leading-relaxed">
          <b>안심하세요.</b> 이 프로그램은 등록한 상품의 원본 페이지(품절·가격)만 확인해 메가로드에 전달합니다. 개인 파일이나 다른 앱엔 접근하지 않습니다.
          <b>&quot;실행 안 함&quot;</b>을 누르면 설치가 취소되니, 꼭 <b>&quot;실행&quot;</b>을 눌러주세요.
        </div>
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

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (!token) return;
                  // URL scheme 으로 데스크탑 앱 호출 (megaload-monitor://login?token=xxx)
                  // → 설치된 앱이 자동으로 받아서 로그인 + cron 시작
                  window.location.href = `megaload-monitor://login?token=${token}`;
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 font-medium"
              >
                <Zap className="w-4 h-4" />
                데스크탑 앱에 즉시 전송 (자동 로그인)
              </button>
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
              <button
                onClick={handleTestVerify}
                className="px-4 py-2 border border-blue-300 text-blue-600 rounded-lg text-sm hover:bg-blue-50"
              >
                토큰 검증 테스트
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              💡 <b>데스크탑 앱에 즉시 전송</b>을 누르면 브라우저가 &quot;Megaload Monitor 열기?&quot;를 묻습니다 → <b>열기</b> 클릭하면 자동 로그인 (수동 복사·붙여넣기 불필요)
            </p>
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

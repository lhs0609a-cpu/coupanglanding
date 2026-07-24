'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Cpu, Download, CheckCircle2, AlertCircle, Loader2, Wifi, WifiOff,
  MonitorDown, Sparkles, ExternalLink, Gauge, XCircle, MinusCircle,
  Wand2, Save, RotateCcw, Monitor, Apple, KeyRound,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MONITOR_AUTH_URL } from '@/lib/megaload/worker-download';
import { useLatestVersions } from '@/lib/megaload/use-latest-versions';
import { classifyHelperLink } from '@/lib/megaload/allinone-local';

// 워커 내장 기본 프롬프트와 동일 — 비워두면 워커가 이 기본값을 사용한다(placeholder로만 표시).
const BUILTIN_POSITIVE =
  'professional Coupang e-commerce product thumbnail, the product centered on a pure seamless white studio background (#FFFFFF), soft diffused studio lighting, subtle natural contact shadow directly beneath the product, photorealistic commercial product photography, sharp focus, clean and minimal, 1:1 square composition';
const BUILTIN_NEGATIVE =
  'text, watermark, logo, extra objects, props, lifestyle scene, hands, people, colored background, gradient background, dark shadows, blurry, low quality, distorted, deformed, duplicated product, frame, border';

interface WorkerStatus {
  online: boolean;
  workers: { worker_id: string; hostname: string | null; last_seen: string }[];
}

type Grade = 'recommended' | 'ok' | 'low' | 'unsupported';
type CheckRow = { label: string; value: string; grade: Grade; hint?: string };
type SpecCheck = { rows: CheckRow[]; overall: Grade; message: string };

const GRADE_STYLE: Record<Grade, { bg: string; border: string; text: string; icon: typeof CheckCircle2; label: string }> = {
  recommended: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: CheckCircle2, label: '권장 충족' },
  ok:          { bg: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-700',     icon: CheckCircle2, label: '동작 가능' },
  low:         { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   icon: MinusCircle,  label: '미달 가능' },
  unsupported: { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    icon: XCircle,      label: '미지원' },
};

function readGpuRenderer(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return '';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return '';
    return (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string) || '';
  } catch { return ''; }
}

function gradeGpu(renderer: string): { grade: Grade; name: string; estVram: string } {
  if (!renderer) return { grade: 'unsupported', name: '확인 불가 (브라우저 차단)', estVram: '-' };
  const r = renderer.toUpperCase();
  const cleanName = renderer.replace(/ANGLE\s*\(/i, '').replace(/Direct3D.*$/i, '').replace(/\)$/, '').trim();

  const rtx50 = r.match(/RTX\s*50(\d{2})/);
  if (rtx50) return { grade: 'recommended', name: `RTX 50${rtx50[1]}`, estVram: '12-32GB' };
  const rtx40 = r.match(/RTX\s*40(\d{2})/);
  if (rtx40) {
    const n = parseInt(rtx40[1], 10);
    return { grade: 'recommended', name: `RTX 40${rtx40[1]}`, estVram: n >= 70 ? '12-24GB' : '8-16GB' };
  }
  const rtx30 = r.match(/RTX\s*30(\d{2})/);
  if (rtx30) {
    const n = parseInt(rtx30[1], 10);
    if (n >= 60) return { grade: 'recommended', name: `RTX 30${rtx30[1]}`, estVram: '8-24GB' };
    return { grade: 'ok', name: `RTX 30${rtx30[1]}`, estVram: '8GB' };
  }
  const rtx20 = r.match(/RTX\s*20(\d{2})/);
  if (rtx20) return { grade: 'ok', name: `RTX 20${rtx20[1]}`, estVram: '6-11GB (느림)' };
  if (/GTX\s*16\d{2}/.test(r)) return { grade: 'low', name: r.match(/GTX\s*16\d{2}[\s\w]*/i)?.[0]?.trim() || 'GTX 16xx', estVram: '4-6GB (느림)' };
  if (/GTX\s*10\d{2}/.test(r)) return { grade: 'low', name: 'GTX 10xx', estVram: '4-8GB (매우 느림)' };
  if (/NVIDIA|GEFORCE/.test(r)) return { grade: 'low', name: cleanName.slice(0, 50) || 'NVIDIA (구형)', estVram: '확인 필요' };
  if (/RADEON|AMD/.test(r))    return { grade: 'unsupported', name: cleanName.slice(0, 50) || 'AMD Radeon', estVram: '-' };
  if (/INTEL/.test(r))         return { grade: 'unsupported', name: cleanName.slice(0, 50) || 'Intel 내장', estVram: '-' };
  if (/APPLE|METAL|M\d/.test(r)) return { grade: 'unsupported', name: 'Apple Silicon', estVram: '-' };
  return { grade: 'unsupported', name: cleanName.slice(0, 50) || '알 수 없음', estVram: '-' };
}

function detectOs(): { grade: Grade; name: string } {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Windows NT/i.test(ua)) return { grade: 'recommended', name: 'Windows' };
  if (/Mac OS X/i.test(ua))   return { grade: 'unsupported', name: 'macOS (워커 미지원)' };
  if (/Linux/i.test(ua))      return { grade: 'unsupported', name: 'Linux (워커 미지원)' };
  return { grade: 'unsupported', name: '알 수 없음' };
}

function runSpecCheck(): SpecCheck {
  const os = detectOs();
  const gpu = gradeGpu(readGpuRenderer());
  const ramGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  const cores = navigator.hardwareConcurrency ?? null;

  const ramGrade: Grade = ramGB === null ? 'ok' : ramGB >= 16 ? 'recommended' : ramGB >= 8 ? 'ok' : 'low';
  const cpuGrade: Grade = cores === null ? 'ok' : cores >= 8 ? 'recommended' : cores >= 4 ? 'ok' : 'low';

  const rows: CheckRow[] = [
    { label: 'OS', value: os.name, grade: os.grade, hint: os.grade === 'recommended' ? '워커 앱 설치 가능' : '워커 앱은 Windows 전용' },
    { label: 'GPU', value: gpu.name, grade: gpu.grade, hint: `추정 VRAM ${gpu.estVram} · SDXL은 8GB 이상 권장` },
    { label: 'RAM', value: ramGB ? `약 ${ramGB}GB 이상` : '확인 불가', grade: ramGrade, hint: '16GB 이상 권장 (8GB도 동작은 함)' },
    { label: 'CPU', value: cores ? `${cores} 스레드` : '확인 불가', grade: cpuGrade, hint: 'GPU 처리라 CPU 영향 적음' },
  ];

  const order: Grade[] = ['unsupported', 'low', 'ok', 'recommended'];
  const overall = rows.reduce<Grade>((acc, r) => (order.indexOf(r.grade) < order.indexOf(acc) ? r.grade : acc), 'recommended');

  const message =
    overall === 'recommended' ? '권장 사양을 충족합니다. 워커 앱을 설치하시면 바로 무제한 재생성이 가능해요.' :
    overall === 'ok'          ? '동작은 가능하지만 처리 속도가 느릴 수 있어요. 우선 설치해보시고 만족스럽지 않으면 Gemini 재생성을 쓰세요.' :
    overall === 'low'         ? 'GPU 사양이 미달입니다. 동작하더라도 매우 느려서 Gemini 재생성을 권장합니다.' :
                                '워커가 동작하지 않는 환경입니다. 상품 화면의 Gemini 재생성(무료 500장/일)을 사용하세요.';
  return { rows, overall, message };
}

const STEPS = [
  { t: '설치 파일 다운로드', d: '위 버튼으로 설치기(.exe)를 받아 더블클릭하면 자동 설치됩니다.' },
  { t: '엔진 설치 (처음 1회)', d: '앱에서 "엔진 설치"를 누르면 ComfyUI와 AI 모델(약 6.5GB)을 자동으로 받습니다. 한 번만 받으면 됩니다.' },
  { t: '로그인', d: '메가로드 계정(이메일/비밀번호)으로 앱에 로그인합니다.' },
  { t: '워커 시작', d: '"워커 시작"을 누르면 아래 상태가 "연결됨"으로 바뀝니다. 창을 닫아도 트레이에 상주합니다.' },
  { t: '대량등록에서 사용', d: '상품 검수 화면에서 상품을 고르고 "AI 대표 썸네일 재생성"을 누르면 자동 처리됩니다.' },
];

export default function LocalGpuWorkerSettings() {
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [spec, setSpec] = useState<SpecCheck | null>(null);
  // 다운로드 URL·버전의 출처는 실제 발행된 릴리스(손수 관리 상수 아님).
  const { versions } = useLatestVersions();
  const { desktop, monitor } = versions;

  // 계정 기본 프롬프트 (비우면 워커 내장 기본값 사용). enqueue 시 서버가 자동 첨부.
  const [promptPos, setPromptPos] = useState('');
  const [promptNeg, setPromptNeg] = useState('');
  const [promptLoading, setPromptLoading] = useState(true);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptSavedAt, setPromptSavedAt] = useState<number | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/megaload/products/thumbnail-jobs/worker-status');
      setStatus(await res.json());
    } catch {
      setStatus({ online: false, workers: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPrompts = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('megaload_users')
        .select('thumbnail_prompt, thumbnail_negative_prompt')
        .eq('profile_id', user.id)
        .single();
      // 저장된 값이 없으면 기본 프롬프트를 채워서 보여준다 — 모르는 사용자도 바로 쓸 수 있게.
      setPromptPos((data?.thumbnail_prompt as string | null)?.trim() || BUILTIN_POSITIVE);
      setPromptNeg((data?.thumbnail_negative_prompt as string | null)?.trim() || BUILTIN_NEGATIVE);
    } catch { /* ignore */ } finally {
      setPromptLoading(false);
    }
  }, []);

  const savePrompts = useCallback(async () => {
    setPromptSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from('megaload_users')
        .update({
          thumbnail_prompt: promptPos.trim() || null,
          thumbnail_negative_prompt: promptNeg.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('profile_id', user.id);
      setPromptSavedAt(Date.now());
    } catch { /* ignore */ } finally {
      setPromptSaving(false);
    }
  }, [promptPos, promptNeg]);

  useEffect(() => {
    loadStatus();
    loadPrompts();
    const id = setInterval(loadStatus, 10_000); // 10초마다 갱신
    return () => clearInterval(id);
  }, [loadStatus, loadPrompts]);

  return (
    <div className="space-y-5 max-w-2xl">
      {/* 헤더 */}
      <div className="flex items-start gap-3">
        <div className="p-2 bg-indigo-50 rounded-lg"><Cpu className="w-5 h-5 text-indigo-600" /></div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">AI 썸네일 재생성</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            네이버 누끼 이미지를 쿠팡용 깔끔한 흰 배경 썸네일로
            <b className="text-gray-700"> AI</b>가 자동 재생성합니다.
          </p>
        </div>
      </div>

      {/* 실시간 상태 — status.online 이 아니라 등급으로 판정한다.
          `.online` 은 하트비트 행 유무라, 품절 모니터만 살아있어도 "연결됨"이 되어
          정작 재생성 잡을 집어갈 세션 워커가 없는 걸 감춘다(실측 사고). */}
      {(() => {
        const link = loading ? null : classifyHelperLink(status?.workers);
        const box = link === 'online' ? 'bg-emerald-50 border-emerald-200'
          : link === 'monitor-only' ? 'bg-amber-50 border-amber-300'
          : 'bg-gray-50 border-gray-200';
        const text = link === 'online' ? 'text-emerald-700'
          : link === 'monitor-only' ? 'text-amber-800'
          : 'text-gray-600';
        return (
          <div className={`rounded-lg border p-4 ${box}`}>
            <div className="flex items-center gap-2">
              {loading ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                : link === 'online' ? <Wifi className="w-5 h-5 text-emerald-600" />
                : link === 'monitor-only' ? <WifiOff className="w-5 h-5 text-amber-600" />
                : <WifiOff className="w-5 h-5 text-gray-400" />}
              <span className={`font-semibold text-sm ${text}`}>
                {loading ? '확인 중...'
                  : link === 'online' ? '워커 연결됨'
                  : link === 'monitor-only' ? '모니터링만 연결됨 — 재생성 불가'
                  : '워커 꺼짐'}
              </span>
            </div>
            {link === 'online' ? (
              <p className="text-xs text-emerald-700 mt-1.5">
                {status!.workers.map(w => w.hostname || w.worker_id).join(', ')} — 지금 바로 재생성 버튼을 쓸 수 있어요.
              </p>
            ) : link === 'monitor-only' ? (
              <p className="text-xs text-amber-800 mt-1.5">
                품절 모니터링 신호는 오지만 재생성 작업을 집어갈 워커가 없습니다. 도우미 앱에서
                <b> 로그아웃 · 다른 계정 연결</b> → <b>메가로드 연결</b>로 다시 연결하세요.
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1.5">
                아래에서 워커 앱을 설치·실행하면 여기가 &quot;연결됨&quot;으로 바뀝니다.
              </p>
            )}
          </div>
        );
      })()}

      {/* 요건 */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="flex gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 leading-relaxed flex-1">
            <b>권장 사양:</b> NVIDIA 그래픽카드(RTX 권장) + Windows. 사양이 낮으면 생성 속도가 느려질 수 있습니다.
          </div>
          <button
            type="button"
            onClick={() => setSpec(runSpecCheck())}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 rounded-md text-xs font-semibold transition"
          >
            <Gauge className="w-3.5 h-3.5" />
            내 사양 체크
          </button>
        </div>

        {spec && (
          <div className="mt-3 space-y-2">
            {/* 종합 판정 */}
            {(() => {
              const s = GRADE_STYLE[spec.overall];
              const Icon = s.icon;
              return (
                <div className={`rounded-md border ${s.border} ${s.bg} p-2.5 flex items-start gap-2`}>
                  <Icon className={`w-4 h-4 ${s.text} shrink-0 mt-0.5`} />
                  <div className="flex-1">
                    <div className={`text-xs font-semibold ${s.text}`}>종합: {s.label}</div>
                    <div className="text-xs text-gray-700 mt-0.5">{spec.message}</div>
                  </div>
                </div>
              );
            })()}

            {/* 항목별 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {spec.rows.map((row) => {
                const s = GRADE_STYLE[row.grade];
                const Icon = s.icon;
                return (
                  <div key={row.label} className={`rounded-md border ${s.border} ${s.bg} px-2.5 py-2 flex items-start gap-2`}>
                    <Icon className={`w-3.5 h-3.5 ${s.text} shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-semibold text-gray-500">{row.label}</span>
                        <span className={`text-[10px] font-semibold ${s.text}`}>{s.label}</span>
                      </div>
                      <div className="text-xs font-medium text-gray-800 truncate" title={row.value}>{row.value}</div>
                      {row.hint && <div className="text-[10px] text-gray-500 mt-0.5">{row.hint}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400 leading-snug">
              * GPU/VRAM은 브라우저가 제공하는 정보로 추정한 값입니다. 정확한 VRAM은 작업관리자 → 성능 → GPU에서 확인하세요.
            </p>
          </div>
        )}
      </div>

      {/* ⭐ 다운로드 센터 — 모든 도우미 설치파일을 받는 단일 허브.
          다른 화면(검수·올인원·재생성 배너, 모니터링 페이지)은 여기로 링크만 한다. */}
      <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/40 p-4 space-y-4">
        <div className="flex items-center gap-1.5">
          <MonitorDown className="w-4 h-4 text-indigo-600" />
          <h4 className="text-sm font-bold text-gray-900">다운로드 센터</h4>
          <span className="text-[10px] text-gray-500">— 도우미 설치파일은 여기 한곳에서 받습니다</span>
        </div>

        {/* ① 메가로드 도우미 (등록·썸네일·올인원·GPU) */}
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Cpu className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold text-gray-900">메가로드 도우미</span>
            <span className="text-[10px] text-gray-500">등록·대표썸네일·올인원·로컬 GPU</span>
          </div>
          <a
            href={desktop.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#E31837] text-white rounded-lg font-semibold text-sm hover:bg-[#c5142f] transition"
          >
            <Download className="w-4 h-4" />
            메가로드 도우미 다운로드 (Windows)
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-white/20 rounded-full">v{desktop.version}</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
        </div>

        {/* ② 상품 모니터링 도우미 (품절·가격 모니터 — 별도 앱) */}
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Monitor className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-semibold text-gray-900">상품 모니터링 도우미</span>
            <span className="text-[10px] text-gray-500">품절·가격 자동 확인 · v{monitor.version}</span>
          </div>
          {/* 링크는 릴리스에 **실제로 있는 자산**만 — 없는 플랫폼 버튼은 아예 감춘다(404 방지). */}
          <div className="flex flex-wrap items-center gap-2">
            {monitor.urls.win && (
              <a
                href={monitor.urls.win}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700 transition"
              >
                <Download className="w-4 h-4" /> Windows (.exe)
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>
            )}
            {monitor.urls.macIntel && (
              <a
                href={monitor.urls.macIntel}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50 transition"
              >
                <Apple className="w-4 h-4" /> macOS Intel
              </a>
            )}
            {monitor.urls.macArm && (
              <a
                href={monitor.urls.macArm}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50 transition"
              >
                <Apple className="w-4 h-4" /> macOS M1/M2
              </a>
            )}
          </div>
          <Link
            href={MONITOR_AUTH_URL}
            className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-emerald-700 hover:text-emerald-900"
          >
            <KeyRound className="w-3.5 h-3.5" />
            인증코드 발급 · 연결 진단 →
          </Link>
        </div>
      </div>

      {/* 생성 프롬프트 (계정 기본값) */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-1.5">
          <Wand2 className="w-4 h-4 text-indigo-500" /> 생성 프롬프트 (선택)
        </h4>
        <p className="text-xs text-gray-500 mb-3">
          <b>기본값(쿠팡식 순백 스튜디오 배경)이 미리 채워져 있습니다.</b> 잘 모르겠으면 그대로 두세요.
          원하면 자유롭게 수정한 뒤 <b>저장</b>하면 새로 누르는 “AI 대표 썸네일 재생성”부터 적용돼요.
        </p>

        {promptLoading ? (
          <p className="text-xs text-gray-400">불러오는 중...</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">원하는 스타일 (positive)</label>
              <textarea
                value={promptPos}
                onChange={(e) => setPromptPos(e.target.value)}
                rows={3}
                placeholder={BUILTIN_POSITIVE}
                className="w-full text-xs rounded-md border border-gray-300 px-2.5 py-2 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 resize-y"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">제외할 요소 (negative)</label>
              <textarea
                value={promptNeg}
                onChange={(e) => setPromptNeg(e.target.value)}
                rows={2}
                placeholder={BUILTIN_NEGATIVE}
                className="w-full text-xs rounded-md border border-gray-300 px-2.5 py-2 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 resize-y"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={savePrompts}
                disabled={promptSaving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 transition"
              >
                {promptSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {promptSaving ? '저장 중...' : '프롬프트 저장'}
              </button>
              <button
                type="button"
                onClick={() => { setPromptPos(BUILTIN_POSITIVE); setPromptNeg(BUILTIN_NEGATIVE); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-md text-xs font-semibold hover:bg-gray-50 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                기본값으로 되돌리기
              </button>
              {promptSavedAt && !promptSaving && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 저장됨
                </span>
              )}
            </div>

            <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                로컬 워커는 누끼의 <b>배경만</b> 새로 그리고 상품 픽셀은 보존합니다. 잘리거나 불완전한 상품을 <b>복원·완성</b>하려면
                상품 화면의 <b>Gemini 재생성</b>을 사용하세요(전체 재생성).
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 단계 가이드 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-indigo-500" /> 설치 방법
        </h4>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div>
                <div className="text-sm font-medium text-gray-800">{s.t}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.d}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* 안내 */}
      <div className="flex items-start gap-2 text-xs text-gray-500">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <p>
          상품 픽셀은 그대로 보존하고 <b>배경만</b> 새로 생성합니다(인페인트). 결과는
          대량등록 화면에서 원본과 비교 확인하실 수 있습니다.
        </p>
      </div>
    </div>
  );
}

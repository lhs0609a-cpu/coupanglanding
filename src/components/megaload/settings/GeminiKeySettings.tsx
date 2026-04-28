'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Key, Copy, ExternalLink, CheckCircle2, AlertCircle, Loader2,
  Trash2, Eye, EyeOff, Save, Shield, Clock, DollarSign, CheckCheck,
} from 'lucide-react';

interface KeyStatus {
  hasKey: boolean;
  maskedKey: string | null;
}

interface ValidationResult {
  ok: boolean;
  message?: string;
  error?: string;
  hasImageModel?: boolean;
  modelCount?: number;
}

export default function GeminiKeySettings() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputKey, setInputKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [guideCollapsed, setGuideCollapsed] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/megaload/settings/gemini-key');
      const data = await res.json();
      setStatus(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleValidate = async () => {
    if (!inputKey.trim()) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch('/api/megaload/settings/gemini-key/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: inputKey.trim() }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch (err) {
      setValidationResult({ ok: false, error: err instanceof Error ? err.message : '검증 실패' });
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!inputKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/megaload/settings/gemini-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: inputKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setInputKey('');
      setValidationResult(null);
      await loadStatus();
      setGuideCollapsed(true);
    } catch (err) {
      setValidationResult({ ok: false, error: err instanceof Error ? err.message : '저장 실패' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('저장된 Gemini API 키를 삭제하시겠습니까?')) return;
    setSaving(true);
    try {
      await fetch('/api/megaload/settings/gemini-key', { method: 'DELETE' });
      await loadStatus();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-start gap-3 p-4 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl">
        <div className="p-2 bg-white rounded-lg shadow-sm">
          <Sparkles className="w-5 h-5 text-purple-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900">AI 이미지 — Gemini API 연결</h2>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
            썸네일 자동 재생성, 배경 정리 등 AI 이미지 편집 기능을 사용하려면 본인의 Gemini API 키가 필요합니다.
            <br />
            <b className="text-purple-700">하루 500장 무료</b> · 신용카드 등록 불필요 · 본인 Google 계정 쿼터 사용
          </p>
        </div>
      </div>

      {/* 현재 등록 상태 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-800">등록된 API 키</h3>
          </div>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : status?.hasKey ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-medium">
              <CheckCircle2 className="w-3 h-3" />
              등록됨
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[11px] font-medium">
              미등록
            </span>
          )}
        </div>

        {status?.hasKey ? (
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <code className="text-sm font-mono text-gray-700">{status.maskedKey}</code>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50 transition"
            >
              <Trash2 className="w-3 h-3" />
              삭제
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            아래 가이드에 따라 API 키를 발급받고 등록해주세요.
          </p>
        )}
      </div>

      {/* 발급 가이드 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setGuideCollapsed(!guideCollapsed)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">
              📘 Gemini API 키 발급 방법 (5단계, 약 2분 소요)
            </span>
          </div>
          <span className="text-xs text-gray-400">{guideCollapsed ? '펼치기 ▼' : '접기 ▲'}</span>
        </button>

        {!guideCollapsed && (
          <div className="border-t border-gray-100 p-5 space-y-5">
            {/* Why 섹션 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-lg">
                <DollarSign className="w-4 h-4 text-emerald-600 mb-1" />
                <div className="text-xs font-semibold text-emerald-800">무료 500장/일</div>
                <div className="text-[11px] text-emerald-700 mt-0.5">신용카드 등록 X</div>
              </div>
              <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-lg">
                <Clock className="w-4 h-4 text-blue-600 mb-1" />
                <div className="text-xs font-semibold text-blue-800">발급 2분</div>
                <div className="text-[11px] text-blue-700 mt-0.5">구글 계정만 필요</div>
              </div>
              <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-lg">
                <Shield className="w-4 h-4 text-purple-600 mb-1" />
                <div className="text-xs font-semibold text-purple-800">본인 쿼터</div>
                <div className="text-[11px] text-purple-700 mt-0.5">외부 공유 없음</div>
              </div>
            </div>

            {/* 단계별 가이드 */}
            <StepCard
              n={1}
              title="Google AI Studio 접속"
              body={
                <>
                  아래 링크를 클릭해 <b>Google AI Studio</b>에 접속합니다. Google 계정으로 로그인하세요.
                </>
              }
              visual={
                <div className="flex items-center gap-2 p-3 bg-gray-900 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <div className="w-2 h-2 rounded-full bg-yellow-400" />
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <div className="flex-1 text-[11px] font-mono text-gray-300 bg-gray-800 rounded px-2 py-1 ml-1 truncate">
                    https://aistudio.google.com
                  </div>
                </div>
              }
              action={
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition"
                >
                  <ExternalLink className="w-3 h-3" />
                  AI Studio API Keys 페이지 바로가기
                </a>
              }
            />

            <StepCard
              n={2}
              title="'+ Create API key' 버튼 클릭"
              body={
                <>
                  페이지 상단 오른쪽의 파란색 <b>&quot;+ Create API key&quot;</b> 버튼을 클릭합니다.
                  <br />
                  처음 사용하는 경우 서비스 약관 동의 창이 뜨면 체크 후 진행하세요.
                </>
              }
              visual={
                <div className="flex items-center justify-end p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded shadow-md">
                    <span className="text-base leading-none">+</span>
                    Create API key
                  </div>
                </div>
              }
            />

            <StepCard
              n={3}
              title="프로젝트 선택 또는 새로 생성"
              body={
                <>
                  처음 발급받는 경우 <b>&quot;Create API key in new project&quot;</b>를 선택합니다.
                  <br />
                  기존 Google Cloud 프로젝트가 있으면 해당 프로젝트에서 발급받아도 됩니다.
                </>
              }
              visual={
                <div className="space-y-1.5 p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                    <CheckCircle2 className="w-3 h-3" />
                    Create API key in new project
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-400">
                    <span className="w-3 h-3 rounded-full border border-gray-300" />
                    Select existing project
                  </div>
                </div>
              }
            />

            <StepCard
              n={4}
              title="생성된 키 복사"
              body={
                <>
                  생성된 키는 <code className="px-1 py-0.5 bg-gray-100 rounded text-[11px]">AIza</code>로 시작하는 약 39자 문자열입니다.
                  <br />
                  <b>Copy</b> 버튼을 눌러 복사합니다.
                  <span className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] border border-amber-200">
                    <AlertCircle className="w-3 h-3" />
                    절대 외부 유출 금지
                  </span>
                </>
              }
              visual={
                <div className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg">
                  <code className="flex-1 text-xs font-mono text-gray-700 bg-gray-50 px-2 py-1.5 rounded truncate">
                    AIzaSyB-k3L••••••••••••••••••••••••••Xyz9
                  </code>
                  <button className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded">
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                </div>
              }
            />

            <StepCard
              n={5}
              title="아래 입력란에 붙여넣고 저장"
              body={
                <>
                  복사한 키를 아래 <b>&quot;API 키 등록&quot;</b> 입력란에 붙여넣고 <b>&quot;검증&quot;</b>으로 확인 후 <b>&quot;저장&quot;</b>합니다.
                  <br />
                  저장된 키는 본인만 볼 수 있고, 서버에서 AI 호출 시 본인 Google 쿼터로 처리됩니다.
                </>
              }
              visual={
                <div className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg">
                  <input
                    type="text"
                    disabled
                    value="AIzaSyB-k3L..."
                    className="flex-1 text-xs font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-400"
                  />
                  <button className="flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white text-xs font-medium rounded">
                    <Save className="w-3 h-3" />
                    저장
                  </button>
                </div>
              }
            />

            {/* FAQ / 주의사항 */}
            <div className="mt-4 p-3 bg-amber-50/50 border border-amber-200 rounded-lg space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                <AlertCircle className="w-3.5 h-3.5" />
                주의사항 & 자주 묻는 질문
              </div>
              <ul className="text-[11px] text-amber-900 space-y-1 pl-5 list-disc">
                <li>
                  <b>신용카드 등록이 필요한가요?</b> 무료 티어는 등록 불필요합니다. &quot;Create API key in new project&quot;로 발급받으면 자동 무료 플랜입니다.
                </li>
                <li>
                  <b>500장을 초과하면 어떻게 되나요?</b> 무료 티어에서는 다음 날 00:00(PT) 쿼터가 리셋될 때까지 호출이 거부됩니다. 유료 등록은 선택사항입니다.
                </li>
                <li>
                  <b>키를 외부에 유출하면?</b> 타인이 본인 쿼터를 소진합니다. 유출 의심 시 AI Studio에서 키 삭제 후 재발급하세요.
                </li>
                <li>
                  <b>&quot;You do not have permission&quot; 에러가 뜹니다.</b> 회사/학교 Google 계정 제한입니다. <b>개인 Gmail</b>로 로그인 후 다시 시도하세요.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* API 키 등록 폼 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Save className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-800">API 키 등록</h3>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={inputKey}
              onChange={e => { setInputKey(e.target.value); setValidationResult(null); }}
              placeholder="AIza로 시작하는 Gemini API 키를 붙여넣으세요"
              className="w-full px-3 py-2 pr-9 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-300 focus:border-transparent outline-none"
            />
            <button
              onClick={() => setShowKey(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={handleValidate}
            disabled={!inputKey.trim() || validating || saving}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-50 disabled:opacity-50 transition"
          >
            {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
            검증
          </button>
          <button
            onClick={handleSave}
            disabled={!inputKey.trim() || saving || validating}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            저장
          </button>
        </div>

        {validationResult && (
          <div
            className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
              validationResult.ok
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {validationResult.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-medium">
                {validationResult.ok ? validationResult.message : validationResult.error}
              </div>
              {validationResult.ok && validationResult.modelCount !== undefined && (
                <div className="text-[10px] opacity-75 mt-0.5">
                  접근 가능한 모델: {validationResult.modelCount}개
                </div>
              )}
            </div>
          </div>
        )}

        <p className="text-[10px] text-gray-400 pt-1">
          키는 Supabase 데이터베이스에 본인 계정으로만 조회 가능하게 저장됩니다. 서비스 운영자도 열람하지 않습니다.
        </p>
      </div>
    </div>
  );
}

function StepCard({
  n, title, body, visual, action,
}: {
  n: number;
  title: string;
  body: React.ReactNode;
  visual?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto,1fr,auto] gap-3 items-start">
      <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 font-bold text-sm flex items-center justify-center shrink-0">
        {n}
      </div>
      <div className="space-y-2 min-w-0">
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        <div className="text-[12px] text-gray-600 leading-relaxed">{body}</div>
        {visual && <div>{visual}</div>}
        {action && <div className="pt-1">{action}</div>}
      </div>
    </div>
  );
}

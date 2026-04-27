'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, RotateCcw, Check, AlertCircle, ExternalLink, Key } from 'lucide-react';

interface GeminiRegenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl: string;
  onApply: (newUrl: string) => void;
}

// 쿠팡 썸네일 — 흰 배경 + 정면 각도 완전 복원 모드
const PRESET_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: '정면 · 흰 배경 · 완전 복원',
    prompt:
      'Create a clean Coupang e-commerce product thumbnail on a PURE WHITE background (#FFFFFF). Show the COMPLETE product from a STRAIGHT FRONT-FACING ANGLE (head-on view, camera perpendicular to the product front) so the entire product is fully visible and not tilted or angled. Reconstruct and extend any parts that are cropped, cut off, or hidden at the edges of the original so the whole product appears within the frame. Keep the product centered with balanced white space around it. PRESERVE ALL visible Korean text, labels, logos, brand names, and graphics EXACTLY as they appear in the original — same fonts, same colors, same positions. For hidden or cropped areas that may contain text, continue the packaging pattern naturally without fabricating readable text that was not clearly visible. Maintain the exact same product identity: same colors, same packaging design, same proportions, same material texture. Professional studio lighting, sharp focus, subtle natural shadow directly beneath the product only. NO gradient background, NO colored background, NO props, NO lifestyle elements, NO tilted perspective. Square 1:1 composition, front-view e-commerce product photography.',
  },
];

export default function GeminiRegenerateModal({
  isOpen,
  onClose,
  currentImageUrl,
  onApply,
}: GeminiRegenerateModalProps) {
  const [prompt, setPrompt] = useState(PRESET_PROMPTS[0].prompt);
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPrompt(PRESET_PROMPTS[0].prompt);
      setGeneratedUrl(null);
      setError(null);
      setNeedsKey(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setNeedsKey(false);
    setGeneratedUrl(null);
    try {
      const res = await fetch('/api/megaload/products/regenerate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: currentImageUrl, prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'NO_API_KEY') {
          setNeedsKey(true);
          setError(data.error);
        } else {
          throw new Error(data.error || '재생성 실패');
        }
        return;
      }
      setGeneratedUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '재생성 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (generatedUrl) {
      onApply(generatedUrl);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-800">Gemini으로 썸네일 재생성</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Image comparison */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-medium text-gray-600 mb-1.5">원본</div>
              <div className="aspect-square rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                <img src={currentImageUrl} alt="원본" className="w-full h-full object-contain" />
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-gray-600 mb-1.5">
                {generatedUrl ? '생성 결과' : loading ? '생성 중...' : '생성 결과 (대기)'}
              </div>
              <div className="aspect-square rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center">
                {loading ? (
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                    <span className="text-xs">Gemini이 이미지를 만드는 중...</span>
                    <span className="text-[10px] text-gray-400">보통 10~30초</span>
                  </div>
                ) : generatedUrl ? (
                  <img src={generatedUrl} alt="생성 결과" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-xs text-gray-300">아직 생성되지 않았습니다</div>
                )}
              </div>
            </div>
          </div>

          {/* Preset prompts */}
          <div>
            <div className="text-[11px] font-medium text-gray-600 mb-1.5">프리셋</div>
            <div className="flex flex-wrap gap-2">
              {PRESET_PROMPTS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setPrompt(p.prompt)}
                  disabled={loading}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                    prompt === p.prompt
                      ? 'bg-purple-50 border-purple-300 text-purple-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-purple-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt textarea */}
          <div>
            <div className="text-[11px] font-medium text-gray-600 mb-1.5">
              프롬프트 (편집 가능, 영어 권장)
            </div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              disabled={loading}
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-300 focus:border-transparent outline-none resize-y disabled:bg-gray-50 font-mono"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              <b className="text-purple-600">정면 복원 모드</b>: 잘린 부분은 자연스럽게 이어 그리고, 상품이 정면으로 온전히 보이게 재생성합니다.
              <br />
              보이는 한글 글자·로고는 <b>그대로 유지</b>, 안 보이던 영역에 없던 글자를 만들어내진 않습니다. 결과는 원본과 반드시 비교 확인 필요.
            </p>
          </div>

          {/* Error */}
          {error && !needsKey && (
            <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span className="text-xs text-red-700">{error}</span>
            </div>
          )}

          {/* API 키 미등록 안내 */}
          {needsKey && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <Key className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-amber-900 mb-1">
                  Gemini API 키를 먼저 등록해주세요
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  AI 이미지 편집 기능은 본인의 Gemini API 키가 필요합니다 (하루 500장 무료).
                  설정 페이지에서 5단계로 쉽게 발급받을 수 있어요.
                </p>
                <a
                  href="/megaload/settings?tab=ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition"
                >
                  <ExternalLink className="w-3 h-3" />
                  API 키 등록하러 가기
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200">
          <div className="text-[10px] text-gray-400">
            Gemini 2.5 Flash Image · 장당 약 $0.039 (또는 무료 티어 500장/일)
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
            >
              취소
            </button>
            {generatedUrl && (
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-50 disabled:opacity-50 transition"
              >
                <RotateCcw className="w-3 h-3" />
                다시 생성
              </button>
            )}
            {!generatedUrl ? (
              <button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {loading ? '생성 중...' : '생성'}
              </button>
            ) : (
              <button
                onClick={handleApply}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition"
              >
                <Check className="w-3 h-3" />
                이 이미지로 교체
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

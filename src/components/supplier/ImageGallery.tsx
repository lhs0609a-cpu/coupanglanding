'use client';

import { useCallback, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ImagePlus, Loader2, X, Star, ChevronLeft, ChevronRight, Link2 } from 'lucide-react';

const BUCKET = 'product-images';

const typeToExt = (t: string) =>
  t === 'image/png' ? 'png' : t === 'image/webp' ? 'webp' : t === 'image/gif' ? 'gif' : 'jpg';

function normalizedName(f: File, i: number): string {
  if (f.name && /\.[a-z0-9]+$/i.test(f.name)) return f.name;
  return `image-${i}.${typeToExt(f.type)}`;
}

/**
 * 상품 이미지 갤러리 — 드래그&드롭 / 클립보드 붙여넣기(Ctrl+V) / 클릭 업로드 / URL 추가.
 * 첫 번째 이미지가 대표 썸네일. 브라우저 → Supabase 스토리지 직접 업로드(공개 URL).
 */
export default function ImageGallery({
  urls,
  onChange,
  max = 12,
}: {
  urls: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const uploadFiles = useCallback(async (files: File[]) => {
    setError('');
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    const room = max - urls.length;
    if (room <= 0) { setError(`이미지는 최대 ${max}장까지입니다.`); return; }
    const picked = imgs.slice(0, room);

    setUploading(true);
    try {
      const meta = picked.map((f, i) => ({ name: normalizedName(f, i), size: f.size, type: f.type }));
      const res = await fetch('/api/supplier/product-image/upload-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: meta }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '업로드 준비 실패'); return; }
      const uploads: { path: string; token: string; publicUrl: string }[] = data.uploads || [];

      const supabase = createClient();
      const done: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        setProgress(`업로드 중 ${i + 1}/${picked.length}`);
        const u = uploads[i];
        const { error: upErr } = await supabase.storage.from(BUCKET).uploadToSignedUrl(u.path, u.token, picked[i]);
        if (upErr) { setError(`업로드 실패: ${picked[i].name} (${upErr.message})`); break; }
        done.push(u.publicUrl);
      }
      if (done.length) onChange([...urls, ...done]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 오류');
    } finally {
      setUploading(false);
      setProgress('');
    }
  }, [urls, onChange, max]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) { uploadFiles(files); return; }
    // 이미지가 아닌 URL 드롭
    const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (uri && /^https?:\/\//.test(uri.trim())) onChange([...urls, uri.trim()]);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items || []);
    const fileItems = items.filter((it) => it.kind === 'file' && it.type.startsWith('image/'));
    if (fileItems.length) {
      e.preventDefault();
      const files = fileItems.map((it) => it.getAsFile()).filter((f): f is File => !!f);
      uploadFiles(files);
      return;
    }
    const text = e.clipboardData.getData('text');
    if (text && /^https?:\/\/\S+\.(png|jpe?g|webp|gif)/i.test(text.trim())) {
      e.preventDefault();
      onChange([...urls, text.trim()]);
    }
  };

  const addUrl = () => {
    const v = urlInput.trim();
    if (!v) return;
    if (!/^https?:\/\//.test(v)) { setError('http(s) URL을 입력하세요.'); return; }
    onChange([...urls, v]); setUrlInput(''); setError('');
  };

  const remove = (i: number) => onChange(urls.filter((_, k) => k !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= urls.length) return;
    const next = [...urls];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div
      onPaste={onPaste}
      tabIndex={0}
      className="outline-none"
    >
      {/* 드롭존 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
          dragOver ? 'border-emerald-400 bg-emerald-50/60' : 'border-gray-200 bg-white/60 hover:border-emerald-300 hover:bg-emerald-50/30'
        }`}
      >
        <div className="mx-auto w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white grid place-items-center shadow-lg shadow-emerald-500/25 mb-2">
          {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
        </div>
        <p className="text-sm font-medium text-gray-700">
          {uploading ? progress || '업로드 중...' : '이미지를 끌어다 놓거나 클릭'}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">여기를 클릭 후 <b>Ctrl+V</b>로 캡처·복사한 이미지 붙여넣기도 됩니다 · 첫 장이 대표</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { uploadFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
      </div>

      {/* URL로 추가 */}
      <div className="mt-2 flex gap-2">
        <div className="flex-1 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white/70 px-2.5">
          <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())}
            placeholder="이미지 URL 붙여넣기" className="w-full py-1.5 text-sm outline-none bg-transparent" />
        </div>
        <button type="button" onClick={addUrl} className="px-3 rounded-lg border border-gray-200 bg-white/70 text-sm text-gray-600 hover:bg-white">추가</button>
      </div>

      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}

      {/* 썸네일 그리드 */}
      {urls.length > 0 && (
        <div className="mt-3 grid grid-cols-4 sm:grid-cols-5 gap-2">
          {urls.map((u, i) => (
            <div key={u + i} className="group relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="w-full h-full object-cover" />
              {i === 0 && (
                <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded-md bg-[#E31837] text-white text-[9px] font-bold px-1.5 py-0.5 shadow">
                  <Star className="w-2.5 h-2.5 fill-white" /> 대표
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-between p-1 opacity-0 group-hover:opacity-100 transition bg-gradient-to-t from-black/50 to-transparent">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="w-5 h-5 rounded bg-white/90 grid place-items-center disabled:opacity-30"><ChevronLeft className="w-3 h-3" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === urls.length - 1} className="w-5 h-5 rounded bg-white/90 grid place-items-center disabled:opacity-30"><ChevronRight className="w-3 h-3" /></button>
              </div>
              <button type="button" onClick={() => remove(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white grid place-items-center opacity-0 group-hover:opacity-100 hover:bg-rose-500 transition">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

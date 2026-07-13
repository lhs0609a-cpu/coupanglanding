'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Type as TypeIcon } from 'lucide-react';
import { uploadProductImages } from './uploadProductImages';

/**
 * 상세페이지 블로그식 에디터 — 글은 그냥 타이핑/워드 붙여넣기, 이미지는 드래그&드롭 /
 * Ctrl+V 붙여넣기 / 버튼으로 본문 안에 바로 삽입. 결과는 HTML 로 상위에 전달.
 */
export default function DetailEditor({ html, onChange }: { html: string; onChange: (h: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');

  // 최초 1회만 주입(매 렌더 주입하면 커서가 튄다)
  useEffect(() => {
    if (ref.current && !ref.current.innerHTML) ref.current.innerHTML = html || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = () => { if (ref.current) onChange(ref.current.innerHTML); };

  const insertImages = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    setUploading(true); setError('');
    try {
      const urls = await uploadProductImages(imgs);
      if (urls.length === 0) { setError('이미지 업로드에 실패했습니다.'); return; }
      const frag = urls.map((u) => `<img src="${u}" style="max-width:100%;display:block;margin:8px auto" />`).join('') + '<p><br/></p>';
      ref.current?.focus();
      document.execCommand('insertHTML', false, frag);
      sync();
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 오류');
    } finally { setUploading(false); }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items || []);
    const fileItems = items.filter((it) => it.kind === 'file' && it.type.startsWith('image/'));
    if (fileItems.length > 0) {
      e.preventDefault();
      insertImages(fileItems.map((it) => it.getAsFile()).filter((f): f is File => !!f));
      return;
    }
    // 이미지가 아니면 기본 붙여넣기(워드/텍스트 HTML) 허용 후 동기화
    setTimeout(sync, 0);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) insertImages(files);
  };

  return (
    <div>
      {/* 툴바 */}
      <div className="flex items-center gap-2 mb-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow shadow-emerald-500/25 disabled:opacity-50">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} 이미지 넣기
        </button>
        <span className="text-xs text-gray-400 flex items-center gap-1"><TypeIcon className="w-3.5 h-3.5" /> 글은 그냥 입력 · 워드 붙여넣기 OK · 이미지는 끌어다 놓거나 Ctrl+V</span>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { insertImages(Array.from(e.target.files || [])); e.target.value = ''; }} />
      </div>

      {/* 편집 영역 */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        data-placeholder="여기에 상품 설명을 자유롭게 작성하세요. 상세 이미지는 통째로 끌어다 놓으면 됩니다."
        className={`detail-editor min-h-[240px] max-h-[520px] overflow-y-auto rounded-xl border bg-white/80 px-4 py-3 text-sm leading-relaxed text-gray-800 outline-none transition focus:ring-2 focus:ring-emerald-400/40 ${
          drag ? 'border-emerald-400 ring-2 ring-emerald-400/40' : 'border-gray-200/80'
        }`}
      />
      {error && <p className="text-xs text-rose-600 mt-1.5">{error}</p>}

      <style jsx global>{`
        .detail-editor:empty:before { content: attr(data-placeholder); color: #cbd5e1; }
        .detail-editor img { max-width: 100%; height: auto; }
        .detail-editor p { margin: 6px 0; }
      `}</style>
    </div>
  );
}

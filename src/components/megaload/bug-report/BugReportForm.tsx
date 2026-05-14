'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import type { BugReportAttachment, BugReportCategory } from '@/lib/supabase/types';
import { BUG_REPORT_CATEGORY_LABELS } from '@/lib/utils/constants';

interface BugReportFormProps {
  onSubmit: (data: {
    title: string;
    description: string;
    category: BugReportCategory;
    attachments: BugReportAttachment[];
    page_url: string;
    browser_info: string;
    screen_size: string;
  }) => Promise<void>;
  onUploadImage: (file: File) => Promise<BugReportAttachment | null>;
  submitting: boolean;
}

const CATEGORIES = Object.entries(BUG_REPORT_CATEGORY_LABELS) as [BugReportCategory, string][];

export default function BugReportForm({ onSubmit, onUploadImage, submitting }: BugReportFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<BugReportCategory>('general');
  const [attachments, setAttachments] = useState<BugReportAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const att = await onUploadImage(file);
      if (att) setAttachments(prev => [...prev, att]);
    } finally {
      setUploading(false);
    }
  }, [onUploadImage]);

  // window 레벨 paste — form 마운트된 동안 모달 어디서 Ctrl+V 눌러도 이미지 첨부.
  // textarea 외 (카테고리 select, 제목 input, 빈 공간) 에서도 작동.
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleUpload(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [handleUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        handleUpload(file);
      }
    }
  }, [handleUpload]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      handleUpload(file);
    }
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      category,
      attachments,
      page_url: typeof window !== 'undefined' ? window.location.href : '',
      browser_info: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      screen_size: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 카테고리 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">분류</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value as BugReportCategory)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
        >
          {CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* 제목 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">제목 *</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="오류 내용을 간단히 입력하세요"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
        />
      </div>

      {/* 설명 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">상세 설명 *</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="어떤 상황에서 오류가 발생했는지 자세히 설명해주세요.&#10;Ctrl+V로 클립보드 이미지를 바로 첨부할 수 있습니다."
          rows={5}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent resize-none"
        />
      </div>

      {/* 이미지 첨부 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">스크린샷 첨부</label>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-4 text-center transition ${
            dragOver ? 'border-[#E31837] bg-red-50' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 mx-auto text-sm text-gray-500 hover:text-gray-700 transition"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Upload className="w-5 h-5" />
            )}
            {uploading ? '업로드 중...' : '이미지를 드래그하거나 클릭하여 선택'}
          </button>
          <p className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
            <ImageIcon className="w-3 h-3" />
            Ctrl+V로 클립보드 이미지 바로 첨부 가능
          </p>
        </div>

        {/* 첨부 미리보기 */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {attachments.map((att, idx) => (
              <div key={idx} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.url}
                  alt={att.name}
                  className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 제출 */}
      <button
        type="submit"
        disabled={submitting || !title.trim() || !description.trim()}
        className="w-full py-2.5 bg-[#E31837] text-white font-medium rounded-lg hover:bg-[#c81530] disabled:opacity-50 transition text-sm"
      >
        {submitting ? '등록 중...' : '오류 신고'}
      </button>
    </form>
  );
}

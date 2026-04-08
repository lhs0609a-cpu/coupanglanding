'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, X, Loader2, Image as ImageIcon } from 'lucide-react';
import type { BugReportMessage, BugReportAttachment } from '@/lib/supabase/types';
import ImageLightbox from './ImageLightbox';

interface BugReportThreadProps {
  messages: BugReportMessage[];
  loading: boolean;
  disabled?: boolean;
  onSendMessage: (content: string, attachments: BugReportAttachment[]) => Promise<void>;
  onUploadImage: (file: File) => Promise<BugReportAttachment | null>;
  role: 'user' | 'admin';
}

export default function BugReportThread({
  messages,
  loading,
  disabled,
  onSendMessage,
  onUploadImage,
  role,
}: BugReportThreadProps) {
  const [content, setContent] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<BugReportAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const attachment = await onUploadImage(file);
      if (attachment) {
        setPendingAttachments(prev => [...prev, attachment]);
      }
    } finally {
      setUploading(false);
    }
  }, [onUploadImage]);

  // Ctrl+V 클립보드 이미지 붙여넣기
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
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
  }, [handleUpload]);

  const handleSend = async () => {
    if ((!content.trim() && pendingAttachments.length === 0) || sending) return;
    setSending(true);
    try {
      await onSendMessage(content.trim(), pendingAttachments);
      setContent('');
      setPendingAttachments([]);
    } finally {
      setSending(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      handleUpload(file);
    }
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const openLightbox = (allImages: string[], clickedIndex: number) => {
    setLightbox({ images: allImages, index: clickedIndex });
  };

  // 메시지별 user: 오른쪽(빨강), admin: 왼쪽(회색)
  // role === 'admin'이면 admin이 본인 → admin 오른쪽
  const isSelf = (senderRole: string) =>
    role === 'admin' ? senderRole === 'admin' : senderRole === 'user';

  return (
    <div className="flex flex-col h-full">
      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1 max-h-[400px]">
        {loading ? (
          <div className="space-y-3 py-4">
            {[1, 2].map(i => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            아직 메시지가 없습니다
          </div>
        ) : (
          messages.map(msg => {
            const self = isSelf(msg.sender_role);
            const msgImages = (msg.attachments || []).map(a => a.url);
            return (
              <div key={msg.id} className={`flex ${self ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                  self
                    ? 'bg-[#E31837] text-white rounded-tr-md'
                    : 'bg-gray-100 text-gray-800 rounded-tl-md'
                }`}>
                  {msg.content && (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                  {msgImages.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {msgImages.map((url, idx) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={idx}
                          src={url}
                          alt={`첨부 ${idx + 1}`}
                          className="w-20 h-20 object-cover rounded-lg cursor-pointer hover:opacity-80 transition"
                          onClick={() => openLightbox(msgImages, idx)}
                        />
                      ))}
                    </div>
                  )}
                  <p className={`text-[10px] mt-1 ${self ? 'text-white/60' : 'text-gray-400'}`}>
                    {msg.sender_role === 'admin' ? '관리자' : '사용자'} · {new Date(msg.created_at).toLocaleString('ko-KR')}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      {!disabled && (
        <div className="border-t border-gray-100 pt-3">
          {/* 첨부 미리보기 */}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingAttachments.map((att, idx) => (
                <div key={idx} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={att.url}
                    alt={att.name}
                    className="w-16 h-16 object-cover rounded-lg border border-gray-200"
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

          <div className="flex gap-2 items-end">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"
              title="이미지 첨부"
            >
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="메시지를 입력하세요... (Ctrl+V로 이미지 붙여넣기)"
              rows={1}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#E31837]/20 focus:border-[#E31837] resize-none"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || (!content.trim() && pendingAttachments.length === 0)}
              className="p-2.5 bg-[#E31837] text-white rounded-full hover:bg-[#c81530] disabled:opacity-50 transition"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>

          <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1">
            <ImageIcon className="w-3 h-3" />
            Ctrl+V로 클립보드 이미지를 바로 첨부할 수 있습니다
          </p>
        </div>
      )}

      {/* 라이트박스 */}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          currentIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={index => setLightbox(prev => prev ? { ...prev, index } : null)}
        />
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { GUIDE_ARTICLES, GUIDE_CATEGORIES } from '@/lib/data/guides';
import Card from '@/components/ui/Card';
import FileUpload from '@/components/ui/FileUpload';
import { BookOpen, Trash2, Plus, Image as ImageIcon, RotateCcw } from 'lucide-react';

interface GuideImage {
  id: string;
  article_id: string;
  step_index: number;
  image_url: string;
  alt_text: string;
  caption: string | null;
  display_order: number;
  created_at: string;
}

export default function AdminGuideImagesPage() {
  const [selectedArticleId, setSelectedArticleId] = useState('');
  const [images, setImages] = useState<GuideImage[]>([]);
  const [hiddenStaticImages, setHiddenStaticImages] = useState<{ step_index: number; image_index: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStepIndex, setUploadStepIndex] = useState<number | null>(null);
  const [altText, setAltText] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  const supabase = useMemo(() => createClient(), []);

  const selectedArticle = GUIDE_ARTICLES.find((a) => a.articleId === selectedArticleId);
  const selectedCategory = selectedArticle
    ? GUIDE_CATEGORIES.find((c) => c.categoryId === selectedArticle.categoryId)
    : null;

  const fetchImages = useCallback(async () => {
    if (!selectedArticleId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/guide-images?articleId=${selectedArticleId}`);
      const data = await res.json();
      setImages(data.images || []);
      setHiddenStaticImages(data.hiddenStaticImages || []);
    } catch {
      setImages([]);
      setHiddenStaticImages([]);
    } finally {
      setLoading(false);
    }
  }, [selectedArticleId]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const handleUpload = async () => {
    if (!selectedFile || uploadStepIndex === null || !selectedArticleId) return;

    setUploading(true);
    setMessage({ type: '', text: '' });

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('articleId', selectedArticleId);
      formData.append('stepIndex', String(uploadStepIndex));
      formData.append('altText', altText || selectedFile.name);
      formData.append('caption', caption);

      const res = await fetch('/api/guide-images', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '업로드 실패' });
        return;
      }

      setMessage({ type: 'success', text: '이미지가 업로드되었습니다.' });
      setSelectedFile(null);
      setAltText('');
      setCaption('');
      setUploadStepIndex(null);
      fetchImages();
    } catch {
      setMessage({ type: 'error', text: '업로드 중 오류가 발생했습니다.' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (imageId: string) => {
    if (!confirm('이 이미지를 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/guide-images?id=${imageId}`, { method: 'DELETE' });
      if (res.ok) {
        setImages((prev) => prev.filter((img) => img.id !== imageId));
        setMessage({ type: 'success', text: '이미지가 삭제되었습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '삭제 중 오류가 발생했습니다.' });
    }
  };

  const hiddenSet = useMemo(
    () => new Set(hiddenStaticImages.map((h) => `${h.step_index}-${h.image_index}`)),
    [hiddenStaticImages]
  );

  const handleHideStatic = async (stepIndex: number, imageIndex: number) => {
    if (!confirm('이 기본 이미지를 숨기시겠습니까?')) return;
    try {
      const res = await fetch('/api/guide-images/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: selectedArticleId, stepIndex, imageIndex }),
      });
      if (res.ok) {
        setHiddenStaticImages((prev) => [...prev, { step_index: stepIndex, image_index: imageIndex }]);
        setMessage({ type: 'success', text: '기본 이미지가 숨겨졌습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '숨기기 중 오류가 발생했습니다.' });
    }
  };

  const handleRestoreStatic = async (stepIndex: number, imageIndex: number) => {
    try {
      const res = await fetch(
        `/api/guide-images/hide?articleId=${selectedArticleId}&stepIndex=${stepIndex}&imageIndex=${imageIndex}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setHiddenStaticImages((prev) =>
          prev.filter((h) => !(h.step_index === stepIndex && h.image_index === imageIndex))
        );
        setMessage({ type: 'success', text: '기본 이미지가 복원되었습니다.' });
      }
    } catch {
      setMessage({ type: 'error', text: '복원 중 오류가 발생했습니다.' });
    }
  };

  // 스텝별로 이미지 그룹핑
  const imagesByStep = useMemo(() => {
    const map = new Map<number, GuideImage[]>();
    images.forEach((img) => {
      const list = map.get(img.step_index) || [];
      list.push(img);
      map.set(img.step_index, list);
    });
    return map;
  }, [images]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="w-6 h-6 text-[#E31837]" />
        <h1 className="text-2xl font-bold text-gray-900">가이드 이미지 관리</h1>
      </div>

      {/* 아티클 선택 */}
      <Card>
        <h2 className="text-sm font-bold text-gray-700 mb-3">가이드 선택</h2>
        <select
          value={selectedArticleId}
          onChange={(e) => {
            setSelectedArticleId(e.target.value);
            setUploadStepIndex(null);
            setMessage({ type: '', text: '' });
          }}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#E31837] focus:border-transparent"
        >
          <option value="">가이드를 선택하세요</option>
          {GUIDE_CATEGORIES.map((cat) => (
            <optgroup key={cat.categoryId} label={`${cat.icon} ${cat.title}`}>
              {GUIDE_ARTICLES.filter((a) => a.categoryId === cat.categoryId).map((article) => (
                <option key={article.articleId} value={article.articleId}>
                  {article.icon} {article.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Card>

      {selectedArticle && (
        <>
          {/* 현재 이미지 상태 */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-700">
                {selectedCategory?.icon} {selectedArticle.title} - 스텝별 이미지
              </h2>
              <span className="text-xs text-gray-500">
                업로드된 이미지 {images.length}장
              </span>
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-400">불러오는 중...</div>
            ) : (
              <div className="space-y-4">
                {selectedArticle.steps.map((step, stepIdx) => {
                  const stepImages = imagesByStep.get(stepIdx) || [];
                  const staticImages = step.images || [];
                  return (
                    <div key={stepIdx} className="border border-gray-100 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center w-6 h-6 bg-[#E31837] text-white text-xs font-bold rounded-full">
                            {stepIdx + 1}
                          </span>
                          <span className="text-sm font-medium text-gray-900">{step.title}</span>
                          <span className="text-xs text-gray-400">
                            (기본 {staticImages.length}장 + 업로드 {stepImages.length}장)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setUploadStepIndex(uploadStepIndex === stepIdx ? null : stepIdx)}
                          className="flex items-center gap-1 text-xs text-[#E31837] hover:text-[#c01530] font-medium"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          이미지 추가
                        </button>
                      </div>

                      {/* 기본(정적) 이미지 */}
                      {staticImages.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs text-gray-400 mb-2">기본 이미지 (코드 내장)</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {staticImages.map((img, j) => {
                              const isHidden = hiddenSet.has(`${stepIdx}-${j}`);
                              return (
                                <div
                                  key={`static-${j}`}
                                  className={`relative group border rounded-lg overflow-hidden ${isHidden ? 'border-orange-300 opacity-50' : 'border-gray-200'}`}
                                >
                                  <img src={img.src} alt={img.alt} className="w-full h-24 object-cover bg-gray-50" loading="lazy" />
                                  {isHidden ? (
                                    <>
                                      <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded">숨김</span>
                                      <button
                                        type="button"
                                        onClick={() => handleRestoreStatic(stepIdx, j)}
                                        className="absolute top-1 right-1 p-1 bg-green-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
                                        title="복원"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleHideStatic(stepIdx, j)}
                                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
                                      title="숨기기"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                  {img.caption && (
                                    <p className="text-[10px] text-gray-500 p-1 truncate">{img.caption}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 업로드된 이미지 */}
                      {stepImages.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-400 mb-2">업로드된 이미지</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {stepImages.map((img) => (
                              <div key={img.id} className="relative group border border-gray-200 rounded-lg overflow-hidden">
                                <img src={img.image_url} alt={img.alt_text} className="w-full h-24 object-cover bg-gray-50" loading="lazy" />
                                <button
                                  type="button"
                                  onClick={() => handleDelete(img.id)}
                                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                                {img.caption && (
                                  <p className="text-[10px] text-gray-500 p-1 truncate">{img.caption}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {staticImages.length === 0 && stepImages.length === 0 && (
                        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                          <ImageIcon className="w-4 h-4" />
                          이미지 없음
                        </div>
                      )}

                      {/* 업로드 폼 (이 스텝이 선택되었을 때만) */}
                      {uploadStepIndex === stepIdx && (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                          <FileUpload
                            label="이미지 파일"
                            onFileSelect={(file) => setSelectedFile(file)}
                            onClear={() => setSelectedFile(null)}
                            previewUrl={selectedFile ? URL.createObjectURL(selectedFile) : null}
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">대체 텍스트 (alt)</label>
                              <input
                                type="text"
                                value={altText}
                                onChange={(e) => setAltText(e.target.value)}
                                placeholder="이미지 설명"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">캡션</label>
                              <input
                                type="text"
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                                placeholder="이미지 아래 표시될 설명"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleUpload}
                            disabled={!selectedFile || uploading}
                            className="px-4 py-2 bg-[#E31837] text-white text-sm font-medium rounded-lg hover:bg-[#c01530] transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {uploading ? '업로드 중...' : '업로드'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {message.text && (
              <p className={`mt-4 text-sm ${message.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                {message.text}
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

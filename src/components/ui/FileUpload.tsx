'use client';

import { useState, useRef } from 'react';
import { Upload, X, Image } from 'lucide-react';

interface FileUploadProps {
  label?: string;
  accept?: string;
  onFileSelect: (file: File) => void;
  onClear?: () => void;
  previewUrl?: string | null;
  error?: string;
}

export default function FileUpload({
  label = '파일 업로드',
  accept = 'image/*',
  onFileSelect,
  onClear,
  previewUrl,
  error,
}: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setFileName(file.name);
      onFileSelect(file);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      onFileSelect(file);
    }
  };

  const handleClear = () => {
    setFileName(null);
    if (inputRef.current) inputRef.current.value = '';
    onClear?.();
  };

  return (
    <div>
      {label && <p className="block text-sm font-medium text-gray-700 mb-1">{label}</p>}

      {previewUrl ? (
        <div className="relative border border-gray-200 rounded-lg overflow-hidden">
          <img src={previewUrl} alt="미리보기" className="w-full h-48 object-contain bg-gray-50" />
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-2 right-2 p-1 bg-white rounded-full shadow hover:bg-gray-100"
            aria-label="제거"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
            dragOver
              ? 'border-[#E31837] bg-red-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleChange}
            className="hidden"
          />
          {fileName ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-700">
              <Image className="w-5 h-5" />
              <span>{fileName}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleClear(); }}
                className="p-0.5 hover:bg-gray-200 rounded"
                aria-label="제거"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                클릭하거나 파일을 드래그하세요
              </p>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG 등 이미지 파일</p>
            </>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

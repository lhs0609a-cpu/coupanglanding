'use client';

import { useState, useRef } from 'react';
import { Upload, X, Image } from 'lucide-react';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface FileUploadProps {
  label?: string;
  accept?: string;
  onFileSelect: (file: File) => void;
  onClear?: () => void;
  previewUrl?: string | null;
  error?: string;
  warning?: string;
  successMessage?: string;
}

export default function FileUpload({
  label = '파일 업로드',
  accept = 'image/*',
  onFileSelect,
  onClear,
  previewUrl,
  error,
  warning,
  successMessage,
}: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'JPEG, PNG, GIF, WebP 이미지만 업로드할 수 있습니다.';
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `파일 크기는 ${MAX_SIZE_MB}MB 이하여야 합니다. (현재: ${(file.size / 1024 / 1024).toFixed(1)}MB)`;
    }
    return null;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const err = validateFile(file);
      if (err) {
        setValidationError(err);
        return;
      }
      setValidationError(null);
      setFileName(file.name);
      onFileSelect(file);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const err = validateFile(file);
      if (err) {
        setValidationError(err);
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
      setValidationError(null);
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
              <p className="text-xs text-gray-400 mt-1">JPEG, PNG, GIF, WebP (최대 {MAX_SIZE_MB}MB)</p>
            </>
          )}
        </div>
      )}

      {(validationError || error) && <p className="mt-1 text-sm text-red-600">{validationError || error}</p>}
      {warning && !validationError && !error && <p className="mt-1 text-sm text-yellow-600">{warning}</p>}
      {successMessage && !validationError && !error && !warning && <p className="mt-1 text-sm text-green-600">{successMessage}</p>}
    </div>
  );
}

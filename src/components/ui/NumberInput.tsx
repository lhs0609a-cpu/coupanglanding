'use client';

import { useState, useEffect } from 'react';

interface NumberInputProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  error?: string;
  id?: string;
  suffix?: string;
}

export default function NumberInput({
  label,
  value,
  onChange,
  placeholder = '0',
  error,
  id,
  suffix = '원',
}: NumberInputProps) {
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    if (value === 0) {
      setDisplayValue('');
    } else {
      setDisplayValue(value.toLocaleString('ko-KR'));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d]/g, '');
    if (raw === '') {
      onChange(0);
      setDisplayValue('');
    } else {
      const num = parseInt(raw, 10);
      onChange(num);
      setDisplayValue(num.toLocaleString('ko-KR'));
    }
  };

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          className={`w-full px-4 py-2.5 border rounded-lg outline-none transition text-sm pr-10 ${
            error
              ? 'border-red-300 focus:ring-2 focus:ring-red-500 focus:border-transparent'
              : 'border-gray-300 focus:ring-2 focus:ring-[#E31837] focus:border-transparent'
          }`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
          {suffix}
        </span>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';

interface SignaturePadProps {
  onSignatureChange: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
  disabled?: boolean;
}

export default function SignaturePad({
  onSignatureChange,
  width = 400,
  height = 200,
  disabled = false,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(width);

  // Responsive canvas width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        setCanvasWidth(Math.min(width, containerWidth));
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [width]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Scale for retina displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Set drawing style
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Clear and draw guide text
    drawGuide(ctx, canvasWidth, height);
  }, [canvasWidth, height]);

  const drawGuide = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    if (!hasDrawn) {
      ctx.save();
      ctx.fillStyle = '#d1d5db';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('여기에 서명해주세요', w / 2, h / 2 + 5);
      ctx.restore();
    }

    // Bottom guide line
    ctx.save();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(20, h - 40);
    ctx.lineTo(w - 20, h - 40);
    ctx.stroke();
    ctx.restore();

    // Restore drawing style
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
  };

  const getPosition = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    // Clear guide text on first draw
    if (!hasDrawn) {
      drawGuide(ctx, canvasWidth, height);
      // Redraw guide line but clear text
      ctx.clearRect(0, 0, canvasWidth, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasWidth, height);

      ctx.save();
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(20, height - 40);
      ctx.lineTo(canvasWidth - 20, height - 40);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([]);
    }

    const pos = getPosition(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const pos = getPosition(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  };

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if canvas has actual drawing content
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (hasDrawn) {
      onSignatureChange(canvas.toDataURL('image/png'));
    }
  }, [isDrawing, hasDrawn, onSignatureChange]);

  // Handle mouse leaving canvas
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDrawing) stopDrawing();
    };
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDrawing, stopDrawing]);

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    setHasDrawn(false);
    onSignatureChange(null);
    drawGuide(ctx, canvasWidth, height);
  };

  return (
    <div ref={containerRef} className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">자필 서명</span>
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled || !hasDrawn}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          지우기
        </button>
      </div>
      <div
        className={`border-2 rounded-xl overflow-hidden ${
          disabled
            ? 'border-gray-200 opacity-60 cursor-not-allowed'
            : 'border-gray-300 hover:border-gray-400 cursor-crosshair'
        }`}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="block touch-none"
        />
      </div>
      {!hasDrawn && (
        <p className="text-xs text-gray-400 mt-1.5">
          마우스 또는 터치로 서명을 그려주세요.
        </p>
      )}
    </div>
  );
}

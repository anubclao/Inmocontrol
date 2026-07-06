import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Trash2 } from 'lucide-react';

export interface SignaturePadRef {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string | null;
}

interface SignaturePadProps {
  onChange?: (isEmpty: boolean) => void;
  height?: number;
}

/**
 * Captura de firma manuscrita sobre canvas HTML5.
 * Soporta mouse, touch y stylus (Pointer Events).
 *
 * No usamos `react-signature-canvas` para mantener 0 dependencias nuevas.
 */
export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(function SignaturePad(
  { onChange, height = 180 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useImperativeHandle(ref, () => ({
    clear: () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      ctx?.clearRect(0, 0, c.width, c.height);
      setIsEmpty(true);
      onChange?.(true);
    },
    isEmpty: () => isEmpty,
    toDataURL: () => {
      if (isEmpty || !canvasRef.current) return null;
      return canvasRef.current.toDataURL('image/png');
    },
  }), [isEmpty, onChange]);

  // Ajusta el canvas al tamaño real del contenedor (HiDPI aware)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
    }
  }, []);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = getPoint(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !lastPoint.current) return;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
    if (isEmpty) {
      setIsEmpty(false);
      onChange?.(false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    lastPoint.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ height, touchAction: 'none' }}
        className="w-full bg-white border-2 border-dashed border-slate-300 rounded-lg cursor-crosshair"
      />
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-400 text-xs uppercase tracking-wider font-bold">
          Firma aquí
        </div>
      )}
      {!isEmpty && (
        <button
          type="button"
          onClick={() => {
            const c = canvasRef.current;
            if (!c) return;
            const ctx = c.getContext('2d');
            ctx?.clearRect(0, 0, c.width, c.height);
            setIsEmpty(true);
            onChange?.(true);
          }}
          className="absolute top-2 right-2 p-1.5 bg-white border border-slate-200 rounded-md text-slate-500 hover:text-red-600 hover:border-red-200"
          title="Limpiar firma"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
});

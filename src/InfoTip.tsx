/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Info } from 'lucide-react';

interface InfoTipProps {
  /** Texto explicativo que aparece al pasar el mouse. */
  text: string;
  /** Posición del globo respecto al icono. */
  side?: 'top' | 'bottom';
  /** Clases para el icono (color/tamaño). Útil sobre fondos oscuros. */
  className?: string;
}

/**
 * Tooltip ligero (solo CSS). Muestra un icono de información con un globo al
 * pasar el mouse. Usa un `group` con nombre (`group/tip`) para no chocar con
 * otros efectos de hover de las tarjetas.
 */
export default function InfoTip({ text, side = 'top', className = 'text-muted/60' }: InfoTipProps) {
  const pos = side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';
  return (
    <span className="relative inline-flex items-center group/tip align-middle">
      <Info className={`w-3.5 h-3.5 cursor-help ${className}`} />
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 left-1/2 -translate-x-1/2 ${pos} w-56 px-3 py-2 rounded-lg bg-forest text-white text-[11px] font-medium leading-snug text-left normal-case tracking-normal opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 shadow-xl`}
      >
        {text}
      </span>
    </span>
  );
}

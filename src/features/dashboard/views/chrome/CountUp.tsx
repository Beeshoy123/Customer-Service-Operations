// Number count-up for the KPI cards (frontend-design.md, section 6, part B).
// Shows the final number at once when the device asks for reduced motion or when
// there is no matchMedia (tests, old browsers). A new value while counting takes
// over from the number on screen (no jump), so quick filter changes just glide.
// Final text is always the same string the card showed before this component.
import React from 'react';

const DURATION_MS = 800;

const canAnimate = (): boolean =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && typeof window.requestAnimationFrame === 'function'
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface CountUpProps {
  value: number;
  /** Digits after the decimal point (default 0). */
  decimals?: number;
  /** Group thousands with toLocaleString (default false). */
  grouped?: boolean;
}

export const CountUp = React.memo(({ value, decimals = 0, grouped = false }: CountUpProps) => {
  const format = React.useCallback((n: number, final: boolean): string => {
    if (grouped) return final ? n.toLocaleString() : Math.round(n).toLocaleString();
    return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
  }, [decimals, grouped]);

  const [text, setText] = React.useState<string>(() => format(value, true));
  const target = React.useRef<number | null>(null);   // value we are counting towards
  const shown = React.useRef(0);                      // number on screen right now

  React.useLayoutEffect(() => {
    const now = performance.now();
    const prev = target.current;
    target.current = value;
    const from = prev === null ? 0 : shown.current;
    if (!canAnimate() || from === value) {
      shown.current = value;
      setText(format(value, true));
      return undefined;
    }
    shown.current = from;
    setText(format(from, false));
    let raf = 0;
    const step = (ts: number) => {
      const p = Math.min(Math.max((ts - now) / DURATION_MS, 0), 1);
      const eased = 1 - Math.pow(1 - p, 3);
      shown.current = p < 1 ? from + (value - from) * eased : value;
      setText(format(shown.current, p === 1));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, format]);

  return <>{text}</>;
});

import { useLayoutEffect, useRef, useState } from 'react';
import { Glass } from './Glass.js';

export interface GlassTab<K extends string> {
  key: K;
  label: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Segmented control where the glass *is* the selection indicator: it springs
 * to the chosen option and refracts a highlighted copy of the row, so the
 * selected label stays legible whatever sits under the lens.
 */
export function GlassTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly GlassTab<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [settled, setSettled] = useState(false);

  // The first measurement places the lens; only later moves should spring.
  useLayoutEffect(() => {
    if (rect && !settled) {
      const frame = requestAnimationFrame(() => setSettled(true));
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [rect, settled]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    const measure = () => {
      const active = row.querySelector<HTMLElement>(`[data-tab="${value}"]`);
      if (!active) return;
      setRect({ x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [value, tabs.length]);

  const lens = rect
    ? { width: rect.width, height: rect.height, radius: rect.height / 2 }
    : { width: 0, height: 0, radius: 0 };

  return (
    <Glass
      lens={lens}
      x={rect ? rect.x + rect.width / 2 : 0}
      y={rect ? rect.y + rect.height / 2 : 0}
      scale={10}
      className={`glass-tabs rounded-full border-2 border-hairline bg-white p-1 ${settled ? '' : 'glass--static'}`}
      refractionTarget={
        <div className="glass-tabs-highlight grid p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map((tab) => (
            <span key={tab.key} className="glass-tabs-option glass-tabs-option--lit">
              {tab.label}
            </span>
          ))}
        </div>
      }
    >
      <div
        ref={rowRef}
        role="tablist"
        aria-label={label}
        className="grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
      >
        {tabs.map((tab) => {
          const selected = tab.key === value;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              data-tab={tab.key}
              aria-selected={selected}
              className={`glass-tabs-option ${selected ? 'text-navy' : 'text-muted hover:text-navy'}`}
              onClick={() => onChange(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </Glass>
  );
}

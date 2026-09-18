import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { generateLensMap, type LensShape } from '../lib/glass.js';

export interface Lens {
  width: number;
  height: number;
  radius: number;
}

export interface GlassProps {
  lens: Lens;
  /** Lens centre, in px from the container's top-left. */
  x: number;
  y: number;
  /** Peak displacement in px. Switch-like highlights take ~24, readable fills ~8. */
  scale?: number;
  /**
   * What the lens bends. Defaults to the children themselves; pass a
   * highlighted copy when the content under the glass should stay legible.
   */
  refractionTarget?: ReactNode;
  className?: string;
  children: ReactNode;
}

const CURVATURE_RATIO = 0.45;
const SPLAY = 1.6;

function useSize<T extends HTMLElement>(ref: React.RefObject<T>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => setSize({ width: element.offsetWidth, height: element.offsetHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * Cross-browser glass, after Aave: a rounded lens that refracts the live DOM
 * beneath it with a single `feDisplacementMap`, driven by a map generated from
 * the lens shape. The map is rebuilt only when the shape changes; moving the
 * lens is a transform, so travel stays cheap and the rim slides with it.
 */
export function Glass({ lens, x, y, scale = 16, refractionTarget, className = '', children }: GlassProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const container = useSize(containerRef);
  const baseId = useId().replace(/:/g, '');
  const [generation, setGeneration] = useState(0);

  const shape = useMemo<LensShape>(
    () => ({
      width: lens.width,
      height: lens.height,
      radius: lens.radius,
      curvature: Math.min(lens.width, lens.height) * CURVATURE_RATIO,
      splay: SPLAY,
    }),
    [lens.width, lens.height, lens.radius],
  );
  const [map, setMap] = useState<string | null>(null);
  useEffect(() => {
    try {
      setMap(generateLensMap(shape));
    } catch {
      setMap(null);
    }
  }, [shape]);

  // Safari caches filter output by id: a fresh id per map forces a re-read.
  useEffect(() => setGeneration((value) => value + 1), [map]);
  const filterId = `${baseId}-glass-${generation}`;

  const left = x - lens.width / 2;
  const top = y - lens.height / 2;
  const lensStyle: CSSProperties = {
    width: lens.width,
    height: lens.height,
    borderRadius: lens.radius,
    transform: `translate(${left}px, ${top}px)`,
  };
  const innerStyle: CSSProperties = {
    width: container.width,
    height: container.height,
    transform: `translate(${-left}px, ${-top}px)`,
    filter: map ? `url(#${filterId})` : undefined,
  };

  return (
    <div ref={containerRef} className={`glass relative ${className}`.trim()}>
      {children}
      <div aria-hidden className="glass-lens pointer-events-none absolute left-0 top-0 overflow-hidden" style={lensStyle}>
        <div className="glass-refraction absolute left-0 top-0" style={innerStyle}>
          {refractionTarget ?? children}
        </div>
      </div>
      {map ? (
        <svg aria-hidden className="absolute h-0 w-0" focusable="false">
          <filter
            id={filterId}
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            x={left}
            y={top}
            width={lens.width}
            height={lens.height}
            colorInterpolationFilters="sRGB"
          >
            <feImage
              href={map}
              x={left}
              y={top}
              width={lens.width}
              height={lens.height}
              preserveAspectRatio="none"
              result="map"
            />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      ) : null}
    </div>
  );
}

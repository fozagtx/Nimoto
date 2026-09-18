import { useEffect, useRef, useState } from 'react';

function cssMs(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Drives the transitions.dev text swap: the rendered label trails the incoming
 * one by one exit phase, so the old words leave before the new ones arrive.
 */
export function useTextSwap(label: string): {
  ref: React.RefObject<HTMLSpanElement>;
  label: string;
} {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(label);

  useEffect(() => {
    const element = ref.current;
    if (!element || shown === label) return undefined;

    const duration = cssMs('--text-swap-dur', 150);
    element.classList.add('is-exit');

    const timer = window.setTimeout(() => {
      setShown(label);
      element.classList.remove('is-exit');
      element.classList.add('is-enter-start');
      void element.offsetWidth; // force reflow so the entrance animates
      element.classList.remove('is-enter-start');
    }, duration);

    return () => window.clearTimeout(timer);
  }, [label, shown]);

  return { ref, label: shown };
}

/** Plays the staggered entrance once the element is mounted. */
export function useTextsReveal<T extends HTMLElement>(): React.RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const frame = window.requestAnimationFrame(() => element.classList.add('is-shown'));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return ref;
}

/**
 * Shakes the wrapped element whenever `error` changes to a new message, and
 * holds the error treatment long enough to read it.
 */
export function useErrorShake(error: string | null): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !error) return undefined;

    const shakeMs = cssMs('--shake-dur-a', 80) * 2 + cssMs('--shake-dur-b', 60) * 2;
    element.classList.add('is-error');
    element.classList.remove('is-shaking');
    void element.offsetWidth; // force reflow so the shake replays
    element.classList.add('is-shaking');

    const timer = window.setTimeout(() => element.classList.remove('is-shaking'), shakeMs + 20);
    return () => window.clearTimeout(timer);
  }, [error]);

  return ref;
}

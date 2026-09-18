import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-owl text-white border-owl shadow-lip-owl hover:bg-[#61d904] active:shadow-none',
  secondary: 'bg-macaw text-white border-macaw shadow-lip-macaw hover:bg-[#2fb9f8] active:shadow-none',
  ghost: 'bg-white text-navy border-hairline shadow-card hover:bg-[#f7f7f7] active:shadow-none',
  danger: 'bg-cardinal text-white border-cardinal shadow-lip-cardinal hover:bg-[#ff5f5f] active:shadow-none',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  full?: boolean;
  /** Inside a `.surface`: tighter corner so it stays concentric with the card. */
  nested?: boolean;
  children: ReactNode;
}

/**
 * Tactile button: flat bottom lip that disappears on press, never a blurred
 * shadow. Hover recolours instantly; only the press travels.
 */
export function Button({ variant = 'primary', full = false, nested = false, className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={[
        'inline-flex min-h-[48px] items-center justify-center gap-2 border-2 px-5 py-3',
        nested ? 'rounded-nested' : 'rounded-xl',
        'font-display text-sm font-extrabold uppercase tracking-cta transition-[transform,box-shadow] duration-100',
        'active:translate-y-[4px] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0',
        VARIANTS[variant],
        full ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}

import type { Config } from 'tailwindcss';

/**
 * Tactile, high-contrast play surface: white canvas, one dominant green,
 * flat "lip" shadows instead of diffuse ones, and generous rounding.
 */
export default {
  content: ['./index.html', './src/web/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        owl: { DEFAULT: '#58cc02', pressed: '#58a700', soft: '#d7ffb8' },
        navy: '#042c60',
        ink: '#3c3c3c',
        muted: '#777777',
        macaw: { DEFAULT: '#1cb0f6', soft: '#ddf4ff' },
        cardinal: { DEFAULT: '#ff4b4b', soft: '#ffdfe0' },
        fox: '#ff9600',
        bee: '#ffc800',
        beetle: '#ce82ff',
        hairline: '#e5e5e5',
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
      },
      boxShadow: {
        lip: '0 4px 0 0 rgba(0, 0, 0, 0.12)',
        'lip-owl': '0 4px 0 0 #58a700',
        'lip-macaw': '0 4px 0 0 #1899d6',
        'lip-cardinal': '0 4px 0 0 #ea2b2b',
        card: '0 2px 0 0 #e5e5e5',
      },
      letterSpacing: {
        cta: '0.8px',
      },
      fontFamily: {
        display: ['"Nunito"', '"Baloo 2"', 'system-ui', 'sans-serif'],
        body: ['"Nunito"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(0.92)' },
          '60%': { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        pop: 'pop 220ms ease-out',
        float: 'float 3.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;

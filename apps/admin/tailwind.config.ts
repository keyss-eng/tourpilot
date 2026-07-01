import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0b10',
        surface: '#13151d',
        'surface-2': '#191c26',
        border: '#262a37',
        muted: '#8a92a6',
        text: '#eef1f7',
        primary: '#7c83ff',
        'primary-dark': '#5b62e8',
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#f87171',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.1rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.5)',
        glow: '0 0 0 1px rgba(124,131,255,0.4), 0 8px 30px -8px rgba(124,131,255,0.35)',
      },
      backgroundImage: {
        'grid-fade': 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(124,131,255,0.12), transparent)',
      },
    },
  },
  plugins: [],
};

export default config;

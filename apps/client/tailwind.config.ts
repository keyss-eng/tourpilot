import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dbe7ff', 200: '#b8ceff', 300: '#8aacff',
          400: '#5d86ff', 500: '#3b6fa0', 600: '#1e3a5f', 700: '#172d4a',
          800: '#0f1f37', 900: '#0a1628', 950: '#060d1a',
        },
        // Theme-aware neutrals — driven by CSS variables (see globals.css).
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        primary: '#3b82f6',
        'primary-dark': '#2563eb',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.3), 0 8px 24px -12px rgba(15,23,42,0.5)',
        glow: '0 0 0 1px rgba(59,130,246,0.35), 0 8px 24px -8px rgba(59,130,246,0.35)',
      },
      backgroundImage: {
        'grid-fade': 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.12), transparent)',
      },
    },
  },
  plugins: [],
};

export default config;

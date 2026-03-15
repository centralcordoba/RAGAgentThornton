import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // GT brand
        brand: {
          50: '#e8edf4',
          100: '#c5d1e3',
          200: '#9fb3d0',
          300: '#7995bd',
          400: '#5c7eaf',
          500: '#3f67a1',
          600: '#375a8e',
          700: '#2d4a76',
          800: '#1E3A5F', // Primary
          900: '#0f2540',
        },
        // Risk semaphore
        risk: {
          low: '#10b981',     // green
          medium: '#f59e0b',  // amber
          high: '#dc2626',    // red
          critical: '#7c2d12',
        },
        // Status
        status: {
          pending: '#f59e0b',
          'in-progress': '#3b82f6',
          completed: '#10b981',
          overdue: '#dc2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;

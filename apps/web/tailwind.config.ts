import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // GT brand — sourced from grantthornton.com
        brand: {
          50: '#f3eff8',
          100: '#e0d5ed',
          200: '#c5ade0',
          300: '#a06dff',
          400: '#8b5cf6',
          500: '#6b3fa0',
          600: '#5a3590',
          700: '#4F2D7F', // Primary (GT violet)
          800: '#3d2266',
          900: '#2a1748',
        },
        teal: {
          500: '#008D8F', // GT teal accent
          600: '#007577',
        },
        accent: {
          red: '#CE2C2C',  // GT CTA red
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

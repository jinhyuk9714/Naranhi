import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx,html}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        naranhi: {
          50: '#f0f7ff',
          100: '#dfeeff',
          200: '#b8ddff',
          300: '#79c2ff',
          400: '#32a3ff',
          500: '#0084f4',
          600: '#0068d1',
          700: '#0052a9',
          800: '#00458b',
          900: '#063b73',
          950: '#04254c',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

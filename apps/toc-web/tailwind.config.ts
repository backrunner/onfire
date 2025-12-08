import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,jsx,js}',
    '../../packages/ui/src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(240 5.9% 90%)',
        input: 'hsl(240 5.9% 90%)',
        ring: 'hsl(240 5% 65%)',
        background: 'hsl(0 0% 100%)',
        foreground: 'hsl(240 10% 3.9%)'
      }
    }
  },
  plugins: []
};

export default config;


import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../workers/tob-worker/public',
    emptyOutDir: true
  },
  server: {
    port: 4173,
    proxy: {
      '/api/tob': {
        target: 'http://localhost:8788',
        changeOrigin: true
      }
    }
  }
});

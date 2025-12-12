import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../workers/toc-worker/public',
    emptyOutDir: true
  },
  server: {
    port: 4174,
    proxy: {
      '/api/toc': {
        target: 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
});

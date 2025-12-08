import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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

import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import devServer from '@hono/vite-dev-server';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    cloudflare({ configPath: './wrangler.toml' }),
    devServer({ entry: 'src/index.tsx' }),
    react(),
  ],
  build: {
    rollupOptions: {
      input: {
        client: 'src/client.tsx',
      },
      output: {
        entryFileNames: 'static/[name].js',
        chunkFileNames: 'static/[name].[hash].js',
        assetFileNames: 'static/[name].[hash].[ext]',
      },
    },
  },
  ssr: {
    external: ['react', 'react-dom'],
  },
});

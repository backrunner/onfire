import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import devServer from '@hono/vite-dev-server';
import { cloudflare } from '@cloudflare/vite-plugin';
import { resolve } from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [
    // Cloudflare Workers Vite 插件
    cloudflare({
      configPath: './wrangler.toml',
      persistState: true,
    }),
    // Hono 开发服务器
    devServer({
      entry: 'src/index.tsx',
      exclude: [
        /^\/@.+$/,
        /^\/src\/.+/,
        /^\/node_modules\/.*/,
        /^\/static\/.*/,
        /^\/assets\/.*/,
      ],
    }),
    // React 插件
    react(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@onfire/shared': resolve(__dirname, '../../packages/shared/src'),
      '@onfire/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        client: resolve(__dirname, 'src/client.tsx'),
      },
      output: {
        entryFileNames: 'static/[name].[hash].js',
        chunkFileNames: 'static/[name].[hash].js',
        assetFileNames: 'static/[name].[hash].[ext]',
      },
    },
  },
  ssr: {
    external: ['react', 'react-dom', 'better-auth'],
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
}));

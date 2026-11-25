import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      test: {
        globals: true,
        environment: 'jsdom',
        include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:5001',
            changeOrigin: true,
          },
          '/auth': {
            target: 'http://localhost:5001',
            changeOrigin: true,
          },
          '/user': {
            target: 'http://localhost:5001',
            changeOrigin: true,
          },
          '/records': {
            target: 'http://localhost:5001',
            changeOrigin: true,
          },
          '/shifts': {
            target: 'http://localhost:5001',
            changeOrigin: true,
          },
          '/shift': {
            target: 'http://localhost:5001',
            changeOrigin: true,
          },
          '/health': {
            target: 'http://localhost:5001',
            changeOrigin: true,
          },
        },
      },
      plugins: [react()],
      define: {
        // Expose GEMINI_API_KEY to both process.env and import.meta.env
        // so readEnv() finds it regardless of which path it checks first.
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        // Also expose as VITE_ prefixed so import.meta.env works in browser
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

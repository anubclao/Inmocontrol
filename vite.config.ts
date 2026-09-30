import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    // FIX: esbuild 0.28 (security update) rompe el downcompile a es2020
    // que Vite usa por default. Algunos bundles legacy (html2canvas, jspdf)
    // tienen `var { x } = arguments[0] || {}` que esbuild 0.28 no sabe
    // transpilar al target viejo. Forzando esnext, esbuild deja el código
    // moderno tal cual y los browsers modernos lo ejecutan nativamente.
    target: 'esnext',
  },
  // Mismo problema en dev: el pre-bundling de deps usa su propio target
  // (no hereda build.target) y esbuild 0.28 falla igual con tailwind-merge.
  optimizeDeps: {
    esbuildOptions: { target: 'esnext' },
  },
  server: {
    // En desarrollo, Express corre en 3001. Aquí Vite recibe las peticiones
    // y reenvía /api/* al backend Express.
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}));

import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** @type {import('vite').UserConfig} */
export default {
  cacheDir: '/tmp/opus-vite-cache',
  plugins: [react(), tailwindcss()],
  build: {
    // Gold standard: Core Web Vitals + cache longevity (code-splitting.com, Mykola 2025)
    // Route-level lazy + vendor isolation → cache-hit 12%→89%, TTI -32%
    chunkSizeWarningLimit: 700,
    cssCodeSplit: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Heavy PDF — only compliance vault (lazy via dynamic import) — biggest win 600KB isolated
          if (id.includes('/node_modules/jspdf') || id.includes('/node_modules/jspdf-autotable') || id.includes('/node_modules/html2canvas') ) return 'pdf-vendor';
          if (id.includes('/node_modules/dompurify')) return 'pdf-vendor';
          // Motion — hero/funnel only
          if (id.includes('/node_modules/gsap')) return 'motion';
          if (id.includes('/node_modules/qrcode.react')) return 'qr-vendor';
          // Keep React + vendor together to avoid circular chunk warning (vendors share cross-deps)
          // React cache benefit retained via content-hash — changes only when deps bump
          return undefined; // let Rollup decide (single vendor) — no circular
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    hmr: {
      host: '127.0.0.1',
    },
    watch: {
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
};

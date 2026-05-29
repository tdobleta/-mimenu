import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'mimenú POS',
        short_name: 'mimenú',
        description: 'Sistema de gestión para restaurantes',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0D1117',
        theme_color: '#1D9E75',
        orientation: 'landscape',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/public\/cocina/],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i, handler: 'CacheFirst', options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 31536000 } } },
          { urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i, handler: 'CacheFirst', options: { cacheName: 'gstatic-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 31536000 } } },
          { urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i, handler: 'CacheFirst', options: { cacheName: 'menu-images-cache', expiration: { maxEntries: 200, maxAgeSeconds: 604800 } } },
          { urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i, handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i, handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (!normalized.includes('/node_modules/')) return undefined;
          if (normalized.includes('/node_modules/@sentry/')) return 'vendor-sentry';
          if (
            normalized.includes('/node_modules/react/') ||
            normalized.includes('/node_modules/react-dom/') ||
            normalized.includes('/node_modules/react-router-dom/')
          ) return 'vendor-react';
          if (normalized.includes('/node_modules/@supabase/')) return 'vendor-supabase';
          if (normalized.includes('/node_modules/@tanstack/')) return 'vendor-query';
          if (normalized.includes('/node_modules/recharts/') || normalized.includes('/node_modules/d3-')) return 'vendor-charts';
          if (
            normalized.includes('/node_modules/@radix-ui/') ||
            normalized.includes('/node_modules/lucide-react/') ||
            normalized.includes('/node_modules/framer-motion/') ||
            normalized.includes('/node_modules/sonner/') ||
            normalized.includes('/node_modules/cmdk/') ||
            normalized.includes('/node_modules/vaul/')
          ) return 'vendor-ui';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173 },
});

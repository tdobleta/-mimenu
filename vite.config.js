import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'mimenú POS',
        short_name: 'mimenú',
        description: 'Sistema de gestión para restaurantes',
        start_url: '/',
        display: 'standalone',
        background_color: '#0D1117',
        theme_color: '#1D9E75',
        orientation: 'landscape',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
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
  server: { port: 5173 },
});

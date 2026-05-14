import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'sw-custom.js'],
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
          // Inyectar variables de entorno en el SW para Background Sync
          additionalManifestEntries: [],
          importScripts: ['/sw-custom.js'],
          // Reemplazar placeholders en sw-custom.js con las URLs reales
          define: {
            'self.__WB_MANIFEST_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
            'self.__WB_MANIFEST_SUPABASE_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
          },
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
  };
});

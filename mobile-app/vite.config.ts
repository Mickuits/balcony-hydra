// Vite config — mode PWA (déployable sur serveur, code-split par chunk)
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

// Build ID = timestamp ISO + git short SHA (si dispo)
function getBuildId(): string {
  const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const sha = process.env['GITHUB_SHA']?.slice(0, 7) ?? process.env['BUILD_SHA']?.slice(0, 7) ?? 'dev';
  return `${ts}-${sha}`;
}

const BUILD_ID = getBuildId();

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  },
  define: {
    '__BUILD__': JSON.stringify(BUILD_ID)
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        // Asset versioning via hash : [name]-[hash].ext (déjà default Vite)
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: {
          mqtt: ['mqtt']
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: false,
    host: true  // expose sur LAN
  },
  preview: {
    port: 4173,
    host: true
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      strategies: 'generateSW',
      manifest: false,
      includeAssets: ['icons/*.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'hydra-fonts',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365, maxEntries: 30 }
            }
          },
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'hydra-runtime-api',
              networkTimeoutSeconds: 4,
              expiration: { maxAgeSeconds: 60 * 60, maxEntries: 50 }
            }
          }
        ]
      },
      devOptions: {
        enabled: false  // pas de SW en dev (HMR conflict)
      }
    })
  ]
});

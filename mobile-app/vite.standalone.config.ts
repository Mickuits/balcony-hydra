// Vite config — mode single-file (inline CSS + JS dans HTML pour usage file:// ou PROGMEM firmware)
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';

function getBuildId(): string {
  const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const sha = process.env['GITHUB_SHA']?.slice(0, 7) ?? process.env['BUILD_SHA']?.slice(0, 7) ?? 'dev';
  return `${ts}-${sha}-standalone`;
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
    outDir: '../dist-standalone',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 1_000_000,  // force inline de tout
    rollupOptions: {
      output: {
        // Inline tout en un seul chunk
        inlineDynamicImports: true
      }
    }
  },
  plugins: [viteSingleFile()]
});

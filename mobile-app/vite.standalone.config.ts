// Vite config — mode single-file (inline CSS + JS dans HTML pour usage file:// ou PROGMEM firmware)
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
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

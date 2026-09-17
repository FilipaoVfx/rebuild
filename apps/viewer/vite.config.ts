import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base` relativa a propósito: el mismo build se sirve en `/` (montado por la
// API) y en `/rebuild/` (GitHub Pages). Una base absoluta rompería uno de los dos.
//
// Sin CDN en tiempo de ejecución: MapLibre y deck.gl entran al bundle desde npm
// en tiempo de construcción, así que el sitio publicado no carga ningún script
// de terceros. Es la misma garantía que daba `vendor/`, sin 2,9 MB versionados.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },

  // `npm run dev` sirve el visor y delega la API al backend local, así que el
  // modo en vivo se puede desarrollar con recarga en caliente.
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8099', changeOrigin: true },
    },
  },
});

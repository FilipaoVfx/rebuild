import { defineConfig } from 'vite';

// Base relativa: la película se sirve junto al paquete estático del visor
// (`../data`), sin CDN ni rutas absolutas.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});

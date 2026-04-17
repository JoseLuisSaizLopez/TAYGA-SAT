import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [
    react(),
    cesium()
  ],
  base: '/TAYGA-SAT/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    sourcemap: false,
    chunkSizeWarningLimit: 5000
  },
  optimizeDeps: {
    include: ['satellite.js']
  }
});

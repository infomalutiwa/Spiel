import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: '../../client/public',
  server: { port: 5174 },
  build: { chunkSizeWarningLimit: 1500 },
});

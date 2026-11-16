import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true, port: 5173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200, rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } } },
});

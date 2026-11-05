import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, /api y /uploads se reenvían al backend (mismo origen => la cookie de sesión funciona).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
});

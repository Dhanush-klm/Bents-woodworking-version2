import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      '@': '/src',
      '@radix-ui/react-select': path.resolve(__dirname, 'node_modules/@radix-ui/react-select'),
    },
  },
});

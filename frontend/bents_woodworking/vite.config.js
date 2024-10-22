import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'], // Add deduplication
  },
  optimizeDeps: {
    include: [
      '@radix-ui/react-select',
      '@radix-ui/react-slot',
      'class-variance-authority',
      'clsx',
      'tailwind-merge'
    ]
  },
  build: {
    rollupOptions: {
      external: [
        'react',
        'react-dom',
      ],
      output: {
        manualChunks: {
          'radix': ['@radix-ui/react-select', '@radix-ui/react-slot'],
          'utils': ['class-variance-authority', 'clsx', 'tailwind-merge']
        }
      }
    }
  },
  server: {
    port: 5173
  }
});

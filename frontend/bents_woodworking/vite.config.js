import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from "path"

const aliases = {
  '@': 'src',
  'components': 'src/components',
  'lib': 'src/lib',
  'pages': 'src/pages',
  'styles': 'src/styles',
  'utils': 'src/utils',
  // Add any other directories you have in src/
};

const resolvedAliases = Object.fromEntries(
  Object.entries(aliases).map(([key, value]) => [key, resolve(__dirname, value)])
);

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      external: [
        "react",
        "react-dom",
      ],
      output: {
        manualChunks: {
          'radix': [
            '@radix-ui/react-select',
            '@radix-ui/react-slot',
          ],
          'vendor': [
            'lucide-react',
            'class-variance-authority',
            'clsx',
            'tailwind-merge'
          ]
        }
      }
    },
    commonjsOptions: {
      include: [/node_modules/],
      extensions: ['.js', '.cjs'],
    }
  },
  resolve: {
    alias: {
      ...resolvedAliases
    },
  },
  optimizeDeps: {
    include: [
      '@radix-ui/react-select',
      '@radix-ui/react-slot',
      'lucide-react',
      'class-variance-authority',
      'clsx',
      'tailwind-merge'
    ],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  server: {
    port: 5173
  }
})

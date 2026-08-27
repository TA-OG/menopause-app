import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  // tsconfig.json sets `jsx: preserve` for Next's own compiler, which leaves
  // esbuild emitting classic React.createElement calls with React not in
  // scope — so any test that renders a component dies with "React is not
  // defined". The automatic runtime imports react/jsx-runtime itself.
  // Vitest-only: Next does not read this file.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})

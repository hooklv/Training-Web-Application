import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // The model runs inside a worker, so Vite would only discover this dependency
  // once the user reaches step 3 - and force a page reload that throws their
  // photo away. Pre-bundle it when the dev server starts instead.
  optimizeDeps: { include: ['@huggingface/transformers'] },
  build: { target: 'esnext' },
  worker: { format: 'es' },
  server: { host: true },
});

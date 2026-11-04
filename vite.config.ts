import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so it works under any GitHub Pages subpath (user.github.io/repo/)
  base: './',
  server: { port: 5178, open: false },
  // @huggingface/transformers ships large wasm; keep it out of pre-bundle noise
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
});

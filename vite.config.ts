import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths so the build runs anywhere, including GitHub Pages
  // project sites served under /B-spec/
  base: './',
});

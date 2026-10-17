import { defineConfig } from 'vite';

// `npm run build` writes the finished game to the dist/ folder.
// Use `npm run preview` to play that build locally.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 3000 },
});

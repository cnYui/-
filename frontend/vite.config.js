import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'src',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/xhs-images': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        spark: resolve(__dirname, 'src/pages/mobile/spark.html'),
        notes: resolve(__dirname, 'src/pages/mobile/notes.html'),
        profile: resolve(__dirname, 'src/pages/mobile/profile.html'),
        localMemories: resolve(__dirname, 'src/pages/mobile/local-memories.html'),
        noteDetail: resolve(__dirname, 'src/pages/mobile/note-detail.html'),
        postDetail: resolve(__dirname, 'src/pages/mobile/post-detail.html')
      }
    }
  }
})

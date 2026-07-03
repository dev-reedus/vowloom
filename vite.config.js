import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // during `npm run dev`, proxy API calls to the Node server (npm start)
    proxy: {
      '/api': 'http://localhost:80',
    },
  },
})

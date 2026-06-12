import { defineConfig } from 'vite'

export default defineConfig({
  // host: true espone il dev server sulla rete locale (per giocare in LAN)
  server: {
    host: true,
    port: 5173,
  },
})

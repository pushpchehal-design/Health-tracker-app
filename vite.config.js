import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = env.VITE_SUPABASE_URL || ''

  return {
    plugins: [react()],
    server: {
      proxy: supabaseUrl
        ? {
            // Proxy Edge Function to avoid CORS in local dev (browser → localhost → Vite → Supabase)
            '/supabase-functions': {
              target: supabaseUrl,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/supabase-functions/, ''),
            },
          }
        : {},
    },
  }
})

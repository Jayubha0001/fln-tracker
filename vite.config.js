import react from '@vitejs/plugin-react'
import { loadEnv, defineConfig } from 'vite'

// https://vite.dev/config/
function isServiceRoleKey(value) {
  if (value.startsWith('sb_secret_')) return true
  const payload = value.split('.')[1]
  if (!payload) return false
  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8')
    return /"role"\s*:\s*"service_role"/i.test(decoded)
  } catch {
    return false
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
  if (isServiceRoleKey(key)) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be a public Publishable key, never a Supabase secret or service_role key.')
  }
  if (Object.entries(env).some(([name, value]) => /^VITE_.*(SECRET|SERVICE_ROLE|PRIVATE_KEY)/i.test(name) && value)) {
    throw new Error('Do not expose Supabase secret/service-role keys through VITE_ environment variables.')
  }
  return {
    plugins: [react()],
  }
})

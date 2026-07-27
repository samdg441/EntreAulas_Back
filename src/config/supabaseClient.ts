import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl: string | undefined = process.env.SUPABASE_URL
const supabaseServiceRoleKey: string | undefined = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('Falta la variable de entorno SUPABASE_URL')
}

if (!supabaseServiceRoleKey) {
  throw new Error('Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY')
}

export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})



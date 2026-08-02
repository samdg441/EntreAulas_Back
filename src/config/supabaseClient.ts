/**
 * Cliente Supabase unificado.
 * Reexporta el cliente canónico definido en supabase-only.ts
 * para evitar dos instancias con service-role.
 */
export { supabaseAdmin, SupabaseDB, default } from './supabase-only'

import { supabaseAdmin, SupabaseDB } from '../../config/supabase-only'
import { one } from '../../shared/supabase-result'

/** Acceso a datos de autenticación / usuarios (aislado de HTTP). */
export class AuthRepository {
  findUserByEmail(email: string) {
    return SupabaseDB.findUserByEmail(email)
  }

  findUserById(id: string) {
    return SupabaseDB.findUserById(id)
  }

  createUserWithType(userData: Parameters<typeof SupabaseDB.createUserWithType>[0]) {
    return SupabaseDB.createUserWithType(userData)
  }

  updateUser(id: string, updates: Record<string, unknown>) {
    return SupabaseDB.updateUser(id, updates)
  }

  countUsers() {
    return SupabaseDB.countUsers()
  }

  async findActiveByEmail(email: string, columns = 'id, email, nombre, apellido') {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .select(columns)
      .eq('email', email)
      .eq('activo', true)
      .single()
    return one(data, error)
  }

  async insertResetToken(row: { email: string; token: string; expires_at: string; used: boolean }) {
    const { error } = await supabaseAdmin.from('password_reset_tokens').insert(row)
    if (error) throw error
  }

  async findUnusedResetToken(token: string, email: string) {
    const { data, error } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('*')
      .eq('token', token)
      .eq('email', email)
      .eq('used', false)
      .single()
    return one(data, error)
  }

  async markResetTokenUsed(id: string) {
    const { error } = await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('id', id)
    return error
  }
}

export const authRepository = new AuthRepository()

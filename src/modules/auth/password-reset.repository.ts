import { supabaseAdmin } from '../../config/supabaseClient'

export interface PasswordResetTokenRow {
  id: string
  email: string
  token: string
  expires_at: string
  used: boolean
  created_at: string
}

export interface ActiveUserRow {
  id: string
  email: string
  nombre: string
  apellido: string
  activo: boolean
}

/** Acceso a datos de tokens de recuperación y usuarios (aislado de HTTP). */
export class PasswordResetRepository {
  async findActiveUserByEmail(email: string): Promise<ActiveUserRow | null> {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .select('id, email, nombre, apellido, activo')
      .ilike('email', email)
      .eq('activo', true)
      .maybeSingle()

    if (error) throw error
    return data
  }

  async invalidateUnusedTokens(email: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used: true, updated_at: new Date().toISOString() })
      .eq('email', email)
      .eq('used', false)

    if (error) throw error
  }

  async insertToken(input: {
    email: string
    token: string
    expiresAt: string
  }): Promise<void> {
    const { error } = await supabaseAdmin.from('password_reset_tokens').insert({
      email: input.email,
      token: input.token,
      expires_at: input.expiresAt,
      used: false,
    })

    if (error) throw error
  }

  async findUnusedToken(
    tokenHash: string,
    email: string
  ): Promise<PasswordResetTokenRow | null> {
    const { data, error } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('*')
      .eq('token', tokenHash)
      .eq('email', email)
      .eq('used', false)
      .maybeSingle()

    if (error) throw error
    return data
  }

  async markTokenUsed(tokenId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used: true, updated_at: new Date().toISOString() })
      .eq('id', tokenId)

    if (error) throw error
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('usuarios')
      .update({
        password: hashedPassword,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (error) throw error
  }
}

export const passwordResetRepository = new PasswordResetRepository()

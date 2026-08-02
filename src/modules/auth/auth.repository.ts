import { SupabaseDB } from '../../config/supabase-only'

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
}

export const authRepository = new AuthRepository()

import bcrypt from 'bcrypt'

/** Coste de bcrypt (10–12 recomendado; más alto = más seguro y más lento). */
export function getBcryptSaltRounds(): number {
  const n = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10)
  if (Number.isNaN(n) || n < 10) return 12
  if (n > 14) return 14
  return n
}

export function isBcryptHash(stored: string | null | undefined): boolean {
  if (!stored || typeof stored !== 'string') return false
  return /^\$2[aby]\$\d{2}\$/.test(stored)
}

/**
 * Solo para migración local/desarrollo. En producción debe estar en false (por defecto).
 */
export function allowLegacyPlaintextLogin(): boolean {
  return process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN === 'true'
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, getBcryptSaltRounds())
}

export type VerifyPasswordResult =
  | { ok: false }
  | { ok: true; migratePlaintextToHash?: string }

/**
 * Verifica contraseña contra el valor almacenado en BD.
 * - Por defecto solo acepta hashes bcrypt.
 * - Si ALLOW_LEGACY_PLAINTEXT_LOGIN=true y el hash guardado no es bcrypt pero coincide en texto plano,
 *   devuelve migratePlaintextToHash para que el caller actualice la BD (una sola vez).
 */
export async function verifyStoredPassword(
  plain: string,
  stored: string | null | undefined
): Promise<VerifyPasswordResult> {
  if (!stored) {
    return { ok: false }
  }

  if (isBcryptHash(stored)) {
    const match = await bcrypt.compare(plain, stored)
    return match ? { ok: true } : { ok: false }
  }

  if (allowLegacyPlaintextLogin() && plain === stored) {
    return { ok: true, migratePlaintextToHash: plain }
  }

  return { ok: false }
}

/**
 * Política única de contraseña para el alta (create-user / register) y la recuperación (reset-password).
 * Devuelve el primer incumplimiento o null si la contraseña es válida (DEF-45).
 */
export function validarPoliticaDeClave(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres'
  }
  if (!/[A-Z]/.test(password)) {
    return 'La contraseña debe contener al menos una letra mayúscula'
  }
  if (!/[a-z]/.test(password)) {
    return 'La contraseña debe contener al menos una letra minúscula'
  }
  if (!/\d/.test(password)) {
    return 'La contraseña debe contener al menos un número'
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'La contraseña debe contener al menos un carácter especial'
  }
  return null
}

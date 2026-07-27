import bcrypt from 'bcrypt'

/** Coste de bcrypt (10–12 recomendado; más alto = más seguro y más lento). */
export function getBcryptSaltRounds(): number {
  const n = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10)
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

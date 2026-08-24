/**
 * Reemplazo de `middleware/auth` para pruebas: inyecta el usuario definido con
 * `setTestUser()` y deja pasar la comprobación de rol, de modo que la prueba
 * ejercite la autorización que hace el propio handler.
 *
 * Uso: vi.mock('../../middleware/auth', () => import('../helpers/auth-mock'))
 */
export const authenticateToken = (
  req: { user?: unknown },
  _res: unknown,
  next: () => void
) => {
  req.user = (globalThis as { __testUser?: unknown }).__testUser
  next()
}

export const requireRole =
  () => (_req: unknown, _res: unknown, next: () => void) =>
    next()

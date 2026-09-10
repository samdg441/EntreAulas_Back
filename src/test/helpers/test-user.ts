/** Define el usuario que `helpers/auth-mock` inyectará en req.user. */
export function setTestUser(user: unknown) {
  ;(globalThis as { __testUser?: unknown }).__testUser = user
}

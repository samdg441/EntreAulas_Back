/** Error de dominio con código HTTP para el flujo de recuperación de contraseña. */
export class PasswordResetError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'PasswordResetError'
  }
}

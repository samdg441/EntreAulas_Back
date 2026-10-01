/**
 * Decide si hay un canal de correo configurado.
 * Brevo (API HTTPS) tiene prioridad sobre SMTP: no depende de puertos SMTP,
 * que algunas redes y el plan gratuito de Render bloquean.
 */
export function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.SMTP_FROM)
}

export function mailConfigured(opciones: { smtpAuth: boolean }): boolean {
  if (brevoConfigured()) return true
  const smtpBase = Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM)
  if (!opciones.smtpAuth) return smtpBase
  return smtpBase && Boolean(process.env.SMTP_USER && process.env.SMTP_PASS)
}

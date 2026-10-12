import { expect } from 'vitest'
import { z } from 'zod'

/**
 * Contrato HTTP de /api/auth/* (RQ1, RQ2, RQ3.1, RQ3.4, RQ5).
 *
 * Todos los esquemas son `.strict()`: una clave que aparece sin estar declarada (p. ej. `password`, `token`)
 * o una clave declarada que desaparece hace fallar la prueba. Así una regresión de contrato —y, sobre todo,
 * una fuga de datos sensibles— se detecta aunque el estado HTTP siga siendo correcto.
 */
const usuarioBasico = {
  id: z.string(),
  email: z.string(),
  nombre: z.string(),
  apellido: z.string(),
  tipo_usuario: z.string(),
}

export const ErrorApi = z.object({ error: z.string(), code: z.string().optional(), details: z.unknown().optional() }).strict()
export const MensajeSimple = z.object({ message: z.string() }).strict()
export const TokenValido = z.object({ message: z.string(), valid: z.literal(true) }).strict()

export const RespuestaCrearUsuario = z
  .object({
    message: z.string(),
    user: z.object({ ...usuarioBasico, activo: z.boolean() }).strict(),
  })
  .strict()

export const RespuestaLogin = z
  .object({
    message: z.string(),
    token: z.string().regex(/^[\w-]+\.[\w-]+\.[\w-]+$/),
    user: z
      .object({
        ...usuarioBasico,
        user_type: z.string(),
        user_role: z.string(),
        dashboard: z.string(),
        permissions: z.array(z.string()),
        roles: z.array(z.string()),
        role_description: z.string(),
        coordinador: z.object({ carrera_id: z.unknown() }).strict().optional(),
        decano: z.record(z.unknown()).optional(),
      })
      .strict(),
  })
  .strict()

export const RespuestaLoginMultirol = z
  .object({
    message: z.string(),
    user: z.object({ ...usuarioBasico, roles: z.array(z.string()), multiple_roles: z.literal(true) }).strict(),
    available_roles: z.array(z.string()).min(2),
    requires_role_selection: z.literal(true),
  })
  .strict()

export const RespuestaLoginConRol = z
  .object({
    token: z.string().regex(/^[\w-]+\.[\w-]+\.[\w-]+$/),
    user: z
      .object({ ...usuarioBasico, roles: z.array(z.string()), selected_role: z.string(), dashboard: z.string() })
      .strict(),
  })
  .strict()

export const RespuestaMe = z
  .object({
    ...usuarioBasico,
    user_type: z.string(),
    user_role: z.string(),
    activo: z.boolean(),
    created_at: z.string().optional(),
    dashboard: z.string(),
    permissions: z.array(z.string()),
    role_description: z.string(),
  })
  .strict()

/** Falla indicando qué clave sobra o falta (el mensaje de zod ya incluye la ruta del campo). */
export function expectContrato(res: { body: unknown }, esquema: z.ZodTypeAny) {
  const r = esquema.safeParse(res.body)
  expect(r.success, r.success ? '' : `Contrato roto: ${JSON.stringify(r.error.issues)}\nCuerpo: ${JSON.stringify(res.body)}`).toBe(true)
}

/** Claves de primer y segundo nivel, ordenadas: la «huella» del contrato para la instantánea. */
export function huellaDeClaves(body: unknown): string[] {
  const claves: string[] = []
  const recorrer = (valor: unknown, prefijo: string, nivel: number) => {
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      for (const [k, v] of Object.entries(valor)) {
        claves.push(prefijo + k)
        if (nivel < 2) recorrer(v, `${prefijo}${k}.`, nivel + 1)
      }
    }
  }
  recorrer(body, '', 0)
  return claves.sort()
}

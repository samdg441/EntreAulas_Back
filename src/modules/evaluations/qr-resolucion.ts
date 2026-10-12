export type ResultadoQr =
  | { ok: false; status: 400 | 404 | 500; error: string }
  | {
      ok: true
      status: 200
      data: { profesorId: unknown; cursoId: unknown; grupoId: unknown }
    }

type Relacion<T> = T | T[] | null | undefined

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** La columna `token` es uuid: cualquier otro texto hace fallar la consulta en PostgreSQL. */
export function esTokenQrValido(token: unknown): token is string {
  return typeof token === 'string' && UUID_RE.test(token)
}

/** Sin `expires_at` el QR no vence; una fecha ilegible se trata como vencida. */
export function qrVencido(expiresAt: unknown, ahora: Date = new Date()): boolean {
  if (expiresAt == null || expiresAt === '') return false
  const fecha = new Date(String(expiresAt)).getTime()
  return Number.isNaN(fecha) || fecha <= ahora.getTime()
}

export function sinVencer<T extends { expires_at?: unknown }>(rows: T[], ahora: Date = new Date()): T[] {
  return rows.filter((row) => !qrVencido(row.expires_at, ahora))
}

/**
 * Decide si un token QR se puede usar. Lo llama GET /qr-evaluaciones/:token
 * después de consultar la fila (o con el resultado vacío).
 */
export function resolverEvaluacionQr(params: {
  token?: string
  errorBd?: boolean
  ahora?: Date
  qr?: {
    activo?: boolean
    expires_at?: unknown
    profesor_id?: unknown
    curso_id?: unknown
    grupo_id?: unknown
  } | null
}): ResultadoQr {
  if (!params.token) {
    return { ok: false, status: 400, error: 'Token requerido.' }
  }
  if (params.errorBd) {
    return { ok: false, status: 500, error: 'Error al resolver el token.' }
  }
  if (!params.qr || params.qr.activo === false || qrVencido(params.qr.expires_at, params.ahora)) {
    return { ok: false, status: 404, error: 'QR inválido o expirado.' }
  }
  return {
    ok: true,
    status: 200,
    data: {
      profesorId: params.qr.profesor_id,
      cursoId: params.qr.curso_id,
      grupoId: params.qr.grupo_id,
    },
  }
}

function uno<T>(valor: Relacion<T>): T | undefined {
  if (Array.isArray(valor)) return valor[0]
  return valor ?? undefined
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

export function mapearRespuestaQr(row: Record<string, unknown>) {
  const prof = uno(row.profesor as Relacion<Record<string, unknown>>)
  const usu = uno(prof?.usuario as Relacion<Record<string, unknown>>)
  const curso = uno(row.curso as Relacion<Record<string, unknown>>)
  const grupo = uno(row.grupo as Relacion<Record<string, unknown>>)
  const profesorNombre = `${texto(usu?.nombre)} ${texto(usu?.apellido)}`.trim()
  return {
    profesorId: row.profesor_id,
    cursoId: row.curso_id,
    materiaId: row.curso_id,
    grupoId: row.grupo_id,
    periodoId: row.periodo_id ?? null,
    profesorNombre: profesorNombre || null,
    cursoNombre: (curso?.nombre as string | undefined) ?? null,
    cursoCodigo: (curso?.codigo as string | undefined) ?? null,
    grupoNumero: (grupo?.numero_grupo as string | number | undefined) ?? null,
    grupoHorario: (grupo?.horario as string | undefined) ?? null,
    grupoAula: (grupo?.aula as string | undefined) ?? null,
  }
}

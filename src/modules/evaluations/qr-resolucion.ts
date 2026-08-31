export type ResultadoQr =
  | { ok: false; status: 400 | 404 | 500; error: string }
  | {
      ok: true
      status: 200
      data: { profesorId: unknown; cursoId: unknown; grupoId: unknown }
    }

/**
 * Decide si un token QR se puede usar. Lo llama GET /qr-evaluaciones/:token
 * después de consultar la fila (o con el resultado vacío).
 */
export function resolverEvaluacionQr(params: {
  token?: string
  errorBd?: boolean
  qr?: { activo?: boolean; profesor_id?: unknown; curso_id?: unknown; grupo_id?: unknown } | null
}): ResultadoQr {
  if (!params.token) {
    return { ok: false, status: 400, error: 'Token requerido.' }
  }
  if (params.errorBd) {
    return { ok: false, status: 500, error: 'Error al resolver el token.' }
  }
  if (!params.qr || params.qr.activo === false) {
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

function uno<T>(valor: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(valor)) return valor[0]
  return valor ?? undefined
}

export function mapearRespuestaQr(row: Record<string, unknown>) {
  const prof = uno(row.profesor as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const usu = uno(prof?.usuario as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const curso = uno(row.curso as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const grupo = uno(row.grupo as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const profesorNombre = `${String(usu?.nombre ?? '')} ${String(usu?.apellido ?? '')}`.trim()
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

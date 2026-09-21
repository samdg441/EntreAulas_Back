import { sendMail } from '../../shared/adapters/mailer.adapter'
import { qrRepository } from './qr.repository'
import { parseGrupoIds, carreraIdSiCoordinador } from './qr-batch'
import { AppError, badRequest, forbidden, internal, notFound, unavailable } from '../../shared/errors'

const EMAIL_REGEX = /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{1,63}$/

type Relacion<T> = T | T[] | null | undefined

type LinkQr = {
  grupoId: number
  url: string
  cursoNombre: string
  cursoCodigo: string
  grupoNumero: string
  profesorNombre: string
}

export async function compartirQrsPorEmail(
  user: { id?: string; roles?: string[]; tipo_usuario?: string },
  body: { to?: unknown; subject?: unknown; message?: unknown; grupoIds?: unknown } | null | undefined
) {
  const email = correoDestino(body?.to)
  const mailSubject = asuntoCorreo(body?.subject)
  const ids = Array.from(new Set(parseGrupoIds(body?.grupoIds)))
  const carreraId = await carreraIdSiCoordinador(user)
  const rows = await filasParaShare(ids, carreraId)
  const links = rows.map((row) => linkDesdeFila(row, appBaseUrl()))
  await enviarCorreoQr(email, mailSubject, texto(body?.message), links)
  return { email, totalLinks: links.length }
}

export function errorEnvioCorreo(error: unknown) {
  if (error instanceof AppError) return error
  const msg = error instanceof Error ? error.message : 'Error interno del servidor'
  return internal('Error enviando el correo', msg)
}

function texto(valor: unknown): string {
  if (typeof valor === 'string') return valor.trim()
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  return ''
}

function correoDestino(to: unknown) {
  const email = texto(to)
  if (!email || !EMAIL_REGEX.test(email)) {
    throw badRequest('Correo de destino inválido.')
  }
  return email
}

function asuntoCorreo(subject: unknown) {
  const mailSubject = texto(subject)
  if (!mailSubject) throw badRequest('El asunto es requerido.')
  return mailSubject
}

function uno<T>(valor: Relacion<T>): T | undefined {
  if (Array.isArray(valor)) return valor[0]
  return valor ?? undefined
}

function cursoDeFila(row: Record<string, unknown>) {
  return uno(row.curso as Relacion<Record<string, unknown>>)
}

async function filasParaShare(ids: number[], carreraId: number | null) {
  let rowsList: Record<string, unknown>[] = []
  try {
    rowsList = (await qrRepository.listActivosParaShare(ids)) as Record<string, unknown>[]
  } catch (rowsError: unknown) {
    const msg = rowsError instanceof Error ? rowsError.message : String(rowsError)
    throw internal('Error consultando QRs', msg)
  }
  if (rowsList.length === 0) {
    throw notFound('No hay QRs activos para los grupos seleccionados.')
  }

  const filtered = filtrarPorCarrera(rowsList, carreraId)
  if (filtered.length === 0) {
    throw forbidden('Los grupos seleccionados no pertenecen a tu carrera.')
  }
  return filtered
}

function filtrarPorCarrera(rowsList: Record<string, unknown>[], carreraId: number | null) {
  if (carreraId == null) return rowsList
  return rowsList.filter((row) => Number(cursoDeFila(row)?.carrera_id) === carreraId)
}

function appBaseUrl() {
  let url = String(process.env.FRONTEND_URL || process.env.VITE_PUBLIC_APP_URL || 'http://localhost:5173')
  while (url.endsWith('/')) {
    url = url.slice(0, -1)
  }
  return url
}

function smtpListo() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM)
}

function linkDesdeFila(row: Record<string, unknown>, baseUrl: string): LinkQr {
  const curso = cursoDeFila(row)
  const grupo = uno(row.grupo as Relacion<Record<string, unknown>>)
  const profesor = uno(row.profesor as Relacion<Record<string, unknown>>)
  const usuario = uno(profesor?.usuario as Relacion<Record<string, unknown>>)
  const profesorNombre =
    `${texto(usuario?.nombre)} ${texto(usuario?.apellido)}`.trim() || 'Docente'
  return {
    grupoId: Number(row.grupo_id),
    url: `${baseUrl}/qr-evaluacion?token=${encodeURIComponent(texto(row.token))}`,
    cursoNombre: texto(curso?.nombre) || 'Curso',
    cursoCodigo: texto(curso?.codigo),
    grupoNumero: texto(grupo?.numero_grupo) || texto(row.grupo_id),
    profesorNombre,
  }
}

function cuerpoTexto(message: string, links: LinkQr[]) {
  return (
    `${message.trim()}\n\n` +
    links
      .map(
        (l, idx) =>
          `${idx + 1}. ${l.cursoNombre} (${l.cursoCodigo}) - Grupo ${l.grupoNumero} - ${l.profesorNombre}\n${l.url}`
      )
      .join('\n\n')
  )
}

function cuerpoHtml(message: string, links: LinkQr[]) {
  const intro = message.trim() || 'Compartimos los códigos QR de evaluación para los siguientes grupos:'
  const items = links
    .map(
      (l, idx) =>
        `<li style="margin-bottom:12px">
            <strong>${idx + 1}. ${l.cursoNombre} (${l.cursoCodigo})</strong><br/>
            Grupo: ${l.grupoNumero}<br/>
            Docente: ${l.profesorNombre}<br/>
            <a href="${l.url}" target="_blank" rel="noreferrer">${l.url}</a>
          </li>`
    )
    .join('')
  return `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <p>${intro}</p>
        <ol>${items}</ol>
      </div>
    `
}

async function enviarCorreoQr(email: string, subject: string, message: string, links: LinkQr[]) {
  if (!smtpListo()) {
    throw unavailable('Servicio de correo no configurado. Faltan variables SMTP en el backend.')
  }
  await sendMail({
    to: email,
    subject,
    text: cuerpoTexto(message, links),
    html: cuerpoHtml(message, links),
  })
}

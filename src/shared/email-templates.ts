/**
 * Plantillas HTML de correo.
 * Los clientes de correo (Gmail, Outlook, móviles) no soportan CSS externo, flexbox
 * ni imágenes en base64: todo va en tablas con estilos en línea y las imágenes por URL pública.
 */

const ROJO = '#E30613'
const ROJO_OSCURO = '#991B1B'
const ROJO_SUAVE = '#FECACA'
const GRIS_TEXTO = '#374151'
const GRIS_SUAVE = '#6B7280'
const FONDO = '#F3F4F6'
const FUENTE = "Arial, 'Helvetica Neue', Helvetica, sans-serif"

const SITIO_UNIVERSIDAD = 'https://www.udemedellin.edu.co'

export function escapeHtml(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function quitarSlashFinal(url: string): string {
  let limpio = url
  while (limpio.endsWith('/')) limpio = limpio.slice(0, -1)
  return limpio
}

export function frontendBaseUrl(): string {
  return quitarSlashFinal(String(process.env.FRONTEND_URL || 'http://localhost:5173'))
}

export function backendPublicUrl(): string {
  const porDefecto = `http://localhost:${process.env.PORT || 3000}`
  return quitarSlashFinal(String(process.env.BACKEND_PUBLIC_URL || porDefecto))
}

function correoSoporte(): string {
  const from = String(process.env.SMTP_FROM || '')
  const abre = from.lastIndexOf('<')
  const cierra = from.lastIndexOf('>')
  if (abre !== -1 && cierra > abre) return from.slice(abre + 1, cierra).trim()
  return from.trim()
}

function boton(href: string, texto: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
  <tr>
    <td align="center" bgcolor="${ROJO}" style="border-radius:6px;">
      <a href="${escapeHtml(href)}" target="_blank"
         style="display:inline-block;padding:13px 28px;font-family:${FUENTE};font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:6px;">${escapeHtml(texto)}</a>
    </td>
  </tr>
</table>`
}

function enlaceFooter(href: string, texto: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" style="color:${ROJO_OSCURO};text-decoration:underline;">${escapeHtml(texto)}</a>`
}

function urlLogo(): string {
  return `${backendPublicUrl()}/static/email/logo-entreaulas.png`
}

function layout(params: { titulo: string; preheader: string; etiqueta?: string; cuerpo: string; footer: string }): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(params.titulo)}</title>
</head>
<body style="margin:0;padding:0;background-color:${FONDO};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(params.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${FONDO}">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:600px;background-color:#FFFFFF;border-radius:10px;overflow:hidden;">
        <tr>
          <td bgcolor="#FFFFFF" style="padding:18px 28px;border-bottom:4px solid ${ROJO};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="60" valign="middle" style="width:60px;">
                  <img src="${escapeHtml(urlLogo())}" width="51" height="56" alt="EntreAulas"
                       style="display:block;width:51px;height:56px;border:0;">
                </td>
                <td valign="middle" style="padding-left:12px;font-family:${FUENTE};">
                  <div style="font-size:20px;font-weight:bold;color:#111827;">EntreAulas</div>
                  <div style="font-size:13px;color:${GRIS_SUAVE};">Universidad de Medellín</div>
                </td>
                ${params.etiqueta ? `<td align="right" valign="middle" style="font-family:${FUENTE};">
                  <span style="display:inline-block;padding:5px 12px;background-color:#FEF2F2;border:1px solid ${ROJO_SUAVE};border-radius:999px;font-size:12px;font-weight:bold;color:${ROJO_OSCURO};white-space:nowrap;">${escapeHtml(params.etiqueta)}</span>
                </td>` : ''}
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 28px 24px;font-family:${FUENTE};font-size:15px;line-height:1.6;color:${GRIS_TEXTO};">
            ${params.cuerpo}
          </td>
        </tr>
        <tr>
          <td bgcolor="#F9FAFB" style="padding:20px 28px;border-top:1px solid #E5E7EB;font-family:${FUENTE};font-size:12px;line-height:1.6;color:${GRIS_SUAVE};text-align:center;">
            ${params.footer}
            <div style="margin-top:10px;">Este es un mensaje automático de EntreAulas, por favor no respondas a este correo.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

export type CorreoRecuperacion = {
  nombre?: string
  resetLink: string
  vigencia: string
}

export function correoRecuperacionHtml({ nombre, resetLink, vigencia }: CorreoRecuperacion): string {
  const saludo = nombre ? `Hola, ${escapeHtml(nombre)}.` : 'Hola.'
  const soporte = correoSoporte()
  const cuerpo = `
<h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;color:#111827;text-align:center;">Recuperación de Contraseña</h1>
<p style="margin:0 0 12px;">${saludo}</p>
<p style="margin:0 0 12px;">Recibimos una solicitud para restablecer la contraseña de tu cuenta de EntreAulas. Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
  <tr>
    <td bgcolor="#FEF2F2" style="padding:10px 14px;border-left:4px solid ${ROJO};font-size:14px;color:${ROJO_OSCURO};">
      &#9201; Este enlace expira en <strong>${escapeHtml(vigencia)}</strong> y solo puede usarse una vez.
    </td>
  </tr>
</table>
${boton(resetLink, 'Restablecer mi Contraseña')}
<p style="margin:24px 0 6px;font-size:13px;color:${GRIS_SUAVE};">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
<p style="margin:0;font-size:13px;word-break:break-all;"><a href="${escapeHtml(resetLink)}" target="_blank" style="color:${ROJO};">${escapeHtml(resetLink)}</a></p>`

  const footer = `
<div>${soporte ? `${enlaceFooter(`mailto:${soporte}`, 'Soporte técnico')} &nbsp;·&nbsp; ` : ''}${enlaceFooter(SITIO_UNIVERSIDAD, 'Aviso de privacidad')}</div>
<div style="margin-top:6px;">© ${new Date().getFullYear()} Universidad de Medellín · Sistema EntreAulas</div>`

  return layout({
    titulo: 'Recuperación de Contraseña',
    preheader: `Restablece tu contraseña de EntreAulas. El enlace expira en ${vigencia}.`,
    cuerpo,
    footer,
  })
}

export function correoRecuperacionTexto({ nombre, resetLink, vigencia }: CorreoRecuperacion): string {
  return [
    nombre ? `Hola, ${nombre}.` : 'Hola.',
    '',
    'Recibimos una solicitud para restablecer la contraseña de tu cuenta de EntreAulas.',
    `Usa este enlace (expira en ${vigencia} y solo puede usarse una vez):`,
    '',
    resetLink,
    '',
    'Si no fuiste tú, ignora este mensaje.',
  ].join('\n')
}

export type QrCurso = {
  token: string
  url: string
  imagenUrl: string
  descargaUrl: string
  cursoNombre: string
  cursoCodigo: string
  grupoNumero: string
  profesorNombre: string
}

function tarjetaQr(qr: QrCurso): string {
  const titulo = qr.cursoCodigo
    ? `${escapeHtml(qr.cursoCodigo)} - ${escapeHtml(qr.cursoNombre.toUpperCase())}`
    : escapeHtml(qr.cursoNombre.toUpperCase())
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
  <tr>
    <td align="center" style="padding:20px;border:2px solid ${ROJO_SUAVE};border-radius:10px;background-color:#FFFFFF;">
      <div style="font-size:13px;font-weight:bold;letter-spacing:0.5px;color:${ROJO};">${titulo}</div>
      <div style="margin:2px 0 14px;font-size:13px;color:${GRIS_SUAVE};">Grupo ${escapeHtml(qr.grupoNumero)} · ${escapeHtml(qr.profesorNombre)}</div>
      <img src="${escapeHtml(qr.imagenUrl)}" width="200" height="200" alt="Código QR de la evaluación"
           style="display:block;margin:0 auto 16px;width:200px;height:200px;border:0;">
      ${boton(qr.descargaUrl, 'Descargar QR para Clase')}
      <div style="margin-top:12px;font-size:12px;"><a href="${escapeHtml(qr.url)}" target="_blank" style="color:${ROJO_OSCURO};">Abrir el enlace de la encuesta</a></div>
    </td>
  </tr>
</table>`
}

export type CorreoQrDocente = {
  qrs: QrCurso[]
  mensaje?: string
}

export function correoQrDocenteHtml({ qrs, mensaje }: CorreoQrDocente): string {
  const unicoProfesor = qrs.length > 0 && qrs.every((q) => q.profesorNombre === qrs[0].profesorNombre)
  const saludo = unicoProfesor ? `Estimado/a ${escapeHtml(qrs[0].profesorNombre)},` : 'Estimado/a docente,'
  const nota = mensaje?.trim()
    ? `<p style="margin:0 0 16px;padding:10px 14px;background-color:#F9FAFB;border-radius:6px;">${escapeHtml(mensaje.trim()).replace(/\r?\n/g, '<br>')}</p>`
    : ''
  const panel = `${frontendBaseUrl()}/login`
  const soporte = correoSoporte()

  const cuerpo = `
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111827;">Evaluación de clase con código QR</h1>
<p style="margin:0 0 12px;">${saludo}</p>
<p style="margin:0 0 16px;">Ya está abierta la evaluación de ${qrs.length === 1 ? 'tu curso' : 'tus cursos'}. Puedes proyectar este código QR en la pantalla del aula o compartirlo con tus estudiantes para que respondan la encuesta. También va adjunto en PNG, listo para imprimir o proyectar.</p>
${nota}
${qrs.map(tarjetaQr).join('')}
<p style="margin:8px 0 0;text-align:center;font-size:14px;"><a href="${escapeHtml(panel)}" target="_blank" style="color:${ROJO};font-weight:bold;">Ver estado de la evaluación en mi panel</a></p>`

  const footer = `
<div style="font-weight:bold;color:${GRIS_TEXTO};">Departamento Académico · Universidad de Medellín</div>
<div style="margin-top:6px;">${enlaceFooter(panel, 'Panel del docente')}${soporte ? ` &nbsp;·&nbsp; ${enlaceFooter(`mailto:${soporte}`, 'Soporte')}` : ''} &nbsp;·&nbsp; ${enlaceFooter(SITIO_UNIVERSIDAD, 'Aviso de privacidad')}</div>
<div style="margin-top:6px;">© ${new Date().getFullYear()} Universidad de Medellín · Sistema EntreAulas</div>`

  return layout({
    titulo: 'Evaluación Docente - Código QR',
    preheader: 'Tu código QR de evaluación de clase está listo para compartir con tus estudiantes.',
    etiqueta: 'Evaluación Docente',
    cuerpo,
    footer,
  })
}

export function correoQrDocenteTexto({ qrs, mensaje }: CorreoQrDocente): string {
  const intro = mensaje?.trim() || 'Ya está abierta la evaluación de clase. Comparte estos enlaces con tus estudiantes:'
  const lineas = qrs.map(
    (q, idx) => `${idx + 1}. ${q.cursoNombre} (${q.cursoCodigo}) - Grupo ${q.grupoNumero} - ${q.profesorNombre}\n${q.url}`
  )
  return `${intro}\n\n${lineas.join('\n\n')}`
}

export function urlImagenQr(token: string, descargar = false): string {
  const base = `${backendPublicUrl()}/api/qr-evaluaciones/${encodeURIComponent(token)}/imagen.png`
  return descargar ? `${base}?descargar=1` : base
}

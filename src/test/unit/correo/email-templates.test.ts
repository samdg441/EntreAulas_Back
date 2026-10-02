import { afterEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { app } from '../../../app'
import {
  correoQrDocenteHtml,
  correoQrDocenteTexto,
  correoRecuperacionHtml,
  correoRecuperacionTexto,
  escapeHtml,
  urlImagenQr,
} from '../../../shared/email-templates'
import { generarPngQr } from '../../../modules/evaluations/qr-share-email'

const qr = (over: Record<string, string> = {}) => ({
  token: 'tok-1',
  url: 'http://front/qr-evaluacion?token=tok-1',
  imagenUrl: 'http://back/api/qr-evaluaciones/tok-1/imagen.png',
  descargaUrl: 'http://back/api/qr-evaluaciones/tok-1/imagen.png?descargar=1',
  cursoNombre: 'Estructuras de Datos Dinámicas',
  cursoCodigo: 'CM00307983',
  grupoNumero: '1',
  profesorNombre: 'Ana Pérez',
  ...over,
})

describe('Plantillas de correo', () => {
  afterEach(() => {
    delete process.env.BACKEND_PUBLIC_URL
  })

  it('escapeHtml neutraliza etiquetas y comillas', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe(
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;'
    )
  })

  it('recuperación: título, vigencia, botón y enlace alternativo', () => {
    const html = correoRecuperacionHtml({ nombre: 'Samuel', resetLink: 'http://front/reset-password?token=abc&email=x', vigencia: '1 hora' })
    expect(html).toContain('Recuperación de Contraseña')
    expect(html).toContain('Hola, Samuel.')
    expect(html).toContain('<strong>1 hora</strong>')
    expect(html).toContain('Restablecer mi Contraseña')
    expect(html.match(/reset-password\?token=abc&amp;email=x/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('recuperación sin nombre y en texto plano', () => {
    const datos = { resetLink: 'http://front/r', vigencia: '1 hora' }
    expect(correoRecuperacionHtml(datos)).toContain('Hola.')
    expect(correoRecuperacionTexto(datos)).toContain('http://front/r')
  })

  it('QR: saluda al docente, muestra código - NOMBRE, imagen y botón de descarga', () => {
    const html = correoQrDocenteHtml({ qrs: [qr()], mensaje: '' })
    expect(html).toContain('Estimado/a Ana Pérez,')
    expect(html).toContain('CM00307983 - ESTRUCTURAS DE DATOS DINÁMICAS')
    expect(html).toContain('src="http://back/api/qr-evaluaciones/tok-1/imagen.png"')
    expect(html).toContain('Descargar QR para Clase')
    expect(html).toContain('proyectar este código QR')
  })

  it('QR: varios docentes usan saludo genérico y el mensaje va escapado', () => {
    const html = correoQrDocenteHtml({
      qrs: [qr(), qr({ profesorNombre: 'Luis Gómez', cursoCodigo: '' })],
      mensaje: '<b>hola</b>\nlínea 2',
    })
    expect(html).toContain('Estimado/a docente,')
    expect(html).toContain('&lt;b&gt;hola&lt;/b&gt;<br>línea 2')
    expect(html).not.toContain('<b>hola</b>')
  })

  it('QR en texto plano usa el mensaje o un texto por defecto', () => {
    expect(correoQrDocenteTexto({ qrs: [qr()], mensaje: 'Links' })).toMatch(/^Links\n\n1\. /)
    expect(correoQrDocenteTexto({ qrs: [qr()] })).toContain('Ya está abierta la evaluación')
  })

  it('la cabecera lleva el logo y la recuperación ya no tiene la etiqueta de seguridad', () => {
    process.env.BACKEND_PUBLIC_URL = 'https://api.test'
    const html = correoRecuperacionHtml({ resetLink: 'http://front/r', vigencia: '1 hora' })
    expect(html).toContain('src="https://api.test/static/email/logo-entreaulas.png"')
    expect(html).not.toContain('Seguridad')
    expect(correoQrDocenteHtml({ qrs: [qr()] })).toContain('Evaluación Docente')
  })

  it('urlImagenQr usa BACKEND_PUBLIC_URL sin slash final', () => {
    process.env.BACKEND_PUBLIC_URL = 'https://api.test/'
    expect(urlImagenQr('tok-1')).toBe('https://api.test/api/qr-evaluaciones/tok-1/imagen.png')
    expect(urlImagenQr('tok-1', true)).toBe('https://api.test/api/qr-evaluaciones/tok-1/imagen.png?descargar=1')
  })
})

describe('Imagen PNG del QR', () => {
  const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

  it('genera un PNG válido', async () => {
    const png = await generarPngQr('3f2b8c1e-9d4a-4e7b-a1c2-5d6e7f8a9b0c')
    expect(png.subarray(0, 4).equals(FIRMA_PNG)).toBe(true)
  })

  it('rechaza tokens con caracteres no permitidos', async () => {
    await expect(generarPngQr('../../etc/passwd')).rejects.toMatchObject({ status: 400 })
  })

  it('GET /imagen.png responde image/png y ?descargar=1 lo marca como adjunto', async () => {
    const vista = await request(app).get('/api/qr-evaluaciones/tok-1/imagen.png')
    expect(vista.status).toBe(200)
    expect(vista.headers['content-type']).toContain('image/png')
    expect(vista.headers['content-disposition']).toBeUndefined()

    const descarga = await request(app).get('/api/qr-evaluaciones/tok-1/imagen.png?descargar=1')
    expect(descarga.headers['content-disposition']).toContain('qr-evaluacion.png')
  })

  it('GET /static/email/logo-entreaulas.png sirve el logo', async () => {
    const res = await request(app).get('/static/email/logo-entreaulas.png')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('image/png')
  })

  it('GET /imagen.png con token inválido → 400', async () => {
    const res = await request(app).get('/api/qr-evaluaciones/mal%20token/imagen.png')
    expect(res.status).toBe(400)
  })
})

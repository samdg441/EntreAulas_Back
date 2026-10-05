import fs from 'fs'
import path from 'path'
import QRCode from 'qrcode'
import { PNG } from 'pngjs'

const ANCHO_OBJETIVO = 400
const MARGEN_MODULOS = 2
/** Igual que la tarjeta de la app: círculo de ~18% del QR con el logo adentro (requiere corrección H). */
const PROPORCION_CIRCULO = 0.18
const PROPORCION_LOGO = 0.78
const GRIS_ARO: Rgb = [229, 231, 235]

type Rgb = [number, number, number]

let logoCache: PNG | null | undefined

function cargarLogo(): PNG | null {
  if (logoCache !== undefined) return logoCache
  try {
    logoCache = PNG.sync.read(fs.readFileSync(path.resolve('public/email/logo-entreaulas.png')))
  } catch {
    logoCache = null
  }
  return logoCache
}

function pintar(png: PNG, x: number, y: number, [r, g, b]: Rgb, alfa = 1) {
  const i = (png.width * y + x) << 2
  png.data[i] = Math.round(r * alfa + png.data[i] * (1 - alfa))
  png.data[i + 1] = Math.round(g * alfa + png.data[i + 1] * (1 - alfa))
  png.data[i + 2] = Math.round(b * alfa + png.data[i + 2] * (1 - alfa))
  png.data[i + 3] = 255
}

function dibujarCirculo(png: PNG, cx: number, cy: number, radio: number) {
  for (let y = Math.floor(cy - radio - 1); y <= Math.ceil(cy + radio + 1); y++) {
    for (let x = Math.floor(cx - radio - 1); x <= Math.ceil(cx + radio + 1); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d <= radio - 1) pintar(png, x, y, [255, 255, 255])
      else if (d <= radio) pintar(png, x, y, GRIS_ARO)
    }
  }
}

/** Promedio de los píxeles del logo que caen en cada píxel destino (reduce sin dientes de sierra). */
function dibujarLogo(png: PNG, logo: PNG, cx: number, cy: number, lado: number) {
  const escala = Math.min(lado / logo.width, lado / logo.height)
  const ancho = Math.max(1, Math.round(logo.width * escala))
  const alto = Math.max(1, Math.round(logo.height * escala))
  const x0 = Math.round(cx - ancho / 2)
  const y0 = Math.round(cy - alto / 2)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const sx0 = Math.floor(x / escala)
      const sy0 = Math.floor(y / escala)
      const sx1 = Math.min(logo.width, Math.max(sx0 + 1, Math.floor((x + 1) / escala)))
      const sy1 = Math.min(logo.height, Math.max(sy0 + 1, Math.floor((y + 1) / escala)))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (logo.width * sy + sx) << 2
          const alfa = logo.data[i + 3] / 255
          r += logo.data[i] * alfa
          g += logo.data[i + 1] * alfa
          b += logo.data[i + 2] * alfa
          a += alfa
        }
      }
      const n = (sx1 - sx0) * (sy1 - sy0)
      if (a > 0) pintar(png, x0 + x, y0 + y, [r / a, g / a, b / a], a / n)
    }
  }
}

/** PNG del QR como se ve en la app: negro sobre blanco, corrección H y el logo de EntreAulas al centro. */
export function pngQrConLogo(texto: string, logo: PNG | null = cargarLogo()): Buffer {
  const qr = QRCode.create(texto, { errorCorrectionLevel: 'H' })
  const modulos = qr.modules.size
  const escala = Math.max(4, Math.round(ANCHO_OBJETIVO / (modulos + MARGEN_MODULOS * 2)))
  const lado = (modulos + MARGEN_MODULOS * 2) * escala
  const png = new PNG({ width: lado, height: lado })
  png.data.fill(255)

  for (let fila = 0; fila < modulos; fila++) {
    for (let col = 0; col < modulos; col++) {
      if (!qr.modules.get(fila, col)) continue
      const x0 = (col + MARGEN_MODULOS) * escala
      const y0 = (fila + MARGEN_MODULOS) * escala
      for (let y = y0; y < y0 + escala; y++) {
        for (let x = x0; x < x0 + escala; x++) pintar(png, x, y, [0, 0, 0])
      }
    }
  }

  if (logo) {
    const centro = lado / 2
    const diametro = modulos * escala * PROPORCION_CIRCULO
    dibujarCirculo(png, centro, centro, diametro / 2)
    dibujarLogo(png, logo, centro, centro, diametro * PROPORCION_LOGO)
  }
  return PNG.sync.write(png)
}

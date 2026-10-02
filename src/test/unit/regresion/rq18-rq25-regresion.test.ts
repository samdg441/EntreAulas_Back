import { beforeAll, describe, it } from 'vitest'
import { expect } from 'chai'
import { resolverEvaluacionQr } from '../../../modules/evaluations/qr-resolucion'
import {
  dashboardDesdeRoles,
  dashboardDesdeRolSeleccionado,
  dashboardParaUsuario,
} from '../../../modules/auth/dashboard'
import { calcularPromedio, resumenHistorico } from '../../../modules/analytics/calificaciones'
import { armarResumenCoordinador } from '../../../modules/analytics/coordinador-resumen'
import {
  decidirExportacionReporte,
  MIME_EXCEL,
  nombreArchivoReporte,
} from '../../../modules/analytics/reporte-exportacion'
import { coordinadorUser, estudianteUser } from '../../fixtures/users'

/**
 * Igual que rq1-rq5-regresion-flujo-autenticacion.test.ts:
 * primero corre el camino que sí funciona y después cada `it` de Regresión
 * comprueba que ese éxito no dejó abierta la puerta de atrás.
 * RQ20 y RQ21 no forman parte de este conjunto.
 */
const resultado: Record<string, any> = {}

describe('RQ18→RQ25 — Regresión de QR, dashboard, métricas, histórico, coordinador y exportación', () => {
  beforeAll(() => {
    const token = 't-regresion'
    resultado.qrVigente = resolverEvaluacionQr({
      token,
      qr: { activo: true, profesor_id: 10, curso_id: 20, grupo_id: 30 },
    })
    resultado.qrApagado = resolverEvaluacionQr({
      token,
      qr: { activo: false, profesor_id: 10, curso_id: 20, grupo_id: 30 },
    })
    resultado.qrSinCodigo = resolverEvaluacionQr({ token: '' })
    resultado.qrFalloBd = resolverEvaluacionQr({ token, errorBd: true })

    resultado.rutaAdmin = dashboardParaUsuario(['estudiante', 'admin'])
    resultado.rutaEstudiante = dashboardDesdeRolSeleccionado('estudiante')
    resultado.rutaRara = dashboardDesdeRolSeleccionado('ADMIN')
    resultado.sinRoles = dashboardDesdeRoles([])

    resultado.promedioValido = calcularPromedio([4, 5])
    resultado.promedioConBasura = calcularPromedio([4, 5, 99, null, 'no-es-numero'])
    resultado.promedioVacio = calcularPromedio([])

    resultado.soloMarzo = resumenHistorico(
      [{ calificacion_promedio: 4, fecha_creacion: '2026-03-01' }],
      '2026-1'
    )
    resultado.marzoYAgosto = resumenHistorico(
      [
        { calificacion_promedio: 4, fecha_creacion: '2026-03-01' },
        { calificacion_promedio: 2, fecha_creacion: '2026-08-15' },
      ],
      '2026-1'
    )
    resultado.periodoRoto = resumenHistorico(
      [{ calificacion_promedio: 4, fecha_creacion: '2026-03-01' }],
      'abc'
    )

    const plantel = {
      profesores: [
        { id: 7, usuario_id: 'u1' },
        { id: 8, usuario_id: 'u2' },
        { id: 9, usuario_id: 'u3' },
      ],
      usuarios: [
        { id: 'u1', nombre: 'Ana', apellido: 'Pérez', email: 'ana@t.com' },
        { id: 'u2', nombre: 'Luis', apellido: 'Gómez', email: 'luis@t.com' },
        { id: 'u3', nombre: 'Zoe', apellido: 'Ruiz', email: 'zoe@t.com' },
      ],
      evaluaciones: [
        { profesor_id: 7, calificacion_promedio: 4.5 },
        { profesor_id: 8, calificacion_promedio: 3 },
        { profesor_id: 8, calificacion_promedio: 99 },
        { profesor_id: 9, calificacion_promedio: 5 },
      ],
      totalCursos: 4,
    }
    resultado.plantel = armarResumenCoordinador(plantel)
    resultado.busquedaAna = armarResumenCoordinador({ ...plantel, search: 'ANA' })
    resultado.pagina2 = armarResumenCoordinador({ ...plantel, page: 2, pageSize: 2 })

    const filas = [{ DOCENTE: 'Ana Pérez', PROMEDIO: 4.5 }]
    resultado.filasExportadas = filas
    resultado.exportCoordinador = decidirExportacionReporte({
      user: coordinadorUser,
      filas,
      period: '2026-1',
    })
    resultado.exportEstudiante = decidirExportacionReporte({
      user: estudianteUser,
      filas,
      period: '2026-1',
    })
    resultado.nombreGeneral = nombreArchivoReporte('2026-1', 'general')
  })

  it('RQ18: el código activo responde 200 con profesor, curso y grupo', () => {
    expect(resultado.qrVigente.status).to.equal(200)
    expect(resultado.qrVigente.ok).to.equal(true)
    expect(resultado.qrVigente.data).to.deep.equal({ profesorId: 10, cursoId: 20, grupoId: 30 })
  })

  it('Regresión RQ18: al apagar ese mismo código, deja de servir', () => {
    expect(resultado.qrApagado.status).to.equal(404)
    expect(resultado.qrApagado.ok).to.equal(false)
    expect(resultado.qrApagado.error).to.equal('QR inválido o expirado.')
  })

  it('Regresión RQ18: un enlace sin código sigue en 400', () => {
    expect(resultado.qrSinCodigo.status).to.equal(400)
    expect(resultado.qrSinCodigo.ok).to.equal(false)
  })

  it('Regresión RQ18: un fallo de base sigue siendo 500 y no se disfraza del 200', () => {
    expect(resultado.qrFalloBd.status).to.equal(500)
    expect(resultado.qrFalloBd.ok).to.equal(false)
  })

  it('RQ19: con admin y estudiante entra al panel de admin', () => {
    expect(resultado.rutaAdmin).to.equal('/dashboard-admin')
  })

  it('Regresión RQ19: al elegir estudiante en el menú, ya no se queda en admin', () => {
    expect(resultado.rutaEstudiante).to.equal('/dashboard-estudiante')
  })

  it('Regresión RQ19: un rol escrito raro vuelve al inicio', () => {
    expect(resultado.rutaRara).to.equal('/dashboard')
  })

  it('Regresión RQ19: sin roles la lista no inventa una ruta', () => {
    expect(resultado.sinRoles).to.be.null
  })

  it('RQ22: 4 y 5 promedian 4.5', () => {
    expect(resultado.promedioValido).to.equal(4.5)
  })

  it('Regresión RQ22: meter 99, null o texto al lado deja el mismo 4.5', () => {
    expect(resultado.promedioConBasura).to.equal(resultado.promedioValido)
  })

  it('Regresión RQ22: sin evaluaciones el promedio sigue en 0', () => {
    expect(resultado.promedioVacio).to.equal(0)
  })

  it('RQ23: marzo de 2026-1 promedia 4', () => {
    expect(resultado.soloMarzo.calificacionPromedio).to.equal(4)
    expect(resultado.soloMarzo.totalEvaluaciones).to.equal(1)
    expect(resultado.soloMarzo.dateRange).to.deep.equal({ start: '2026-01-01', end: '2026-06-30' })
  })

  it('Regresión RQ23: la nota de agosto no entra y el promedio de marzo se queda en 4', () => {
    expect(resultado.marzoYAgosto.calificacionPromedio).to.equal(resultado.soloMarzo.calificacionPromedio)
    expect(resultado.marzoYAgosto.totalEvaluaciones).to.equal(1)
  })

  it('Regresión RQ23: un periodo inválido no hereda las fechas ni el promedio', () => {
    expect(resultado.periodoRoto.totalEvaluaciones).to.equal(0)
    expect(resultado.periodoRoto.calificacionPromedio).to.equal(0)
    expect(resultado.periodoRoto.dateRange).to.deep.equal({ start: '', end: '' })
  })

  it('RQ24: el plantel tiene 3 docentes y uno en riesgo', () => {
    expect(resultado.plantel.stats.totalProfesores).to.equal(3)
    expect(resultado.plantel.stats.totalEvaluaciones).to.equal(3)
    expect(resultado.plantel.stats.profesoresEnRiesgo).to.equal(1)
  })

  it('Regresión RQ24: buscar a Ana deja el total de profesores y el riesgo iguales', () => {
    expect(resultado.busquedaAna.teachers.map((t: { nombre: string }) => t.nombre)).to.deep.equal(['Ana Pérez'])
    expect(resultado.busquedaAna.pagination.total).to.equal(1)
    expect(resultado.busquedaAna.stats.totalProfesores).to.equal(resultado.plantel.stats.totalProfesores)
    expect(resultado.busquedaAna.stats.profesoresEnRiesgo).to.equal(resultado.plantel.stats.profesoresEnRiesgo)
  })

  it('Regresión RQ24: la página 2 no repite a los dos primeros', () => {
    expect(resultado.pagina2.pagination.page).to.equal(2)
    expect(resultado.pagina2.teachers).to.have.lengthOf(1)
    expect(resultado.pagina2.teachers[0].nombre).to.not.equal(resultado.plantel.teachers[0].nombre)
    expect(resultado.pagina2.teachers[0].nombre).to.not.equal(resultado.plantel.teachers[1].nombre)
  })

  it('RQ25: el coordinador recibe el archivo con esas filas', () => {
    expect(resultado.exportCoordinador.ok).to.equal(true)
    expect(resultado.exportCoordinador.filename).to.equal('reporte-coordinador-2026-1.xlsx')
    expect(resultado.exportCoordinador.filas).to.deep.equal(resultado.filasExportadas)
    expect(resultado.exportCoordinador.mimeType).to.equal(MIME_EXCEL)
  })

  it('Regresión RQ25: las mismas filas, pedidas por un estudiante, siguen negadas', () => {
    expect(resultado.exportEstudiante.ok).to.equal(false)
    expect(resultado.exportEstudiante.error).to.equal('No autorizado para exportar reportes.')
  })

  it('Regresión RQ25: el nombre general no usa el prefijo del coordinador', () => {
    expect(resultado.nombreGeneral).to.equal('reporte-2026-1.xlsx')
  })
})

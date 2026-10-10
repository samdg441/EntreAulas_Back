import { cargarTokenCoordinadorOSaltar, pedirComoCoordinador, periodo } from '../../support/api'

/**
 * Regresión de datos: varios endpoints calculan la misma cifra por caminos distintos.
 * Si alguien cambia una consulta y no la otra, las cifras dejan de coincidir aunque
 * cada endpoint, por separado, siga "funcionando". (DEF-07 fue exactamente eso.)
 */
describe('RQ22–RQ25 — Las cifras coinciden entre endpoints', function () {
  let profesorId = 0

  before(function () {
    cargarTokenCoordinadorOSaltar(this)
    pedirComoCoordinador('/api/coordinador/dashboard-summary?page=1&pageSize=50').then((r) => {
      const conEvaluaciones = r.body.teachers.find((d: any) => d.totalEvaluaciones > 0)
      if (!conEvaluaciones) this.skip()
      profesorId = conEvaluaciones.profesorId
    })
  })

  it('RQ22 ≡ RQ23: profesor-stats y el histórico del docente dan el mismo promedio y total', () => {
    pedirComoCoordinador(`/api/coordinador/profesor-stats/${profesorId}?period=${periodo()}`).then((stats) => {
      expect(stats.status).to.eq(200)
      pedirComoCoordinador(`/api/teachers/${profesorId}/stats/historical?period=${periodo()}`).then((historico) => {
        expect(historico.status).to.eq(200)
        expect(historico.body.totalEvaluaciones).to.eq(stats.body.summary.totalEvaluaciones)
        expect(historico.body.calificacionPromedio).to.be.closeTo(stats.body.summary.promedio, 0.01)
      })
    })
  })

  it('RQ22 ≡ RQ25: las evaluaciones del docente por curso suman su total', () => {
    pedirComoCoordinador(`/api/coordinador/profesor-stats/${profesorId}?period=${periodo()}`).then((r) => {
      const porCurso = r.body.courses.reduce((acc: number, c: any) => acc + c.totalEvaluaciones, 0)
      expect(porCurso).to.eq(r.body.summary.totalEvaluaciones)
    })
  })

  it('RQ23: el total del periodo nunca supera el total sin filtro de periodo', () => {
    pedirComoCoordinador(`/api/coordinador/reports-overview?period=${periodo()}`).then((delPeriodo) => {
      pedirComoCoordinador('/api/coordinador/reports-overview').then((todos) => {
        expect(delPeriodo.body.summary.totalEvaluaciones).to.be.at.most(todos.body.summary.totalEvaluaciones)
      })
    })
  })

  it('RQ24: el docente aparece en las filas del reporte (RQ25) si tiene evaluaciones en el periodo', () => {
    pedirComoCoordinador(`/api/coordinador/profesor-stats/${profesorId}?period=${periodo()}`).then((stats) => {
      if (!stats.body.summary.totalEvaluaciones) return
      pedirComoCoordinador(`/api/coordinador/reports-overview?period=${periodo()}`).then((reporte) => {
        const docentes = reporte.body.reportRows.map((f: any) => String(f.DOCENTE).toUpperCase())
        expect(docentes).to.include(String(stats.body.profesor.nombre).toUpperCase())
      })
    })
  })
})

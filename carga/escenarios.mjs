/**
 * Endpoints de RQ18, RQ19 y RQ22–RQ25 con su criterio de aceptación.
 * - estado: código(s) HTTP esperados (un 401 esperado NO cuenta como error).
 * - p95Ms: el 95 % de las respuestas debe llegar antes de este tiempo.
 * - maxErroresPct: porcentaje máximo de respuestas inesperadas, timeouts o fallos de red.
 */
export function escenarios({ periodo, profesorId, qrToken }) {
  return [
    {
      nombre: 'health',
      requisito: 'base',
      ruta: '/health',
      auth: false,
      estado: 200,
      p95Ms: 1_000,
      maxErroresPct: 1,
    },
    {
      nombre: 'sin-token-401',
      requisito: 'RQ19',
      ruta: '/api/coordinador/dashboard-summary',
      auth: false,
      estado: 401,
      p95Ms: 1_000,
      maxErroresPct: 0,
    },
    {
      // 429 también es correcto: es lo que respondería el login con límite de intentos (DEF-34).
      nombre: 'login-invalido',
      requisito: 'RQ19',
      ruta: '/api/auth/login',
      metodo: 'POST',
      cuerpo: { email: 'carga-inexistente@udemedellin.edu.co', password: 'No-Existe2026!' },
      auth: false,
      estado: [401, 429],
      p95Ms: 2_000,
      maxErroresPct: 1,
    },
    {
      nombre: 'dashboard-summary',
      requisito: 'RQ24',
      ruta: '/api/coordinador/dashboard-summary?page=1&pageSize=8',
      auth: true,
      estado: 200,
      p95Ms: 3_000,
      maxErroresPct: 1,
    },
    {
      nombre: 'reports-overview',
      requisito: 'RQ23/RQ25',
      ruta: `/api/coordinador/reports-overview?period=${periodo}`,
      auth: true,
      estado: 200,
      p95Ms: 8_000,
      maxErroresPct: 1,
    },
    ...(profesorId
      ? [
          {
            nombre: 'profesor-stats',
            requisito: 'RQ22',
            ruta: `/api/coordinador/profesor-stats/${profesorId}?period=${periodo}`,
            auth: true,
            estado: 200,
            p95Ms: 3_000,
            maxErroresPct: 1,
          },
        ]
      : []),
    ...(qrToken
      ? [
          {
            nombre: 'qr-imagen',
            requisito: 'RQ18',
            ruta: `/api/qr-evaluaciones/${encodeURIComponent(qrToken)}/imagen.png`,
            auth: false,
            estado: 200,
            p95Ms: 2_000,
            maxErroresPct: 1,
          },
        ]
      : []),
  ]
}

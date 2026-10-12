/**
 * Endpoints de RQ18, RQ19 y RQ22–RQ25 con su criterio de aceptación.
 * - estado: código(s) HTTP esperados (un 401 esperado NO cuenta como error).
 * - p95Ms: el 95 % de las respuestas debe llegar antes de este tiempo.
 * - maxErroresPct: porcentaje máximo de respuestas inesperadas, timeouts o fallos de red.
 */
export function escenarios({ periodo, profesorId, qrToken, loginEmail, loginPassword, crearUsuarios }) {
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
    // ---- RQ1–RQ5: autenticación y recuperación de contraseña (ESCENARIOS=rq1-rq5) ----
    ...(loginEmail && loginPassword
      ? [
          {
            nombre: 'login-valido',
            requisito: 'RQ2',
            grupo: 'rq1-rq5',
            ruta: '/api/auth/login',
            metodo: 'POST',
            cuerpo: { email: loginEmail, password: loginPassword },
            auth: false,
            // 200: login normal. Una cuenta con varios roles también responde 200 (pide elegir rol).
            estado: 200,
            // bcrypt con 12 rondas (~300 ms) + 2-3 consultas a Supabase.
            p95Ms: 2_500,
            maxErroresPct: 1,
          },
        ]
      : []),
    {
      nombre: 'forgot-password',
      requisito: 'RQ3.1',
      grupo: 'rq1-rq5',
      ruta: '/api/auth/forgot-password',
      metodo: 'POST',
      // Correo inexistente: no genera token ni envía correo (no se hace spam a nadie).
      cuerpo: { email: 'carga-inexistente@soyudemedellin.edu.co' },
      auth: false,
      estado: [200, 429],
      p95Ms: 2_000,
      maxErroresPct: 1,
    },
    {
      nombre: 'validate-reset-token',
      requisito: 'RQ3.4',
      grupo: 'rq1-rq5',
      ruta: '/api/auth/validate-reset-token/token-inexistente-de-carga?email=carga-inexistente@soyudemedellin.edu.co',
      auth: false,
      estado: [400, 429],
      p95Ms: 1_500,
      maxErroresPct: 1,
    },
    {
      nombre: 'reset-password-token-invalido',
      requisito: 'RQ5',
      grupo: 'rq1-rq5',
      ruta: '/api/auth/reset-password',
      metodo: 'POST',
      cuerpo: { token: 'token-inexistente-de-carga', email: 'carga-inexistente@soyudemedellin.edu.co', newPassword: 'Nueva-Clave2026!', confirmPassword: 'Nueva-Clave2026!' },
      auth: false,
      estado: [400, 429],
      p95Ms: 1_500,
      maxErroresPct: 1,
    },
    {
      nombre: 'create-user-sin-token',
      requisito: 'RQ1',
      grupo: 'rq1-rq5',
      ruta: '/api/auth/create-user',
      metodo: 'POST',
      cuerpo: { email: 'x@udemedellin.edu.co', password: 'Clave-Segura2026!', nombre: 'X', apellido: 'Y', tipo_usuario: 'profesor' },
      auth: false,
      estado: 401,
      p95Ms: 1_000,
      maxErroresPct: 0,
    },
    // Crea usuarios REALES: solo con CREAR_USUARIOS=true, TOKEN_FILE de un admin y, por seguridad, contra localhost.
    ...(crearUsuarios
      ? [
          {
            nombre: 'create-user',
            requisito: 'RQ1',
            grupo: 'rq1-rq5',
            ruta: '/api/auth/create-user',
            metodo: 'POST',
            // Función: cada petición genera un correo único.
            cuerpo: () => ({
              email: `carga.${Date.now()}.${Math.floor(Math.random() * 1e6)}@udemedellin.edu.co`,
              password: 'Clave-Segura2026!',
              nombre: 'Carga',
              apellido: 'Prueba',
              tipo_usuario: 'profesor',
            }),
            auth: true,
            estado: 201,
            p95Ms: 3_000,
            maxErroresPct: 1,
          },
        ]
      : []),
  ]
}

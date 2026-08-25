/** Contrato OpenAPI mínimo para V&V (documentación viva). */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'EntreAulas API',
    version: '0.1.0',
    description:
      'API modular Cliente-Servidor: auth, academic, evaluations, analytics, ai-summary.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        security: [],
        summary: 'Health check',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ok: { type: 'boolean' } },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        security: [],
        summary: 'Solicitar recuperación de contraseña',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Mensaje genérico (no revela si el correo existe)' },
          '400': { description: 'Correo inválido' },
          '503': { description: 'SMTP no configurado' },
        },
      },
    },
    '/api/auth/reset-password': {
      post: {
        security: [],
        summary: 'Restablecer contraseña con token de recuperación',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'email', 'newPassword', 'confirmPassword'],
                properties: {
                  token: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  newPassword: { type: 'string' },
                  confirmPassword: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Contraseña actualizada' },
          '400': { description: 'Token inválido/expirado o contraseña débil' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        security: [],
        summary: 'Login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'JWT + usuario' },
          '401': { description: 'Credenciales inválidas' },
        },
      },
    },
    '/api/evaluations/questions': {
      get: {
        summary: 'Listar preguntas de evaluación',
        responses: { '200': { description: 'Preguntas activas' } },
      },
    },
    '/api/evaluaciones': {
      get: {
        summary: 'Evaluaciones del estudiante autenticado',
        responses: { '200': { description: 'Lista de evaluaciones' } },
      },
    },
    '/api/resultados/estadisticas': {
      get: {
        summary: 'Estadísticas agregadas de resultados',
        responses: { '200': { description: 'Métricas' } },
      },
    },
    '/api/courses/by-career/{careerId}': {
      get: {
        summary: 'Cursos por carrera (coordinador)',
        parameters: [
          {
            name: 'careerId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: { '200': { description: 'Lista de cursos' } },
      },
    },
    '/api/users': {
      get: {
        summary: 'Listado de usuarios (admin)',
        responses: { '200': { description: 'Usuarios sin password' } },
      },
    },
    '/api/ai/summarize': {
      post: {
        summary: 'Resumen IA de respuestas abiertas (Strategy: Gemini → Local)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['texts'],
                properties: {
                  texts: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'summary + topics' } },
      },
    },
    '/api/teachers': {
      get: {
        summary: 'Listado / dominio académico de profesores',
        responses: { '200': { description: 'Profesores' } },
      },
    },
    '/api/coordinador/dashboard-summary': {
      get: {
        summary: 'Resumen dashboard coordinador (analytics)',
        responses: { '200': { description: 'KPIs' } },
      },
    },
  },
} as const

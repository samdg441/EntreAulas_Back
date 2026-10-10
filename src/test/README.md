# Pruebas Backend

Framework: **Vitest** + **Supertest** (HTTP sobre la `app` real de Express, con Supabase simulado)
y **Cypress** para la API real (`e2e/`, caja negra contra el back local o Render).

```
EntreAulas_Back/
├── src/test/
│   ├── unit/            → Lógica por requisito, agrupada por dominio (acceso, qr, reportes, ...)
│   ├── integration/     → Flujos HTTP completos de RQ10, RQ11, RQ13, RQ29, RQ31
│   ├── regression/      → Una prueba por requisito que protege lo ya entregado (RQ6–RQ31)
│   ├── api/             → Contrato HTTP de RQ18, RQ19, RQ22–RQ25: estados, cuerpos y
│   │                      argumentos exactos que llegan al servicio
│   ├── security/        → JWT manipulado, roles, enumeración en login, inyección en
│   │                      entradas, CORS, límite de tamaño, cabeceras
│   ├── performance/     → Presupuestos de tiempo (config propia, no corre en CI)
│   ├── defects/         → Defectos abiertos: fallan a propósito (config propia)
│   ├── helpers/         → sesion-http.ts (JWT real + usuario simulado), medicion.ts,
│   │                      supabase-mock.ts, dobles y validadores
│   ├── fixtures/        → Usuarios y datos estáticos
│   ├── HALLAZGOS.md     → Registro de defectos DEF-01…DEF-38
│   └── setup.ts
├── e2e/                 → Cypress (proyecto aparte: npm ci del back no lo descarga)
│   └── cypress/e2e/{api,regresion,defectos}
├── carga/               → Prueba de carga sin dependencias (usuarios concurrentes por etapas)
├── reports/             → Salida de rendimiento, carga y Cypress (excluida de Git)
└── docs/pruebas/INFORME-RQ18-RQ25.md → Resultados, métricas e interpretación
```

## Qué corre en cada comando

| Comando | Qué ejecuta | ¿En `npm test` / Jenkins? |
|---|---|---|
| `npm test` / `npm run test:coverage` | unit, integration, regression, api, security | Sí |
| `npm run test:regression` · `test:api` · `test:security` | Una sola carpeta | — |
| `npm run test:performance` | `performance/` → `reports/rendimiento/*.json` | No: depende del equipo |
| `npm run test:defects` | `defects/` (rojo esperado mientras el defecto siga abierto) | No |
| `npm run test:carga` | `carga/carga-api.mjs` contra Render o `API_URL` → `reports/carga/` | No: usa la red real |
| `npm run test:e2e` | Levanta el back local y corre Cypress | No |

`api/` y `security/` usan el JWT real (`authenticateToken` firma y verifica de verdad); solo se
simula la base. Por eso los roles se prueban como en producción: salen de la base, no del token.

## Matriz requisito → nivel (RQ18–RQ25)

| Requisito | unit | regression | api | security | performance | Cypress (API real) | Defectos |
|---|---|---|---|---|---|---|---|
| RQ18 QR | `qr/rq18-validar-qr` | ✓ | `rq18-qr` | CRLF/Bcc en correo, 413 | PNG con logo | `api/rq18-qr` | DEF-32, DEF-37 |
| RQ19 Acceso por rol | `acceso/rq19-redirigir-dashboard` | ✓ | `rq19-login-dashboard` | JWT, roles, login | middleware x50 | `api/rq19-autenticacion` | DEF-34, DEF-38 |
| RQ22 Métricas | `evaluaciones/rq22-metricas-evaluacion` | ✓ | `rq22-rq25-coordinador` | escala de promedios | 100k notas | contrato + coherencia | DEF-31 |
| RQ23 Histórico | `evaluaciones/rq23-estadisticas-historicas` | ✓ | ✓ | periodos maliciosos | 100k evaluaciones | coherencia RQ22≡RQ23 | DEF-33 |
| RQ24 Resumen coordinador | `reportes/rq24-resumen-coordinador` | ✓ | ✓ | paginación, búsqueda | 500 docentes / 50k, escala lineal | contrato | — |
| RQ25 Reporte | `reportes/rq25-exportar-reporte` | ✓ | ✓ | permisos de exportación | 5k filas | filas exportables | DEF-36 |
| Transversal | — | — | — | CORS, `x-powered-by` | — | CORS | DEF-35 |

## Cómo correrlas

```bash
npm test
npm run test:coverage
npm run test:performance
npm run test:defects

# Carga: el token va en un archivo, nunca en la línea de comandos
TOKEN_FILE=/ruta/token.txt PROFESOR_ID=13 ETAPAS=1,5,10 DURACION_S=20 npm run test:carga

# Cypress (una vez): instalar el binario
cd e2e && npm install && npx cypress install
npm run test:e2e                                   # back local
API_URL=https://entreaulas-back.onrender.com CYPRESS_TOKEN_COORDINADOR="$(cat /ruta/token.txt)" npm --prefix e2e run cy:run
npm --prefix e2e run cy:defectos                   # rojo esperado
```

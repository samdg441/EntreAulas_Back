# Registro de defectos (V&V)

Defectos detectados durante la validación de los requisitos RQ18–RQ24.
Cada uno tiene una prueba ejecutable que **falla mientras el defecto siga abierto**.

```bash
npm run test:defects
```

Esta suite está separada de la de requisitos a propósito: `npm test` valida el
alcance entregado (verde) y `npm run test:defects` reporta los defectos
encontrados (rojo). Un defecto se cierra cuando su prueba pasa a verde.

## Resumen

| ID | Defecto | RQ | Severidad | Estado |
|----|---------|----|-----------|--------|
| DEF-01 | Rango de fechas inválido (`2026-06-31`) | RQ23 | Media | ABIERTO |
| DEF-02 | Un profesor lee estadísticas de otro | RQ22 | **Alta** | ABIERTO |
| DEF-03 | Paginación no numérica devuelve `null` | RQ24 | Media | ABIERTO |
| DEF-04 | `period` no se valida | RQ23 | Media | ABIERTO |
| DEF-05 | Roles sensibles a mayúsculas | RQ19 | Media | ABIERTO |
| DEF-06 | Un `docente` no accede a sus métricas | RQ22 | Media | ABIERTO |
| DEF-07 | Dos promedios distintos para el mismo profesor | RQ22/RQ24 | **Alta** | ABIERTO |
| DEF-08 | Evaluaciones anónimas cuentan como 1 estudiante | RQ23 | Baja | ABIERTO |
| DEF-13 | El endpoint de QR no exige autenticación | RQ18 | Media | ABIERTO |

Técnica de detección: análisis de valores límite y particiones de equivalencia
sobre los parámetros de entrada, y pruebas de consistencia entre endpoints que
calculan la misma métrica.

Los defectos de la capa de presentación (DEF-09 a DEF-12) están en
`EntreAulas_Front/src/test/HALLAZGOS.md`.

---

## DEF-01 — Rango de fechas inválido en estadísticas históricas

| Campo | Valor |
|---|---|
| Requisito afectado | RQ23 — Consultar estadísticas históricas |
| Severidad | Media |
| Prioridad | Baja |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-01-rango-fechas-invalido.test.ts` |
| Archivo | `src/modules/analytics/teachers-analytics.routes.ts:182` |

**Descripción.** Cuando el profesor consultado no existe, el endpoint devuelve datos
simulados con un rango de fechas construido en una rama de código duplicada. Para el
primer semestre genera `AAAA-06-31`, una fecha que no existe: junio tiene 30 días.

**Pasos para reproducir.** `GET /api/teachers/999/stats/historical?period=2026-1`

**Resultado esperado.** `dateRange.end = "2026-06-30"`
**Resultado obtenido.** `dateRange.end = "2026-06-31"`

**Causa raíz.** El cálculo de fechas está duplicado en dos ramas del mismo handler.
La rama normal (línea 221) usa `'06-30'`; la rama de datos simulados (línea 182)
quedó con `'06' ... '-31'`. Se corrigió una copia y no la otra.

**Corrección propuesta.** Extraer el cálculo del rango a una única función
`calcularRangoPeriodo(period)` y usarla en ambas ramas.

---

## DEF-02 — Un profesor accede a las estadísticas de otro profesor

| Campo | Valor |
|---|---|
| Requisito afectado | RQ22 — Calcular métricas de evaluación |
| Severidad | Alta (control de acceso) |
| Prioridad | Alta |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-02-acceso-stats-otro-profesor.test.ts` |
| Archivo | `src/modules/analytics/teachers-analytics.routes.ts:810` |

**Descripción.** El endpoint valida que el usuario autenticado **sea** profesor, pero
no verifica que el `:teacherId` de la URL le pertenezca. Cualquier profesor puede leer
las calificaciones de cualquier otro cambiando el número en la URL. Corresponde a la
categoría *Broken Access Control* (OWASP A01) y al patrón conocido como IDOR.

**Pasos para reproducir.** Autenticado como profesor con `id = 7`,
solicitar `GET /api/teachers/teacher-stats/999`.

**Resultado esperado.** `403 Forbidden`
**Resultado obtenido.** `200 OK` con las calificaciones del profesor 999.

**Causa raíz.** La comprobación de autorización es por rol (`tipo_usuario`) y no por
propiedad del recurso.

**Corrección propuesta.** Resolver el `profesor.usuario_id` del `:teacherId`
solicitado y compararlo con `req.user.id`; permitir el acceso ajeno solo a
coordinador, decano o admin.

---

## DEF-03 — Paginación con valores no numéricos devuelve `null`

| Campo | Valor |
|---|---|
| Requisito afectado | RQ24 — Ver resumen del coordinador |
| Severidad | Media |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-03-paginacion-no-numerica.test.ts` |
| Archivo | `src/modules/analytics/coordinador.routes.ts:62` |

**Descripción.** `Math.max(1, Number('abc'))` no devuelve 1 sino `NaN`, porque
`Math.max` propaga `NaN`. Al serializar la respuesta, `NaN` se convierte en `null`.

**Pasos para reproducir.** `GET /api/coordinador/dashboard-summary?pageSize=abc`

**Resultado esperado.** 400, o los valores por defecto (`page: 1`, `pageSize: 8`).
**Resultado obtenido.** `200` con `pagination: { page: null, pageSize: null, total: 1, totalPages: null }`.

**Corrección propuesta.** Validar con `Number.isFinite()` antes de aplicar los
límites, y caer al valor por defecto si la entrada no es un número.

---

## DEF-04 — El parámetro `period` no se valida

| Campo | Valor |
|---|---|
| Requisito afectado | RQ23 — Consultar estadísticas históricas |
| Severidad | Media |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-04-periodo-sin-validar.test.ts` |
| Archivo | `src/modules/analytics/teachers-analytics.routes.ts:218` |

**Descripción.** `period` se parte por `-` y se interpola directamente en el rango
de fechas sin comprobar formato. Cualquier texto se acepta.

**Pasos para reproducir.**
1. `?period=DROP-TABLE` → `dateRange: { start: "DROP-07-01", end: "DROP-12-31" }`, y el valor se refleja tal cual en la respuesta.
2. `?period=2026-9` → se interpreta silenciosamente como segundo semestre.

**Resultado esperado.** `400` con un mensaje de formato inválido.
**Resultado obtenido.** `200` con un rango de fechas sin sentido.

**Corrección propuesta.** Validar contra `/^\d{4}-[12]$/` y responder 400 si no coincide.
Nota: el endpoint hermano `/coordinador/reports-overview` sí valida el semestre
(`semester === 1 || semester === 2`), así que la lógica correcta ya existe en el
proyecto y solo hace falta unificarla.

---

## DEF-05 — La resolución de dashboard distingue mayúsculas en los roles

| Campo | Valor |
|---|---|
| Requisito afectado | RQ19 — Redirigir al dashboard según el rol |
| Severidad | Media |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-05-roles-sensibles-mayusculas.test.ts` |
| Archivo | `src/modules/auth/role.service.ts:265` |

**Descripción.** `roles.includes('admin')` compara de forma exacta, mientras que
el fallback por `tipo_usuario` sí normaliza con `.toLowerCase()`. La misma
función trata el dato de dos maneras distintas.

**Resultado esperado.** Rol `'Admin'` → `/dashboard-admin`.
**Resultado obtenido.** `/dashboard`.

**Corrección propuesta.** Normalizar los roles a minúsculas al leerlos, o comparar
con `roles.some(r => r.toLowerCase() === 'admin')`.

---

## DEF-06 — Un usuario con tipo `docente` no accede a sus métricas

| Campo | Valor |
|---|---|
| Requisito afectado | RQ22 — Calcular métricas de evaluación |
| Severidad | Media |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-06-docente-rechazado.test.ts` |
| Archivo | `src/modules/analytics/teachers-analytics.routes.ts:810` |

**Descripción.** `RoleService.obtenerDashboardUsuario` considera `'profesor'` y
`'docente'` equivalentes y envía a ambos a `/dashboard-profesor`, pero el endpoint
de métricas exige `tipo_usuario === 'profesor'` exacto. Un docente llega a su
dashboard y este falla al cargar los datos.

**Resultado esperado.** `200` con sus métricas.
**Resultado obtenido.** `403 Solo los profesores pueden acceder a estas estadísticas`.

**Corrección propuesta.** Centralizar la comprobación en un helper
`esProfesor(user)` que acepte ambos valores y usarlo en todos los endpoints.

---

## DEF-07 — El mismo profesor tiene dos promedios distintos según el dashboard

| Campo | Valor |
|---|---|
| Requisitos afectados | RQ22 y RQ24 |
| Severidad | Alta |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-07-promedio-inconsistente.test.ts` |
| Archivos | `teachers-analytics.routes.ts:896` y `coordinador.routes.ts:141` |

**Descripción.** Una evaluación con `calificacion_promedio = null` se trata de
forma distinta en cada endpoint. Las métricas del profesor la suman como 0 y la
cuentan en el divisor; el resumen del coordinador la descarta (`cal <= 0`).

**Pasos para reproducir.** Un profesor con dos evaluaciones completadas, una
calificada con 5 y otra sin calificar.

**Resultado esperado.** El mismo promedio en ambas vistas.
**Resultado obtenido.** El profesor ve **2.5** y su coordinador ve **5.0** del mismo docente.

**Impacto.** Es el defecto de mayor impacto funcional: afecta la toma de decisiones
sobre desempeño docente y el indicador de "profesores en riesgo", que usa el umbral
`promedio < 4`.

**Corrección propuesta.** Definir una única regla de negocio para las evaluaciones
sin calificar (excluirlas del cálculo es lo razonable) y extraerla a una función
compartida entre ambos módulos.

---

## DEF-08 — Las evaluaciones sin estudiante cuentan como un estudiante

| Campo | Valor |
|---|---|
| Requisito afectado | RQ23 — Consultar estadísticas históricas |
| Severidad | Baja |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-08-estudiantes-anonimos.test.ts` |
| Archivo | `src/modules/analytics/teachers-analytics.routes.ts:258` |

**Descripción.** `new Set(evaluaciones.map(e => e.estudiante_id))` incluye `null`
como si fuera un identificador más.

**Resultado esperado.** Dos evaluaciones anónimas → `totalEstudiantes: 0`.
**Resultado obtenido.** `totalEstudiantes: 1`.

**Corrección propuesta.** Filtrar los nulos antes de construir el conjunto.

---

## DEF-13 — El endpoint de QR no exige autenticación

| Campo | Valor |
|---|---|
| Requisito afectado | RQ18 — Validar QR vencido o inválido |
| Severidad | Media |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-13-qr-sin-autenticacion.test.ts` |
| Archivo | `src/modules/evaluations/qr-evaluaciones.routes.ts:371` |

**Descripción.** `GET /qr-evaluaciones/:token` es la única ruta del módulo que no
lleva `authenticateToken`. Las otras tres (`/batch`, `/share-email`,
`/:token/auto-enroll`) sí lo exigen.

Lo relevante es la **inconsistencia entre capas**: el frontend sí obliga a iniciar
sesión antes de llamar a este endpoint (es el camino C2 del grafo de RQ18), de modo
que las dos capas aplican reglas de seguridad distintas para la misma operación. La
protección vive solo en el cliente, que es justamente donde no se puede confiar.

**Pasos para reproducir.** `GET /api/qr-evaluaciones/<token>` sin cabecera `Authorization`.

**Resultado esperado.** `401 Unauthorized`.
**Resultado obtenido.** `200` con nombre del docente, curso y grupo.

**Corrección propuesta.** Añadir `authenticateToken` a la ruta. Si el acceso anónimo
fuera un requisito deliberado, debe documentarse y limitar los datos expuestos.

---

## Limitación conocida del alcance de las pruebas

No es un defecto del producto, sino del método, y debe declararse:

El doble de Supabase (`helpers/query-builder.ts`) ignora los filtros de consulta
(`eq`, `gte`, `lte`, `in`): siempre devuelve el resultado que la prueba encoló para esa
tabla. Por lo tanto **las pruebas unitarias no verifican la corrección de las consultas**,
solo la lógica de decisión y de cálculo del endpoint. Detectar un filtro mal escrito
requiere pruebas de integración contra una base de datos real, nivel de prueba que hoy
no está implementado.

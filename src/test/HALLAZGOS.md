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
| DEF-04 | `period` no se valida (vacío, 2026, 2026-9, DROP-TABLE) | RQ23 | Media | ABIERTO |
| DEF-05 | Roles sensibles a mayúsculas | RQ19 | Media | ABIERTO |
| DEF-06 | Un `docente` no accede a sus métricas | RQ22 | Media | ABIERTO |
| DEF-07 | Dos promedios distintos para el mismo profesor | RQ22/RQ24 | **Alta** | ABIERTO |
| DEF-08 | Evaluaciones anónimas cuentan como 1 estudiante | RQ23 | Baja | ABIERTO |
| DEF-13 | El endpoint de QR no exige autenticación | RQ18 | Media | ABIERTO |
| DEF-14 | El QR nunca caduca: no existe vencimiento | RQ18 | **Alta** | ABIERTO |
| DEF-15 | Fechas imposibles aceptadas al generar QR | RQ18 | Media | ABIERTO |
| DEF-16 | login-with-role sin rol responde 401 de credenciales | RQ19 | Media | ABIERTO |
| DEF-17 | Promedio fuera de escala (null, negativo, 99) | RQ22 | **Alta** | ABIERTO |
| DEF-18 | Promedio histórico fuera de escala | RQ23 | **Alta** | ABIERTO |
| DEF-19 | Resumen coordinador publica promedio 99 | RQ24 | Media | ABIERTO |
| DEF-20 | Rol `Coordinador` recibe 403 en el resumen | RQ24 | Media | ABIERTO |

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

**Descripción.** `period` se parte por `-` y se interpola en el rango de fechas
sin comprobar formato ni obligatoriedad. Casos medidos:

| Query | Resultado actual |
|-------|------------------|
| `?period=DROP-TABLE` | 200, rango `DROP-07-01` … `DROP-12-31` |
| `?period=2026-9` | 200, se toma como segundo semestre |
| sin `period` o `period=` | 200, `period: "all"`, busca 2020-01-01 … 2030-12-31 |
| `?period=2026` | 200, se interpreta como 2026-2 (`07-01` … `12-31`) |

Un período *sin filas* (p. ej. `2099-1`) sí responde 200 con ceros: no hay tabla
de períodos, solo se fabrica un rango. Eso no es un error de formato; el vacío y
el malformado sí.

**Resultado esperado.** `400` si falta o no cumple `/^\d{4}-[12]$/`.
**Resultado obtenido.** `200` con un rango inventado o con el histórico de una
década (`all`).

**Corrección propuesta.** Validar contra `/^\d{4}-[12]$/` (el endpoint
`/coordinador/reports-overview` ya distingue semestre 1 o 2) y exigir el query.

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

## DEF-14 — El QR nunca caduca: el vencimiento no existe en el producto

| Campo | Valor |
|---|---|
| Requisito afectado | RQ18 — Validar QR **vencido** o inválido |
| Severidad | Alta |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-14-qr-sin-caducidad.test.ts` |
| Archivo | `src/modules/evaluations/qr-evaluaciones.routes.ts:406` |

**Descripción.** El requisito se llama "Validar QR vencido o inválido", pero en el
producto no existe el concepto de vencimiento. La consulta de validación solo aplica
dos filtros, `.eq('token', token)` y `.eq('activo', true)`; no hay ninguna comparación
de fechas en todo el módulo. Un QR solo deja de servir si alguien pone `activo = false`
a mano en la base de datos.

Lo que convierte esto en un defecto y no en una decisión de diseño es que **la ventana
de vigencia sí se le pide al usuario y se descarta en silencio**, en tres puntos:

1. `AdminQrPage.tsx:212` y `ScheduleSurveys.tsx:258` (frontend) bloquean el envío si el
   coordinador no escribe fecha de inicio y fecha de cierre.
2. `evaluations.api.ts:17` (frontend) envía al backend únicamente `{ grupoIds }`; las
   fechas nunca salen del navegador.
3. `qr-evaluaciones.routes.ts:194-203` (backend) inserta la fila con `token`,
   `profesor_id`, `curso_id`, `grupo_id`, `activo` y opcionalmente `periodo_id`. Aunque
   las fechas llegaran, no se guardarían. El comentario de la ruta (línea 12) sí las
   documenta como parte del cuerpo esperado.

**Pasos para reproducir.** Generar un QR para un grupo con fecha de cierre en el pasado.
Escanearlo después de esa fecha.

**Resultado esperado.** `404 QR inválido o expirado.`
**Resultado obtenido.** `200` con los datos del docente; la encuesta se abre y admite la
evaluación. Un QR impreso sigue vigente semestres después.

**Impacto.** Se pueden registrar evaluaciones fuera del período habilitado, lo que
contamina las métricas de RQ22, RQ23 y RQ24 con datos de períodos ya cerrados.

**Corrección propuesta.** Persistir `fecha_inicio` y `fecha_fin` al crear el QR, enviarlas
desde el cliente, y añadir el filtro temporal a la consulta de validación. Si se decide
que la vigencia se controla solo con `activo`, deben retirarse los campos de fecha de las
pantallas de generación para no prometer un comportamiento que no existe.

**Nota sobre la cobertura de RQ18.** El caso C3 del grafo cubre "QR inválido o expirado"
como un único camino porque el código no distingue ambas situaciones: token inexistente y
token desactivado producen la misma consulta sin resultados. La rama "vencido por fecha"
no es alcanzable por ninguna prueba mientras el mecanismo no exista.

---

## DEF-15 — La generación de QR acepta fechas imposibles y rangos invertidos

| Campo | Valor |
|---|---|
| Requisito afectado | RQ18 — Validar QR vencido o inválido |
| Severidad | Media |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-15-fechas-qr-sin-validar.test.ts` |
| Archivo | `src/modules/evaluations/qr-evaluaciones.routes.ts:16` |

**Descripción.** `POST /qr-evaluaciones/batch` documenta `startDate` y `endDate` en su
cabecera (línea 12), pero no ejecuta ninguna validación sobre ellas. La única comprobación
del cuerpo es que `grupoIds` sea un arreglo no vacío de números.

La única barrera que existe hoy contra una fecha mal formada es el widget
`<input type="date">` del navegador, que descarta el valor y lo deja vacío. Se verificó
empíricamente: asignar `2026-13-01` o `2026-01--1` al input deja el campo en `""`, y
entonces sí lo atrapa la comprobación de campos vacíos del formulario
(`AdminQrPage.tsx:212`, `ScheduleSurveys.tsx:258`).

Esa protección es del navegador, no del producto, y no aplica a ningún cliente que no sea
ese widget. Además **no cubre el rango invertido**: `2026-12-31` como inicio y `2026-01-01`
como cierre son dos fechas válidas, el input las acepta, y ningún código las compara entre
sí. Se verificó que el formulario habilita el envío con esa combinación.

**Pasos para reproducir.**

```
POST /api/qr-evaluaciones/batch
{ "grupoIds": [1], "period": "2026-1", "startDate": "2026-13-01", "endDate": "2026-01--1" }
```

**Resultado esperado.** `400` indicando que las fechas no son válidas.
**Resultado obtenido.** `201 Created` con los QR generados. Idéntico resultado con la
ventana invertida.

**Impacto.** Hoy está enmascarado por DEF-14: como las fechas no se persisten ni se
consultan, aceptarlas mal no cambia el comportamiento observable. Es un **defecto
latente**: en cuanto se corrija DEF-14 y la vigencia empiece a aplicarse, una ventana
invertida dejaría el QR inservible desde el momento de crearlo, o vigente para siempre,
según cómo se escriba el filtro.

**Corrección propuesta.** Validar en el servidor que ambas fechas existan, tengan formato
`YYYY-MM-DD` y correspondan a una fecha real, y que `startDate <= endDate`. Añadir la misma
comparación en el formulario para dar retroalimentación inmediata, sin que sustituya a la
del servidor.

---

## DEF-16 — `login-with-role` sin rol responde como credenciales inválidas

| Campo | Valor |
|---|---|
| Requisito afectado | RQ19 — Redirigir al dashboard según el rol |
| Severidad | Media |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-16-login-sin-rol-seleccionado.test.ts` |
| Archivo | `src/modules/auth/auth.routes.ts:258` y `:288` |

**Descripción.** El flujo de roles múltiples pide un segundo paso: `POST /auth/login-with-role`
con `selectedRole`. Si ese campo falta o va vacío, el handler no valida el cuerpo. Cae en
`roles.includes(selectedRole)` (falso para `undefined` y `""`) y responde **401
"Credenciales inválidas"**, el mismo mensaje que una contraseña incorrecta.

El login principal (`POST /auth/login`) sí rechaza al usuario sin rol ni tipo válido con
401 "Tipo de usuario no válido". Esta prueba cubre el hueco del segundo endpoint.

**Pasos para reproducir.** Usuario con varios roles; `POST /api/auth/login-with-role` con
email y contraseña correctos, sin `selectedRole`.

**Resultado esperado.** `400` indicando que el rol es obligatorio.
**Resultado obtenido.** `401 { "error": "Credenciales inválidas" }`.

**Corrección propuesta.** Validar `selectedRole` antes de consultar roles. Distinguir
"falta el rol" (400) de "el usuario no tiene ese rol" (403) y de "credenciales malas" (401).

---

## DEF-17 — El promedio de métricas no se acota a la escala 1–5

| Campo | Valor |
|---|---|
| Requisito afectado | RQ22 — Calcular métricas de evaluación |
| Severidad | Alta |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-17-promedio-fuera-de-escala.test.ts` |
| Archivo | `src/modules/analytics/teachers-analytics.routes.ts:895` |
| Relacionado | DEF-07 (null como 0 vs descartado) y DEF-12 (frontend muestra 99/5.0) |

**Descripción.** El GET de métricas hace `sum + (e.calificacion_promedio || 0)` y no
comprueba el rango. El POST de evaluaciones sí declara `z.number().min(1).max(5)`,
así que la escala existe en el producto y este endpoint no la aplica.

Verificado empíricamente:

| Entrada | Promedio publicado |
|---------|-------------------|
| `[]` (sin evaluaciones) | `0` — correcto, no lanza |
| `null` + `5` | `2.5` (el null cuenta como 0) |
| `-3` | `-3` |
| `99` | `99` |

**Resultado esperado.** Promedio en `[1, 5]` (o `0` si no hay calificaciones válidas);
un `null` no entra en el promedio.
**Resultado obtenido.** Se publican `-3`, `99` y `2.5`.

**Corrección propuesta.** Filtrar `null`/`undefined` y valores fuera de 1–5 antes de
promediar. Si tras el filtro no queda nada, devolver `0` y no inflar `totalEvaluaciones`
con filas inválidas.

---

## DEF-18 — El promedio histórico no se acota a la escala 1–5

| Campo | Valor |
|---|---|
| Requisito afectado | RQ23 — Consultar estadísticas históricas |
| Severidad | Alta |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-18-historico-fuera-de-escala.test.ts` |
| Archivo | `src/modules/analytics/teachers-analytics.routes.ts:253` |
| Relacionado | DEF-17 (mismo cálculo en `teacher-stats`) |

**Descripción.** `GET /teachers/:id/stats/historical` usa
`sum + (calificacion_promedio || 0)`. Lista vacía y ceros no revientan (200 y 0).
Un `-2` se publica como `-2`; un `99` como `99`; un `null` junto a un `5` baja
el promedio a `2.5`.

**Resultado esperado.** Promedio en `[1, 5]` o `0` si no hay calificaciones válidas.
**Resultado obtenido.** Se publican `-2`, `99` y `2.5`.

**Corrección propuesta.** La misma que DEF-17: filtrar nulos y fuera de rango
antes de promediar.

---

## DEF-19 — El resumen del coordinador publica un promedio de 99

| Campo | Valor |
|---|---|
| Requisito afectado | RQ24 — Ver resumen del coordinador |
| Severidad | Media |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-19-coordinador-promedio-99.test.ts` |
| Archivo | `src/modules/analytics/coordinador.routes.ts:140` |
| Relacionado | DEF-17 / DEF-18 |

**Descripción.** Este endpoint **sí descarta** `null`, `0` y negativos (`cal <= 0`).
Eso es más estricto que RQ22. Un `99` pasa y se publica como `promedioEvaluaciones`
y como `teachers[].promedio`. Ese docente además no cuenta como “en riesgo”
(`promedio < 4`).

**Resultado esperado.** Promedio ≤ 5 (o 0 si no hay calificaciones válidas).
**Resultado obtenido.** `99`.

**Corrección propuesta.** Añadir `cal > 5` al `return` que ya ignora `cal <= 0`.

---

## DEF-20 — El rol `Coordinador` recibe 403 en el resumen

| Campo | Valor |
|---|---|
| Requisito afectado | RQ24 — Ver resumen del coordinador |
| Severidad | Media |
| Estado | ABIERTO |
| Evidencia | `defects/DEF-20-coordinador-rol-mayusculas.test.ts` |
| Archivo | `src/modules/analytics/coordinador.routes.ts:49` |
| Relacionado | DEF-05 |

**Descripción.** La guarda es
`!roles.includes('coordinador') && tipo_usuario !== 'coordinador'`.
Si el JWT trae `roles: ['Coordinador']` y `tipo_usuario: 'profesor'` (doble rol
con capitalización irregular), responde 403. Profesor y admin bien escritos
sí se rechazan (esperado).

**Resultado esperado.** Acceso igual que con `coordinador` en minúsculas.
**Resultado obtenido.** `403`.

**Corrección propuesta.** Normalizar roles a minúsculas, igual que DEF-05.

---

## Limitación conocida del alcance de las pruebas

No es un defecto del producto, sino del método, y debe declararse:

El doble de Supabase (`helpers/query-builder.ts`) ignora los filtros de consulta
(`eq`, `gte`, `lte`, `in`): siempre devuelve el resultado que la prueba encoló para esa
tabla. Por lo tanto **las pruebas unitarias no verifican la corrección de las consultas**,
solo la lógica de decisión y de cálculo del endpoint. Detectar un filtro mal escrito
requiere pruebas de integración contra una base de datos real, nivel de prueba que hoy
no está implementado.

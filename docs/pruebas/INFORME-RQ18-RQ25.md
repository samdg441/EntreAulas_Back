# Informe de pruebas del back — RQ18, RQ19, RQ22–RQ25

Fecha de ejecución: 10/10/2026 · Node 22.15 · Vitest 2.1.9 · Cypress 16.1.1
Back en producción: https://entreaulas-back.onrender.com (Render, plan gratuito) · Base: Supabase

Complementa `EntreAulas_Front/docs/pruebas/INFORME-RQ18-RQ25.md` (pantallas, componentes y
Cypress de interfaz). Aquí se prueba la API: lo que el back acepta, rechaza, calcula y aguanta.

## 1. Estrategia

| Nivel | Carpeta | Qué responde | Cuándo corre |
|---|---|---|---|
| Unitarias | `src/test/unit` | ¿La regla calcula bien? | Cada commit (Jenkins) |
| Regresión | `src/test/regression` | ¿Lo entregado sigue igual tras un cambio? | Cada commit |
| API (contrato) | `src/test/api` | ¿Estado, cuerpo y argumentos al servicio son los acordados? | Cada commit |
| Seguridad | `src/test/security` | ¿Un atacante consigue algo con JWT, roles o entradas raras? | Cada commit |
| Rendimiento | `src/test/performance` | ¿La lógica y la app caben en su presupuesto de tiempo? | A demanda |
| Carga | `carga/` | ¿Cómo se comporta el back real con usuarios simultáneos? | A demanda |
| API real (Cypress) | `e2e/` | ¿El contrato se cumple contra la base real? | A demanda / antes de entregar |
| Defectos | `src/test/defects` | ¿Siguen abiertos los defectos registrados? | A demanda (rojo esperado) |

Las pruebas de API y seguridad levantan la `app` real de Express y firman JWT reales; solo se
simula Supabase. Cypress cubre lo que el doble no puede ver: tipos de PostgreSQL, datos reales,
CORS y cabeceras del despliegue. DEF-37 (token no UUID → 500) solo apareció ahí.

## 2. Resultados

| Suite | Pruebas | Resultado |
|---|---|---|
| unit | 547 | ✓ |
| integration | 11 | ✓ |
| regression | 88 | ✓ |
| api | 33 | ✓ |
| security | 44 | ✓ |
| **Total `npm test`** | **723** | **✓ 0 fallos** |
| performance | 10 | ✓ (presupuestos cumplidos) |
| defects | 72 | 59 fallan (defectos abiertos), 13 pasan (casos ya corregidos) |
| Cypress (`e2e/`) | 33 + 6 de defectos | Tipado OK; aserciones verificadas contra Render con Node. Falta ejecutar con el binario |

Cobertura de los archivos incluidos en Sonar: **96,52 % líneas · 98,78 % funciones · 88,57 % ramas**.
`tsc --noEmit`: sin errores.

## 3. Rendimiento de la lógica y de la app (`npm run test:performance`)

Mediana de 15–30 repeticiones tras 5 de calentamiento. Reporte: `reports/rendimiento/*.json`.

| Req. | Escenario | Mediana | p95 | Presupuesto |
|---|---|---|---|---|
| RQ18 | PNG del QR con logo | 12,8 ms | 16,6 ms | 150 ms |
| RQ22 | Promedio de 100.000 calificaciones | 2,6 ms | 4,8 ms | 30 ms |
| RQ23 | Histórico de 100.000 evaluaciones | 5,7 ms | 13,7 ms | 150 ms |
| RQ24 | Resumen de 500 docentes / 50.000 evaluaciones | 2,3 ms | 4,2 ms | 100 ms |
| RQ24 | 5.000 → 50.000 evaluaciones | 0,47 → 2,0 ms | — | crecimiento < 30x |
| RQ25 | 5.000 filas del reporte × 5 categorías | 14,8 ms | 15,8 ms | 150 ms |
| RQ19/24 | HTTP dashboard (base simulada), 1 a la vez | 2,5 ms | 3,4 ms | 100 ms |
| RQ19/24 | HTTP dashboard, 10 simultáneas | 17,4 ms | 20,2 ms | 100 ms |
| RQ19/24 | HTTP dashboard, 50 simultáneas | 78,0 ms | 83,8 ms | 100 ms |
| RQ19 | 401 sin token, 50 simultáneas | 48,2 ms | 55,5 ms | 100 ms |

**Interpretación.** El costo propio del back (Express + JWT + roles + armar el JSON) es ~2,5 ms por
petición y crece lineal con la concurrencia (Node atiende en un solo hilo). Toda la lógica de
RQ22–RQ25 procesa volúmenes 50–100 veces mayores que los actuales en milisegundos, y el resumen
escala lineal (10x datos ≈ 4x tiempo). El QR es lo más costoso (12,8 ms): un correo con 50 QR
tarda ~0,6 s solo en imágenes.

## 4. Carga contra producción (`npm run test:carga`)

Render (plan gratuito) + Supabase. Etapas de 1, 5 y 10 usuarios simultáneos, 20 s cada una,
sin pausa entre peticiones (más agresivo que un usuario real). Servidor despierto antes de medir.

| Usuarios | Escenario | p50 | p95 | Errores | Criterio p95 | Resultado |
|---|---|---|---|---|---|---|
| 1 | dashboard-summary (RQ24) | 981 ms | 1.593 ms | 0 % | ≤ 3.000 | CUMPLE |
| 1 | reports-overview (RQ23/25) | 2.705 ms | 2.762 ms | 0 % | ≤ 8.000 | CUMPLE |
| 1 | profesor-stats (RQ22) | 1.379 ms | 1.397 ms | 0 % | ≤ 3.000 | CUMPLE |
| 5 | dashboard-summary | 1.133 ms | 2.179 ms | 0 % | ≤ 3.000 | CUMPLE |
| 5 | reports-overview | 3.280 ms | 4.713 ms | 0 % | ≤ 8.000 | CUMPLE |
| 5 | profesor-stats | 1.672 ms | 2.996 ms | 0 % | ≤ 3.000 | CUMPLE (al límite) |
| 10 | dashboard-summary | 1.480 ms | 2.200 ms | 0 % | ≤ 3.000 | CUMPLE |
| 10 | reports-overview | 6.197 ms | 7.202 ms | 0 % | ≤ 8.000 | CUMPLE (al límite) |
| 10 | profesor-stats | 2.397 ms | 3.793 ms | 0 % | ≤ 3.000 | **NO CUMPLE** |
| 10 | login inválido (RQ19) | 404 ms | 799 ms | 0 % | ≤ 2.000 | CUMPLE |
| 10 | health / 401 sin token | ~260 ms | ~600 ms | 0 % | ≤ 1.000 | CUMPLE |

Throughput total: 1,1 → 3,7 → 4,8 peticiones/s para 1 → 5 → 10 usuarios.

**Interpretación.**

1. **Estabilidad:** 0 % de errores en todas las etapas; no hay caídas ni timeouts.
2. **Saturación entre 5 y 10 usuarios:** doblar usuarios sube el throughput solo un 30 % y
   duplica la mediana de reports-overview (3,3 → 6,2 s). Las peticiones esperan en cola.
3. **El cuello de botella es la base, no el código:** `health` y el 401 (que no consultan la
   base) se quedan en ~250 ms (latencia de red a Render). La app suma ~2,5 ms por petición
   (sección 3). Los segundos restantes son consultas a Supabase: reports-overview hace varias
   ida-y-vuelta en serie y trae evaluaciones crudas para agregarlas en Node.
4. **Arranque en frío:** tras inactividad, Render tarda ~12,5 s en la primera petición
   (medido en la corrida anterior); el script ahora espera a `/health` antes de medir.
5. **Límite estadístico:** con 3–20 muestras por escenario, el p95 es casi el máximo; sirve para
   detectar tendencia, no como SLA.

**Mejoras propuestas (por impacto).**

1. Agregar en la base (vista o RPC de PostgreSQL con `AVG`/`COUNT ... GROUP BY`) en vez de traer
   filas a Node: reduce transferencia y ida-y-vuelta en reports-overview y profesor-stats.
2. Ejecutar `scripts/indices-rendimiento.sql` (índices por `profesor_id`, `fecha_creacion`, `grupo_id`).
3. Caché corta (60 s) por coordinador+periodo para reports-overview: los datos cambian poco.
4. Lanzar en paralelo (`Promise.all`) las consultas independientes del resumen.
5. Plan de Render sin suspensión (o un ping programado) para eliminar el arranque en frío.

## 5. Defectos encontrados en esta entrega

Detalle completo en `src/test/HALLAZGOS.md`.

| ID | Defecto | Req. | Severidad | Cómo se encontró |
|---|---|---|---|---|
| DEF-31 | Los 500 devuelven el mensaje de PostgreSQL (`bigint`) | RQ22/24 | Media | Cypress contra Render + prueba de defecto |
| DEF-32 | Batch QR acepta grupoIds -1, 0 y 1,5 | RQ18 | Baja | Prueba de API (la regla correcta existía en otra función sin usar) |
| DEF-33 | Periodo inválido → datos de todos los periodos (708 vs 695) | RQ23/25 | Media | Cypress contra Render |
| DEF-34 | Login sin límite de intentos: 30 fallos seguidos, 30 veces 401 | RQ19 | **Alta** | Prueba de seguridad |
| DEF-35 | Sin cabeceras de seguridad (helmet) | Transversal | Baja | Cypress contra Render |
| DEF-36 | Nombre del archivo del reporte sin sanear (latente) | RQ25 | Baja | Revisión + prueba de seguridad |
| DEF-37 | Token de QR no UUID → 500 en vez de 404 | RQ18 | Media | Cypress contra Render (el doble de la base no lo podía ver) |
| DEF-38 | JSON malformado / cuerpo > 100 KB → página HTML | RQ18/19 | Baja | Cypress contra Render |

En la misma corrida se confirmó que **DEF-03, DEF-06, DEF-18, DEF-19, DEF-23 (auto-inscripción) y
DEF-25 (HTML del correo)** ya están corregidos (sus pruebas pasan) y DEF-04 está corregido en 3 de 5 casos.

Controles que funcionan bien (verificados en producción): `pageSize` limitado a 50, página
negativa → 1, búsqueda con comillas y comodines → `[]`, CORS rechaza orígenes ajenos, coordinador
→ 403 en `/api/users`, docente de otra carrera → 404, JWT `alg:none` / otra clave / vencido → 401,
login sin enumeración de usuarios, correo con CRLF/Bcc/varios destinatarios → 400.

## 6. Cómo reproducir

```bash
npm test && npm run test:coverage
npm run test:performance
npm run test:defects
TOKEN_FILE=/ruta/token.txt PROFESOR_ID=13 ETAPAS=1,5,10 DURACION_S=20 npm run test:carga
cd e2e && npm install && npx cypress install && npm run test:e2e
```

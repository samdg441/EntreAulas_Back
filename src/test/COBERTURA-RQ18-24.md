# Cobertura RQ18–RQ24 y datos inválidos

Los cinco requisitos de esta entrega son **RQ18, RQ19, RQ22, RQ23 y RQ24**.
Los datos de prueba están en `fixtures/casos-datos.ts` (comunes, vacíos e inválidos).

`npm test` cubre **helpers de regla**, no las rutas HTTP ni las pantallas.
Por eso la cobertura de líneas del producto en esos archivos es **0 %** con la suite oficial.

## 1. ¿El producto lanza excepción si llega un dato mal?

Casi nunca. Convierte el valor (`Number`, `|| 0`) y sigue. El riesgo no es un crash: es **publicar un número incorrecto**.

| Dato mal formado | ¿Revienta? | ¿Lo rechaza el producto? | Dónde |
|---|---|---|---|
| Nota `-2` o `0` | No | Sí en RQ24 (`cal <= 0`). No en RQ22/RQ23 (`\|\| 0`) | `coordinador.routes.ts:140` · `teachers-analytics.routes.ts:55, 254` |
| Nota `99` | No | **No.** Entra al promedio | mismos archivos |
| Nota `null` / `'abc'` | No | RQ24 lo descarta. RQ22/RQ23 lo cuentan como `0` | |
| `page=abc` / `pageSize=-3` | No | **No.** `Number('abc')` → `NaN` en paginación | `coordinador.routes.ts:62-63` |
| `period=2026-9` / `abc` | No | **No.** Arma fechas tipo `abc-07-01` | `teachers-analytics.routes.ts:180-182, 218-219` |
| Token QR vacío | No | Sí → 400 | `qr-evaluaciones.routes.ts:374-375` |
| QR inactivo / inexistente | No | Sí → 404 (mismo mensaje que “expirado”) | `qr-evaluaciones.routes.ts:415-416` |
| Rol desconocido | No | Sí → `/dashboard` | `auth.routes.ts:304-320` |
| Rol `Coordinador` (mayúscula) | No | **No.** 403 en resumen | `coordinador.routes.ts:49` |

El front (RQ24) atrapa error de red y deja la lista vacía. `toFixed` se llama solo si hay evaluaciones, así que un `99` **sí se pinta** (`99.00`).

## 2. Cobertura de casos (suite oficial, helpers)

| RQ | Pruebas back | Pruebas front | Común | Vacío / cero | Inválido |
|---|---:|---:|---|---|---|
| **RQ18** Validar QR | 4 | 4 | token activo / URL con token | sin token, token vacío | inexistente, inactivo, error API |
| **RQ19** Dashboard por rol | 8 | 6 | admin, decano, coord, prof, docente, est. | sin rol ni tipo | tipo desconocido |
| **RQ22** Métricas profesor | 5 | 3 | 1, 4, 4.5, 5 | lista vacía → 0 | −2, 0, 99, null, `'abc'` |
| **RQ23** Histórico | 7 | 5 | 2026-1 / 2026-2, promedio 4.5 | sin datos, 2099-1 | período `2026`, `2026-9`, `abc`; notas −2 y 99 |
| **RQ24** Resumen coordinador | 8 | 4 | stats + search `ana` | sin profesores, search `zzz` | rol ajeno; notas 0/−2/99; `page` NaN |
| **Total** | **32** | **22** | | | |

## 3. Cobertura de líneas del producto (`npm test --coverage`)

Archivos que implementan los 5 requisitos y **no se ejecutan** con la suite actual:

| RQ | Archivo de producto | Cobertura de líneas con `npm test` |
|---|---|---|
| RQ18 | `src/modules/evaluations/qr-evaluaciones.routes.ts` | 0 % |
| RQ19 | `src/modules/auth/auth.routes.ts` | 0 % |
| RQ22 / RQ23 | `src/modules/analytics/teachers-analytics.routes.ts` | 0 % |
| RQ22 | `src/modules/analytics/analytics.service.ts` | 0 % |
| RQ24 | `src/modules/analytics/coordinador.routes.ts` | 0 % |
| RQ18 front | `QrEvaluationEntry.tsx` | 0 % |
| RQ19 front | `App.tsx`, `AuthContext.tsx` | 0 % |
| RQ22 front | `DashboardProfesor.tsx` | 0 % |
| RQ23 front | `ReportsPage.tsx` | 0 % |
| RQ24 front | `DashboardCoordinador.tsx` | 0 % |

Lo que sí está cubierto al 100 % de los **casos listados** es la lógica en `src/test/helpers/` (misma regla que se espera del producto: escala 1–5, período `YYYY-1\|2`, IDs > 0).

## 4. Lectura honesta

- **Alcance de requisitos (casos):** alto en los 5 RQ. Hay camino feliz, vacío e inválido.
- **Alcance de código desplegado:** nulo con `npm test`. Las rutas siguen aceptando `99` y `period` basura.
- Para cubrir esas líneas haría falta llamar al handler real (API o UI) con los datos de `casos-datos.ts`.

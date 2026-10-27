# Línea base del back antes de la refactorización (RQ1–RQ5)

- **Fecha:** 2026-10-25
- **Rama:** `pruebas-Juliana`
- **Commit:** `45a345a` (tag `v-antes-refactor`)
- **Entorno:** Node 26 y Vitest con Supabase simulado

## Resultados

| Suite | Comando | Archivos | Pruebas | Resultado | Log |
|---|---|---|---|---|---|
| Evidencias RQ1–RQ5 (unitarias, API y seguridad) | `npm run test:evidencias` | 21 | 332 | 332 ✔ / 0 ✘ | `back-evidencias.txt` |
| Suite completa (sin defectos) | `npx vitest run` | 77 | 989 | 986 ✔ / **3 ✘** (timeout de 5 s) | `back-suite-completa.txt` |
| Defectos (fallan a propósito mientras siguen abiertos) | `npm run test:defects` | 41 | 86 | 16 ✔ / 70 ✘ | `back-defects.txt` |

### Cobertura de RQ1–RQ5 (`coverage-rq1-rq5`)

| Métrica | Valor |
|---|---|
| Sentencias | 80,97 % |
| Ramas | 90,08 % |
| Funciones | 76,05 % |
| Líneas | 80,97 % |

Lo más débil es `role.service.ts`, con 47,3 %.

### Las 3 fallas de la suite completa (hallazgo nuevo, DEF-47)

- `unit/autenticacion/rq2-login.test.ts`, "Nodo 2: body válido → continúa"
- `unit/usuarios/rq10-gestionar-usuarios.test.ts`, "POST /auth/login cubre credenciales…"
- `security/rq2-login-avanzado.security.test.ts`, "login-with-role: un rol repetido…"

Las tres pasan cuando corren solas (`test:evidencias`). Fallan con la suite completa porque bcrypt usa coste 12 y los 77 archivos corren en paralelo, así que las pruebas superan el límite de 5 s. Son pruebas **intermitentes** del login.

## Defectos abiertos de RQ1–RQ5 (24 pruebas en rojo)

| Defecto | RQ | Severidad | Pruebas en rojo |
|---|---|---|---|
| DEF-39: `/register` público crea administradores | RQ1 | Crítica | 3/3 |
| DEF-21: `create-user` acepta un `tipo_usuario` inválido | RQ1 | Alta | 1/1 |
| DEF-45: la política de clave del alta es distinta a la del reset | RQ1, RQ5 | Baja | 3/3 |
| DEF-34: el login no limita los intentos | RQ2 | Alta | 1/1 |
| DEF-41: el tiempo de respuesta del login permite enumerar cuentas | RQ2 | Media | 1/1 |
| DEF-43: la recuperación no limita los intentos | RQ3.1, RQ3.2, RQ5 | Alta | 3/3 |
| DEF-44: los tokens de recuperación anteriores siguen vigentes | RQ3.1, RQ3.2 | Baja | 1/1 |
| DEF-42: el JWT sigue valiendo después del reset | RQ5 | Media | 1/1 |
| DEF-40 y DEF-31: los 500 devuelven el mensaje interno | Transversal | Media | 4/4 |
| DEF-35: no hay cabeceras de seguridad HTTP | Transversal | Media | 4/4 |
| DEF-38: el JSON malformado responde HTML | Transversal | Baja | 2/2 |

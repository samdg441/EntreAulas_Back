# Pruebas Backend (ISTQB / V&V)

Estructura alineada a niveles de prueba y a la matriz de requisitos (Grafos / caminos).

## Para qué es cada carpeta

```
src/test/
├── unit/           → Qué va: un módulo/función/endpoint aislado; mocks de BD/servicios.
│                     Objetivo: cubrir caminos del grafo (SI/NO) de la lógica de negocio.
│
├── integration/    → Qué va: varias capas juntas (ruta Express + auth + servicio) con
│                     dependencias externas mockeadas (Supabase). No es E2E real de BD.
│                     Objetivo: validar el contrato API del requisito (status, body, flujo).
│
├── defects/        → Qué va: una prueba por defecto encontrado, escrita contra el
│                     comportamiento CORRECTO esperado. Falla mientras el defecto
│                     siga abierto; pasa a verde cuando se corrige el código.
│                     Se ejecuta aparte y no afecta a la suite de requisitos.
│                     Ver HALLAZGOS.md.
│
├── fixtures/       → Qué va: datos estáticos reutilizables (JSON, usuarios de prueba).
│                     No va: lógica de assert ni mocks de módulos.
│
├── helpers/        → Qué va: utilidades de soporte (query builder fake de Supabase, etc.).
│                     No va: casos de prueba (describe/it).
│
└── setup.ts        → Qué va: env mínimo para que Vitest arranque (JWT, Supabase URL fake).
```

**No hay `e2e/` en backend** (los flujos de usuario viven en el Front).  
Si más adelante hay pruebas contra BD real, convienen en `integration/` con un perfil/env aparte, no mezcladas con unit.

## Niveles

| Nivel | Qué prueba | Cobertura de caminos |
|-------|------------|----------------------|
| **unit/** | Grafo completo del requisito (C1…Cn) | Completa |
| **integration/** | Contrato HTTP / login sin stubear el SUT; smoke del camino feliz | Complementaria |
| **defects/** | Defectos abiertos detectados durante la validación | Rojo esperado |

No se añaden datos “de relleno” solo para poner verde. Si un camino falla, se investiga el código o el mock mínimo necesario para ejercitar ese camino.

## Matriz requisito → archivo

| Requisito | Unit | Integration |
|-----------|------|-------------|
| RQ1 Crear usuario (admin) | `unit/rq1-crear-usuario-admin.test.ts` | — |
| RQ2 Login | `unit/rq2-login.test.ts` | — |
| RQ18 Validar QR | `unit/rq18-validar-qr.test.ts` | `integration/rq18-validar-qr.integration.test.ts` |
| RQ19 Dashboard por rol | `unit/rq19-redirigir-dashboard.test.ts` | `integration/rq19-redirigir-dashboard.integration.test.ts` |
| RQ22 Métricas evaluación | `unit/rq22-metricas-evaluacion.test.ts` | `integration/rq22-metricas-evaluacion.integration.test.ts` |
| RQ23 Stats históricas | `unit/rq23-estadisticas-historicas.test.ts` | `integration/rq23-estadisticas-historicas.integration.test.ts` |
| RQ24 Resumen coordinador | `unit/rq24-resumen-coordinador.test.ts` | `integration/rq24-resumen-coordinador.integration.test.ts` |

Framework: **Vitest** + **Supertest**.  
Cobertura: `coverage/` (excluida de Git).

## Cómo correrlas

Desde la raíz de **EntreAulas_Back**:

```bash
# Todas (unit + integration + legacy *.test.ts en modules)
npm test

# Solo unitarias RQ
npm run test:unit

# Solo integración RQ
npm run test:integration

# Modo watch (re-ejecuta al guardar)
npm run test:watch

# Cobertura (genera ./coverage; no se versiona)
npm run test:coverage

# Registro de defectos abiertos (SE ESPERA QUE FALLE; ver HALLAZGOS.md)
npm run test:defects

# Un archivo concreto
npx vitest run src/test/unit/rq18-validar-qr.test.ts
```

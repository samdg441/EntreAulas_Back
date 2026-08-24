# Pruebas Backend (ISTQB / V&V)

Estructura alineada a niveles de prueba y a la matriz RQ1–RQ5 (Grafos / caminos).

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

No se añaden datos “de relleno” solo para poner verde. Si un camino falla, se investiga el código o el mock mínimo necesario para ejercitar ese camino.

## Matriz requisito → archivo

| Requisito | Unit | Integration |
|-----------|------|-------------|
| RQ1 Validar QR | `unit/rq1-validar-qr.test.ts` | `integration/rq1-validar-qr.integration.test.ts` |
| RQ2 Dashboard por rol | `unit/rq2-redirigir-dashboard.test.ts` | `integration/rq2-redirigir-dashboard.integration.test.ts` |
| RQ3 Métricas evaluación | `unit/rq3-metricas-evaluacion.test.ts` | `integration/rq3-metricas-evaluacion.integration.test.ts` |
| RQ4 Stats históricas | `unit/rq4-estadisticas-historicas.test.ts` | `integration/rq4-estadisticas-historicas.integration.test.ts` |
| RQ5 Resumen coordinador | `unit/rq5-resumen-coordinador.test.ts` | `integration/rq5-resumen-coordinador.integration.test.ts` |

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

# Un archivo concreto
npx vitest run src/test/unit/rq1-validar-qr.test.ts
```

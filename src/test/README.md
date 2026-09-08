# Pruebas Backend (unitarias)

Cada requisito vive en **un archivo** y **una clase** con todos sus casos.
No hay mocks: se llaman funciones con datos y se revisa el resultado.

El alcance cubre valores comunes, vacíos y valores inválidos (negativos, fuera de escala, mal formados). Todas las pruebas de esta suite deben pasar.

```
src/test/
├── unit/                 → Una clase por requisito (C1…Cn)
├── helpers/              → Validaciones y cálculos
├── fixtures/             → Datos estáticos + casos-datos.ts
├── COBERTURA-RQ18-24.md  → Alcance y datos inválidos de esta entrega
└── setup.ts
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
| RQ6 Control de acceso por roles | `unit/rq6-rbac.test.ts` | — |
| RQ10 Gestionar usuarios | `unit/rq10-gestionar-usuarios.test.ts` | `integration/rq10-gestionar-usuarios.integration.test.ts` |
| RQ11 Evaluaciones del estudiante | `unit/rq11-evaluaciones-estudiante.test.ts` | `integration/rq11-evaluaciones-estudiante.integration.test.ts` |
| RQ13 Enviar evaluación docente | `unit/rq13-enviar-evaluacion.test.ts` | `integration/rq13-enviar-evaluacion.integration.test.ts` |
| RQ14 Auto-inscripción por QR | `unit/rq14-auto-inscripcion.test.ts` | — |
| RQ15 Generación masiva de QR | `unit/rq15-generar-qr.test.ts` | — |
| RQ16 Distribución de QR por correo | `unit/rq16-correo-qr.test.ts` | — |
| RQ17 Resolución de token QR | `unit/rq17-resolucion-token.test.ts` | — |
| RQ18 Validar QR | `unit/rq18-validar-qr.test.ts` | `integration/rq18-validar-qr.integration.test.ts` |
| RQ19 Dashboard por rol | `unit/rq19-redirigir-dashboard.test.ts` | `integration/rq19-redirigir-dashboard.integration.test.ts` |
| RQ22 Métricas evaluación | `unit/rq22-metricas-evaluacion.test.ts` | `integration/rq22-metricas-evaluacion.integration.test.ts` |
| RQ23 Stats históricas | `unit/rq23-estadisticas-historicas.test.ts` | `integration/rq23-estadisticas-historicas.integration.test.ts` |
| RQ24 Resumen coordinador | `unit/rq24-resumen-coordinador.test.ts` | `integration/rq24-resumen-coordinador.integration.test.ts` |
| RQ29 Resumen generado con IA | `unit/rq29-resumen-generado-ia.test.ts` | `integration/rq29-resumen-generado-ia.integration.test.ts` |
| RQ31 Alerta de acoso con IA | `unit/rq31-alerta-acoso-ia.test.ts` | `integration/rq31-alerta-acoso-ia.integration.test.ts` |

Framework: **Vitest** + **Supertest**.  
Cobertura: `coverage/` (excluida de Git).

## Cómo correrlas

Desde **EntreAulas_Back**:

```bash
npm test
npm run test:unit
```

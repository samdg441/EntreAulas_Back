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

## Cómo correrlas

Desde **EntreAulas_Back**:

```bash
npm test
npm run test:unit
```

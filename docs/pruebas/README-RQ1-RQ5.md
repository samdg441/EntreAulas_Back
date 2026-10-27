# Pruebas de RQ1–RQ5 (Juliana Franco): índice

Los documentos principales están en el repo del front, `EntreAulas_Front/docs/pruebas/`:

- `PLAN-DE-PRUEBAS-RQ1-RQ5.md`: alcance, estrategia, tipos, herramientas, responsables, cronograma y criterios.
- `MATRIZ-TRAZABILIDAD-RQ1-RQ5.md` y `.csv`: requisito, caso, resultado antes y después, evidencia y defecto.
- `INFORME-FINAL-PRUEBAS-RQ1-RQ5.md`: resultados, métricas, defectos, despliegue, conclusiones y recomendaciones.
- `ANTES-DESPUES-RQ1-RQ5.md`: cambios de código por defecto, con su commit.

En este repo:

| Ruta | Contenido |
|---|---|
| `docs/pruebas/antes/` | Línea base (tag `v-antes-refactor`): suite completa, evidencias y defectos |
| `docs/pruebas/despues/` | Después de la refactorización: suites, defectos, carga smoke y SonarQube |
| `src/test/HALLAZGOS.md` | Registro de defectos (DEF-39 a DEF-47 con su corrección aplicada) |
| `src/test/defects/` | Una prueba por defecto: falla mientras está abierto y pasa al corregirse |
| `scripts/add-password-changed-at.sql` | Migración necesaria para DEF-42 (ejecutar en Supabase) |

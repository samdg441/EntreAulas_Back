# Prueba de carga — localhost:3000

Fecha: 2026-10-26T20:05:31.912Z

Perfil: smoke | Servidor listo tras: 110 ms

| Usuarios | Escenario | Req. | Peticiones | RPS | p50 | p95 | p99 | Máx | Errores | Criterio p95 | Resultado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | health | base | 613 | 61.3 | 2 ms | 3 ms | 6 ms | 14 ms | 0 % | ≤ 1000 ms | CUMPLE |
| 1 | forgot-password | RQ3.1 | 613 | 61.3 | 3 ms | 4 ms | 10 ms | 957 ms | 0 % | ≤ 2000 ms | CUMPLE |
| 1 | validate-reset-token | RQ3.4 | 613 | 61.3 | 2 ms | 3 ms | 7 ms | 9 ms | 0 % | ≤ 1500 ms | CUMPLE |
| 1 | reset-password-token-invalido | RQ5 | 613 | 61.3 | 3 ms | 4 ms | 7 ms | 23 ms | 0 % | ≤ 1500 ms | CUMPLE |
| 1 | create-user-sin-token | RQ1 | 612 | 61.2 | 3 ms | 4 ms | 7 ms | 19 ms | 0 % | ≤ 1000 ms | CUMPLE |

# Vista SQL: Respuestas Abiertas Válidas

## Descripción

Esta vista centraliza toda la lógica de JOINs y filtros para obtener respuestas abiertas válidas de las evaluaciones. Facilita las consultas de análisis de IA ya que todo el filtrado está centralizado.

## Instalación

Ejecuta el script SQL en Supabase:

```bash
# Desde el directorio back
# Copia y pega el contenido de scripts/create-vista-respuestas-abiertas.sql
# en el SQL Editor de Supabase
```

O directamente en Supabase SQL Editor:
1. Ve a tu proyecto en Supabase
2. Abre el SQL Editor
3. Copia y pega el contenido de `back/scripts/create-vista-respuestas-abiertas.sql`
4. Ejecuta el script

## Estructura de la Vista

La vista `vista_respuestas_abiertas_validas` incluye:

- `carrera_id`: ID de la carrera del profesor
- `carrera_nombre`: Nombre de la carrera
- `profesor_id`: ID del profesor evaluado
- `evaluacion_id`: ID de la evaluación
- `periodo_id`: ID del período académico
- `grupo_id`: ID del grupo
- `respuesta_id`: ID de la respuesta
- `respuesta_texto`: Texto de la respuesta (ya filtrado para ser válido)
- `respuesta_rating`: Calificación numérica si existe

## Filtros Aplicados

La vista automáticamente filtra respuestas que:
- No son NULL (`IS NOT NULL`)
- No están vacías (`TRIM(respuesta_texto) <> ''`)
- Tienen más de 3 caracteres (`LENGTH(TRIM(respuesta_texto)) > 3`)

## Uso en el Código

### Para Coordinadores (by-career)

```typescript
const { data: respuestas } = await SupabaseDB.supabaseAdmin
  .from('vista_respuestas_abiertas_validas')
  .select('respuesta_texto')
  .eq('carrera_id', carreraId)
  .eq('periodo_id', periodoId)
```

### Para Profesores (by-professor)

```typescript
// Primero obtener profesor_id desde usuario_id
const { data: profesor } = await SupabaseDB.supabaseAdmin
  .from('profesores')
  .select('id')
  .eq('usuario_id', usuarioId)
  .single()

// Luego buscar en la vista
const { data: respuestas } = await SupabaseDB.supabaseAdmin
  .from('vista_respuestas_abiertas_validas')
  .select('respuesta_texto')
  .eq('profesor_id', profesor.id)
  .eq('periodo_id', periodoId)
```

## Ventajas

1. **Simplificación**: Una sola consulta en lugar de múltiples JOINs
2. **Mantenibilidad**: Los filtros están centralizados en un solo lugar
3. **Rendimiento**: Los índices mejoran las consultas
4. **Consistencia**: Todos los filtros se aplican de la misma manera
5. **Reutilización**: La misma vista puede usarse en diferentes endpoints

## Índices Creados

El script también crea índices para mejorar el rendimiento:
- `idx_evaluaciones_carrera_id`: Búsquedas rápidas por carrera
- `idx_evaluaciones_profesor_id`: Búsquedas rápidas por profesor
- `idx_evaluaciones_periodo_id`: Búsquedas rápidas por período
- `idx_respuestas_evaluacion_id`: JOINs rápidos con evaluaciones
- `idx_respuestas_texto`: Filtrado rápido de textos no nulos


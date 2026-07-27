# Datos de Prueba para Dashboard del Profesor

## Problema Identificado

El dashboard del profesor no muestra datos porque no existen evaluaciones en la base de datos. Los gráficos y estadísticas aparecen vacíos porque el sistema está buscando datos reales que no existen.

## Solución

Se han creado scripts para insertar datos de prueba (datos quemados) que permiten visualizar el funcionamiento del dashboard del profesor.

## Archivos Creados

### 1. `insertar-datos-prueba-evaluaciones.sql`
Script SQL que inserta evaluaciones de prueba directamente en la base de datos.

### 2. `insertar-datos-prueba-directo.js`
Script de Node.js que usa la API de Supabase para insertar evaluaciones de prueba de manera más segura.

## Cómo Usar

### Opción 1: Script de Demostración (Más Fácil)

```bash
# Navegar al directorio del backend
cd back

# Editar el archivo de configuración
# Abre scripts/insertar-datos-demo.js y configura:
# const SUPABASE_URL = 'https://tu-proyecto.supabase.co';
# const SUPABASE_SERVICE_ROLE_KEY = 'tu-service-role-key';

# Ejecutar el script
node scripts/insertar-datos-demo.js
```

### Opción 2: Script con Archivo de Configuración

```bash
# Navegar al directorio del backend
cd back

# Copiar archivo de configuración
cp scripts/config-ejemplo.js scripts/config.js

# Editar config.js con tus valores reales de Supabase
# Luego ejecutar:
node scripts/insertar-datos-con-config.js
```

### Opción 3: Script con Variables de Entorno

```bash
# Navegar al directorio del backend
cd back

# Configurar variables de entorno
export SUPABASE_URL="tu-url-de-supabase"
export SUPABASE_SERVICE_ROLE_KEY="tu-service-role-key"

# Ejecutar el script
node scripts/insertar-datos-prueba-final.js
```

## Requisitos Previos

1. **Base de datos configurada**: Debe existir la estructura de tablas
2. **Datos base**: Deben existir profesores, estudiantes, cursos y grupos activos
3. **Variables de entorno**: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`

## Datos que se Insertan

### Evaluaciones de Prueba
- **Cantidad**: 50 evaluaciones
- **Calificaciones**: Entre 3.0 y 5.0 (aleatorias)
- **Períodos**: 2025-2, 2025-1, 2024-2, 2024-1, 2023-2
- **Comentarios**: Comentarios ficticios pero realistas

### Características de los Datos
- **Realistas**: Las calificaciones y comentarios son creíbles
- **Diversos**: Múltiples profesores, estudiantes, cursos y períodos
- **Históricos**: Incluye datos de períodos anteriores para mostrar tendencias

## Verificación

Después de ejecutar el script, verifica que:

1. **Dashboard del Profesor**: Muestra estadísticas y gráficos
2. **Gráfico de Tendencias**: Muestra evolución a lo largo del tiempo
3. **Estadísticas Rápidas**: Muestra total de evaluaciones y promedio
4. **Gráficos de Distribución**: Muestran distribución de calificaciones

## Limpieza (Opcional)

Si quieres eliminar los datos de prueba:

```sql
-- Eliminar evaluaciones de prueba
DELETE FROM evaluaciones 
WHERE comentarios IN (
  'Excelente profesor, muy claro en sus explicaciones',
  'Buen profesor, aunque podría mejorar la metodología',
  'Profesor competente, cumple con los objetivos del curso',
  'Profesor con buen dominio del tema, recomendado',
  'Muy buen manejo de la clase y los contenidos',
  'Profesor dedicado y comprometido con la enseñanza'
);
```

## Notas Importantes

⚠️ **Solo para Desarrollo**: Estos datos son completamente ficticios y solo para propósitos de demostración.

⚠️ **No para Producción**: En un entorno de producción, estos datos deben ser reemplazados por evaluaciones reales.

⚠️ **Datos Ficticios**: Todas las calificaciones y comentarios son generados aleatoriamente.

## Solución del Problema Original

El problema "por qué no me aparecen los datos quemados en el apartado del profesor" se debe a que:

1. **No existían datos de prueba**: El sistema no tenía evaluaciones en la base de datos
2. **Dashboard vacío**: Sin datos, los gráficos y estadísticas aparecían vacíos
3. **Falta de datos históricos**: No había información para mostrar tendencias

Con estos scripts, el dashboard del profesor ahora mostrará:
- ✅ Estadísticas de evaluaciones
- ✅ Gráficos de tendencias históricas
- ✅ Distribución de calificaciones
- ✅ Promedios por curso
- ✅ Datos de períodos anteriores

## Soporte

Si tienes problemas ejecutando los scripts:

1. Verifica que las variables de entorno estén configuradas
2. Asegúrate de que la base de datos esté accesible
3. Confirma que existan profesores, estudiantes y cursos en la BD
4. Ejecuta primero los scripts de configuración inicial si es necesario


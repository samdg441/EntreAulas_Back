# Scripts para Agregar Estudiantes con Inscripciones

Este directorio contiene scripts para crear estudiantes en el sistema EntreAulas, incluyendo su registro en la tabla `usuarios`, creación automática en `estudiantes` y realización de inscripciones a grupos.

## Archivos Disponibles

### 1. `add-students-with-enrollments.sql`
Script SQL puro que puedes ejecutar directamente en el SQL Editor de Supabase.

### 2. `add-students-with-enrollments.js`
Script Node.js que puedes ejecutar desde la línea de comandos.

## Prerrequisitos

### 1. Ejecutar Triggers
**IMPORTANTE**: Antes de usar cualquier script, ejecuta primero:
```sql
-- En el SQL Editor de Supabase
-- Ejecuta el contenido completo de: back/supabase-triggers.sql
```

### 2. Verificar Estructura de BD
Asegúrate de que existan las siguientes tablas con datos:
- `carreras` (con al menos algunas carreras activas)
- `cursos` (con al menos algunos cursos activos)
- `grupos` (con al menos algunos grupos activos)

### 3. Consultas de Verificación
```sql
-- Ver carreras disponibles
SELECT id, nombre FROM carreras WHERE activo = true;

-- Ver cursos disponibles
SELECT id, nombre, codigo FROM cursos WHERE activo = true;

-- Ver grupos disponibles
SELECT id, curso_id, numero_grupo, horario FROM grupos WHERE activo = true;
```

## Uso del Script SQL

### 1. Preparar el Script
1. Abre el archivo `add-students-with-enrollments.sql`
2. **Ajusta los `grupo_id`** en las secciones de inscripciones según los grupos existentes en tu BD
3. **Ajusta los `carrera_id`** según las carreras existentes

### 2. Ejecutar
1. Ve al SQL Editor de Supabase
2. Pega el contenido del script
3. Ejecuta el script completo

### 3. Verificar
El script incluye consultas de verificación al final que te mostrarán:
- Los estudiantes creados
- Sus inscripciones realizadas

## Uso del Script Node.js

### 1. Instalar Dependencias
```bash
cd back
npm install @supabase/supabase-js dotenv
```

### 2. Configurar Variables de Entorno
Crea o actualiza tu archivo `.env` en la carpeta `back/`:
```env
SUPABASE_URL=tu_url_de_supabase
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

### 3. Preparar el Script
1. Abre el archivo `add-students-with-enrollments.js`
2. **Ajusta los `grupos`** en el array `estudiantes` según los grupos existentes
3. **Ajusta los `carrera_id`** según las carreras existentes

### 4. Ejecutar
```bash
cd back
node scripts/add-students-with-enrollments.js
```

## Configuración de Estudiantes

### Estructura de Datos
```javascript
{
  email: 'estudiante@udem.edu.co',
  password: 'Password123!',
  nombre: 'Nombre',
  apellido: 'Apellido',
  codigo: 'EST001',
  carrera_id: 1,
  semestre: '2025-1',
  grupos: [1, 2, 3] // IDs de grupos existentes
}
```

### Campos Explicados
- **email**: Email único del estudiante (usado para login)
- **password**: Contraseña (se hashea automáticamente)
- **nombre/apellido**: Nombre completo
- **codigo**: Código único del estudiante
- **carrera_id**: ID de la carrera (debe existir en tabla `carreras`)
- **semestre**: Semestre académico
- **grupos**: Array de IDs de grupos (deben existir en tabla `grupos`)

## Proceso Automático

### 1. Creación de Usuario
- Se inserta en tabla `usuarios` con `tipo_usuario = 'estudiante'`
- La contraseña se hashea automáticamente (trigger)

### 2. Creación de Estudiante
- Se crea automáticamente en tabla `estudiantes` (trigger)
- Se actualiza con información específica (código, carrera, semestre)

### 3. Inscripciones
- Se crean registros en tabla `inscripciones`
- Relacionan al estudiante con los grupos especificados

## Verificación Post-Ejecución

### Consultas Útiles
```sql
-- Ver todos los estudiantes creados
SELECT 
  u.email,
  u.nombre,
  u.apellido,
  e.codigo,
  e.carrera_id,
  e.semestre
FROM usuarios u
JOIN estudiantes e ON u.id = e.usuario_id
WHERE u.tipo_usuario = 'estudiante'
ORDER BY e.codigo;

-- Ver inscripciones de un estudiante específico
SELECT 
  u.nombre,
  u.apellido,
  g.numero_grupo,
  c.nombre as curso,
  i.fecha_inscripcion
FROM inscripciones i
JOIN estudiantes e ON i.estudiante_id = e.id
JOIN usuarios u ON e.usuario_id = u.id
JOIN grupos g ON i.grupo_id = g.id
JOIN cursos c ON g.curso_id = c.id
WHERE u.email = 'estudiante@udem.edu.co'
AND i.activa = true;
```

## Login de Estudiantes

Después de ejecutar el script, los estudiantes pueden hacer login con:
- **Email**: El email especificado en el script
- **Contraseña**: La contraseña especificada en el script

## Solución de Problemas

### Error: "No hay grupos disponibles"
- Verifica que existan grupos en la tabla `grupos` con `activo = true`
- Crea grupos si es necesario

### Error: "No hay carreras disponibles"
- Verifica que existan carreras en la tabla `carreras` con `activo = true`
- Crea carreras si es necesario

### Error: "Grupo no encontrado"
- Verifica que los `grupo_id` en el script existan en la tabla `grupos`
- Ajusta los IDs en el script

### Error: "Carrera no encontrada"
- Verifica que los `carrera_id` en el script existan en la tabla `carreras`
- Ajusta los IDs en el script

## Notas de Seguridad

- **NUNCA** uses la Service Role Key en el frontend
- Las contraseñas se hashean automáticamente
- Los estudiantes se crean con `activo = true` por defecto
- Las inscripciones se crean con `activa = true` por defecto

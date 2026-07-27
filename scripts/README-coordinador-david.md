# Solución para Coordinador David

## Problema Identificado

Cuando el coordinador David ingresa al sistema, no aparecen los datos en el dashboard de coordinador, mientras que otros coordinadores como Mauricio González sí funcionan correctamente.

## Causa del Problema

El sistema tiene configuraciones temporales hardcodeadas para coordinadores específicos (Emilcy y Mauricio), pero no para David. Esto causa que:

1. **David no tiene carrera asignada** en la base de datos
2. **El frontend no reconoce a David** como coordinador con carrera específica
3. **Los endpoints devuelven datos vacíos** porque no saben qué carrera consultar

## Solución Implementada

### 1. Scripts de Verificación y Configuración

#### `verificar-coordinador-david.js`
- Verifica si David existe en la base de datos
- Comprueba si tiene roles de coordinador y profesor
- Muestra qué carrera tiene asignada (si alguna)
- Lista todos los coordinadores existentes

#### `configurar-coordinador-david.js`
- Crea el usuario David si no existe
- Le asigna roles de coordinador y profesor
- Le asigna la carrera de Ingeniería Financiera (ID: 6)
- Verifica la configuración final

### 2. Actualización del Frontend

Se actualizaron los archivos del frontend para incluir configuración temporal para David:

#### `front/src/api/teachers.ts`
```javascript
// TEMPORAL: Forzar carrera_id para coordinadores conocidos
if (user?.email === 'ejhernandez@udemedellin.edu.co') {
  carreraId = '1'; // Emilcy - Sistemas
} else if (user?.email === 'magonzalez@udemedellin.edu.co') {
  carreraId = '5'; // Mauricio - Telecomunicaciones
} else if (user?.email === 'david.coordinador@udemedellin.edu.co' || user?.nombre?.toLowerCase().includes('david')) {
  carreraId = '6'; // David - Ingeniería Financiera
}
```

#### `front/src/pages/ManageProfessors.tsx`
Se agregó la misma lógica para la página de gestión de profesores.

## Cómo Usar

### Paso 1: Verificar Estado Actual

```bash
cd back
node scripts/verificar-coordinador-david.js
```

Este script te mostrará:
- Si David existe en la base de datos
- Qué roles tiene asignados
- Si es coordinador y de qué carrera
- Lista de todos los coordinadores existentes

### Paso 2: Configurar David

```bash
cd back
node scripts/configurar-coordinador-david.js
```

Este script:
- Creará el usuario David si no existe
- Le asignará roles de coordinador y profesor
- Le asignará la carrera de Ingeniería de Sistemas
- Verificará que todo esté configurado correctamente

### Paso 3: Verificar en el Frontend

1. Inicia sesión con David en el frontend
2. Ve al dashboard de coordinador
3. Deberías ver:
   - Estadísticas de profesores de Ingeniería de Sistemas
   - Lista de profesores de la carrera
   - Datos en lugar de valores vacíos

## Configuración de Base de Datos

### Usuario David
- **Email**: `david.coordinador@udemedellin.edu.co`
- **Contraseña**: `Password123!`
- **Nombre**: David
- **Apellido**: Coordinador

### Roles Asignados
- **Coordinador**: Carrera ID 6 (Ingeniería Financiera)
- **Profesor**: Carrera ID 6 (Ingeniería Financiera)

### Tablas Afectadas
- `usuarios`: Usuario principal
- `usuario_roles`: Roles de coordinador y profesor
- `coordinadores`: Información específica de coordinador
- `profesores`: Información específica de profesor

## Verificación de Funcionamiento

### En el Backend
```sql
-- Verificar usuario David
SELECT * FROM usuarios WHERE nombre ILIKE '%david%';

-- Verificar roles
SELECT * FROM usuario_roles WHERE usuario_id = (SELECT id FROM usuarios WHERE nombre ILIKE '%david%');

-- Verificar coordinador
SELECT * FROM coordinadores WHERE usuario_id = (SELECT id FROM usuarios WHERE nombre ILIKE '%david%');

-- Verificar profesor
SELECT * FROM profesores WHERE usuario_id = (SELECT id FROM usuarios WHERE nombre ILIKE '%david%');
```

### En el Frontend
1. Abre las herramientas de desarrollador (F12)
2. Ve a la consola
3. Busca mensajes como:
   - `🔧 TEMPORAL: Forzando carrera_id = 6 para David (Ingeniería Financiera)`
   - `🔍 Carrera del coordinador final: 6`

## Solución Permanente

Para una solución permanente (no temporal), se debe:

1. **Configurar correctamente la base de datos** con todos los coordinadores
2. **Eliminar las configuraciones temporales** del frontend
3. **Implementar un sistema de configuración** que lea la carrera del coordinador desde la base de datos

## Troubleshooting

### Si David sigue sin funcionar:

1. **Verifica la configuración de la base de datos**:
   ```bash
   node scripts/verificar-coordinador-david.js
   ```

2. **Revisa los logs del frontend** en la consola del navegador

3. **Verifica que el backend esté compilado**:
   ```bash
   cd back
   npm run build
   ```

4. **Revisa las variables de entorno** de Supabase

### Si otros coordinadores dejan de funcionar:

1. **Verifica que las configuraciones temporales** estén correctas
2. **Revisa que los emails coincidan** exactamente
3. **Verifica que las carreras existan** en la base de datos

## Notas Importantes

⚠️ **Configuración Temporal**: Las configuraciones hardcodeadas en el frontend son temporales y deben ser reemplazadas por una solución más robusta.

⚠️ **Datos de Prueba**: Si no hay profesores en la carrera de David, ejecuta primero el script de datos de prueba.

⚠️ **Credenciales**: Asegúrate de configurar las credenciales de Supabase en los scripts antes de ejecutarlos.

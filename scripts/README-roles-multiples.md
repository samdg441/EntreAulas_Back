# Sistema de Roles Múltiples - Coordinadores-Profesores

Este sistema permite que los coordinadores de carrera también sean profesores, manteniendo ambos roles simultáneamente.

## 🎯 Problema Resuelto

En la Facultad de Ingenierías, los coordinadores de cada carrera también son profesores. Necesitaban:
- Ser evaluados como profesores
- Evaluar a otros profesores como coordinadores
- Acceder a ambos dashboards según el contexto
- Mantener permisos de ambos roles

## 🏗️ Arquitectura de la Solución

### 1. Base de Datos
- **Tabla `usuario_roles`**: Maneja roles múltiples por usuario
- **Tabla `coordinadores`**: Información específica de coordinadores
- **Funciones SQL**: Para gestión automática de roles
- **Vistas**: Para consultas consolidadas

### 2. Backend
- **RoleService**: Servicio para gestión de roles múltiples
- **Middleware actualizado**: Autenticación con roles múltiples
- **Permisos granulares**: Basados en roles y permisos específicos

### 3. Frontend
- **AuthContext actualizado**: Manejo de roles múltiples
- **RoleBadge**: Componente para mostrar roles
- **Dashboard inteligente**: Selección automática del dashboard principal

## 📋 Instalación

### Paso 1: Ejecutar Scripts de Base de Datos

```sql
-- 1. Ejecutar el sistema de roles múltiples
-- En SQL Editor de Supabase
\i back/scripts/add-multiple-roles-system.sql

-- 2. Crear coordinadores-profesores
\i back/scripts/add-coordinador-profesor.sql
```

### Paso 2: Verificar Instalación

```sql
-- Ver coordinadores creados
SELECT * FROM vista_coordinadores_completa;

-- Ver usuarios con múltiples roles
SELECT * FROM vista_usuarios_roles WHERE total_roles > 1;
```

## 🚀 Uso del Sistema

### Crear un Coordinador-Profesor

```typescript
import { RoleService } from '../services/roleService';

const resultado = await RoleService.crearCoordinadorProfesor({
  email: 'coord.sistemas@udem.edu.co',
  password: 'Password123!',
  nombre: 'Carlos',
  apellido: 'Mendoza',
  codigo_profesor: 'PROF001',
  carrera_id: 1,
  departamento: 'Ingeniería de Sistemas'
});
```

### Verificar Roles de un Usuario

```typescript
// Obtener todos los roles
const roles = await RoleService.obtenerRolesUsuario(usuarioId);

// Verificar rol específico
const esCoordinador = await RoleService.usuarioTieneRol(usuarioId, 'coordinador');
const esProfesor = await RoleService.usuarioTieneRol(usuarioId, 'profesor');
```

### En el Frontend

```tsx
import { useAuth } from '../context/AuthContext';

function MiComponente() {
  const { user, hasRole, hasPermission } = useAuth();

  return (
    <div>
      {/* Mostrar roles múltiples */}
      <RoleBadge roles={user?.roles || []} />
      
      {/* Verificar roles */}
      {hasRole('coordinador') && (
        <button>Acción de Coordinador</button>
      )}
      
      {hasRole('profesor') && (
        <button>Acción de Profesor</button>
      )}
      
      {/* Verificar permisos */}
      {hasPermission('manage_department') && (
        <button>Gestionar Departamento</button>
      )}
    </div>
  );
}
```

## 🔐 Sistema de Permisos

### Jerarquía de Roles
1. **admin** - Acceso completo
2. **coordinador** - Gestión departamental + permisos de profesor
3. **profesor/docente** - Evaluaciones y reportes
4. **estudiante** - Evaluaciones

### Permisos por Rol

#### Admin
- `all` - Todos los permisos

#### Coordinador
- `view_evaluations` - Ver evaluaciones
- `create_evaluations` - Crear evaluaciones
- `view_reports` - Ver reportes
- `manage_users` - Gestionar usuarios
- `manage_department` - Gestionar departamento

#### Profesor/Docente
- `view_evaluations` - Ver evaluaciones
- `create_evaluations` - Crear evaluaciones
- `view_reports` - Ver reportes

#### Estudiante
- `view_evaluations` - Ver evaluaciones
- `submit_evaluations` - Enviar evaluaciones

## 🎛️ Dashboards

### Selección Automática
El sistema selecciona automáticamente el dashboard principal basado en la prioridad de roles:

1. **Admin** → `/dashboard-admin`
2. **Coordinador** → `/dashboard-coordinador`
3. **Profesor** → `/dashboard-profesor`
4. **Estudiante** → `/dashboard-estudiante`

### Acceso a Múltiples Dashboards
Los coordinadores-profesores pueden acceder a ambos dashboards:
- Dashboard principal: Coordinador (por prioridad)
- Dashboard secundario: Profesor (accesible desde el menú)

## 📊 Casos de Uso

### Caso 1: Coordinador Evaluando Profesores
```typescript
// El coordinador puede evaluar profesores de su departamento
if (hasRole('coordinador') && hasPermission('manage_department')) {
  // Mostrar opciones de evaluación departamental
}
```

### Caso 2: Coordinador Siendo Evaluado
```typescript
// El coordinador también puede ser evaluado como profesor
if (hasRole('profesor')) {
  // Mostrar evaluaciones recibidas
}
```

### Caso 3: Navegación entre Dashboards
```typescript
// Permitir cambio entre dashboards
const dashboards = [];
if (hasRole('coordinador')) dashboards.push('/dashboard-coordinador');
if (hasRole('profesor')) dashboards.push('/dashboard-profesor');
```

## 🔧 Funciones SQL Útiles

### Gestión de Roles
```sql
-- Asignar rol
SELECT asignar_rol_usuario(1, 'coordinador');

-- Remover rol
SELECT remover_rol_usuario(1, 'profesor');

-- Verificar rol
SELECT usuario_tiene_rol(1, 'coordinador');

-- Obtener roles
SELECT * FROM obtener_roles_usuario(1);
```

### Consultas de Coordinadores
```sql
-- Ver coordinadores con información completa
SELECT * FROM vista_coordinadores_completa;

-- Coordinadores de una carrera específica
SELECT * FROM vista_coordinadores_completa WHERE carrera_id = 1;

-- Coordinadores que también son profesores
SELECT * FROM vista_coordinadores_completa WHERE codigo_profesor IS NOT NULL;
```

## 🚨 Consideraciones Importantes

### 1. Compatibilidad
- El sistema mantiene compatibilidad con usuarios de un solo rol
- Los usuarios existentes se migran automáticamente

### 2. Seguridad
- Los permisos se verifican en el backend
- El frontend solo muestra/oculta elementos
- Autenticación requerida para todas las operaciones

### 3. Performance
- Los roles se cargan una vez por sesión
- Se usan índices en la base de datos
- Consultas optimizadas con vistas

### 4. Escalabilidad
- Fácil agregar nuevos roles
- Sistema de permisos granular
- Funciones reutilizables

## 🐛 Solución de Problemas

### Error: "Usuario no tiene rol"
```sql
-- Verificar roles asignados
SELECT * FROM usuario_roles WHERE usuario_id = 1 AND activo = true;

-- Reasignar rol si es necesario
SELECT asignar_rol_usuario(1, 'coordinador');
```

### Error: "Dashboard no encontrado"
```typescript
// Verificar roles del usuario
console.log('Roles:', user?.roles);
console.log('Dashboard:', getDashboardPath());
```

### Error: "Permisos insuficientes"
```typescript
// Verificar permisos específicos
console.log('Permisos:', user?.permissions);
console.log('Tiene permiso:', hasPermission('manage_department'));
```

## 📈 Próximas Mejoras

1. **Interfaz de gestión de roles** para administradores
2. **Auditoría de cambios de roles**
3. **Notificaciones automáticas** para cambios de rol
4. **Dashboard unificado** para usuarios con múltiples roles
5. **Reportes de roles y permisos**

## 📞 Soporte

Para problemas o dudas:
1. Revisar logs del backend
2. Verificar estructura de base de datos
3. Comprobar permisos de usuario
4. Consultar documentación de funciones SQL




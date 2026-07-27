# Configuración del Rol de Decano - Celopez

## Descripción

Este documento explica cómo configurar el usuario `celopez@udemedellin.edu.co` como **Decano de la Facultad**, con acceso completo a todas las carreras y profesores de la facultad.

## Características del Rol Decano

### 🎯 **Funcionalidades Principales**
- **Dashboard Específico**: `/dashboard-decano` con interfaz personalizada
- **Vista Completa de la Facultad**: Acceso a todas las carreras y sus profesores
- **Organización por Carreras**: Los profesores se muestran organizados por carrera
- **Estadísticas Generales**: Métricas de toda la facultad
- **Permisos Amplios**: Acceso a reportes y gestión de la facultad

### 🔐 **Permisos del Decano**
- `view_evaluations`: Ver evaluaciones de toda la facultad
- `create_evaluations`: Crear evaluaciones
- `view_reports`: Ver reportes generales
- `manage_users`: Gestionar usuarios
- `manage_department`: Gestionar departamentos
- `manage_faculty`: Gestionar la facultad
- `view_all_professors`: Ver todos los profesores
- `view_all_careers`: Ver todas las carreras

### 📊 **Dashboard del Decano**
- **Estadísticas Generales**:
  - Total de carreras en la facultad
  - Total de profesores en la facultad
  - Promedio general de evaluaciones
  - Profesores activos

- **Vista por Carreras**:
  - Lista de todas las carreras
  - Al hacer clic en una carrera, muestra sus profesores
  - Información detallada de cada profesor

- **Acciones Rápidas**:
  - Ver todas las carreras
  - Acceder a reportes generales
  - Calendario de fechas importantes

## Instalación y Configuración

### 1. **Ejecutar Script SQL**
```bash
cd back/scripts
psql -h tu-host -U tu-usuario -d tu-base-de-datos -f add-decano-role.sql
```

### 2. **Configurar Usuario Decano**
```bash
cd back/scripts
node configurar-decano-celopez.js
```

### 3. **Compilar Backend**
```bash
cd back
npm run build
```

## Estructura de la Base de Datos

### **Tabla `usuario_roles`**
```sql
-- El usuario tendrá el rol 'decano'
INSERT INTO usuario_roles (usuario_id, rol, activo, fecha_asignacion)
VALUES (user_id, 'decano', true, NOW());
```

### **Endpoints Específicos para Decanos**

#### **GET `/api/teachers/faculty`**
- **Descripción**: Obtiene todos los profesores de la facultad organizados por carrera
- **Acceso**: Solo decanos
- **Respuesta**:
```json
{
  "carreras": [
    {
      "id": 1,
      "nombre": "Ingeniería de Sistemas",
      "total_profesores": 15
    }
  ],
  "profesores_por_carrera": {
    "1": [
      {
        "id": 1,
        "nombre": "Juan",
        "apellido": "Pérez",
        "email": "juan@udemedellin.edu.co",
        "carrera_nombre": "Ingeniería de Sistemas",
        "departamento": "Ciencias de la Computación"
      }
    ]
  },
  "total_profesores": 15
}
```

## Flujo de Navegación

### **1. Login**
- El usuario `celopez@udemedellin.edu.co` inicia sesión
- El sistema detecta el rol `decano`
- Redirige automáticamente a `/dashboard-decano`

### **2. Dashboard del Decano**
- **Vista Principal**: Muestra todas las carreras de la facultad
- **Navegación**: Al hacer clic en una carrera, muestra sus profesores
- **Acciones**: Botones para reportes, calendario, etc.

### **3. Gestión de Profesores**
- **Por Carrera**: Ve profesores organizados por carrera
- **Información Completa**: Nombre, email, departamento, código
- **Navegación Intuitiva**: Fácil navegación entre carreras

## Diferencias con el Dashboard de Coordinador

| Característica | Coordinador | Decano |
|----------------|-------------|---------|
| **Alcance** | Una carrera específica | Toda la facultad |
| **Profesores** | Solo de su carrera | Todos los profesores |
| **Carreras** | Una carrera | Todas las carreras |
| **Dashboard** | `/dashboard-coordinador` | `/dashboard-decano` |
| **Permisos** | Limitados a su carrera | Amplios de facultad |

## Verificación de la Configuración

### **1. Verificar Rol en Base de Datos**
```sql
SELECT u.email, ur.rol, ur.activo 
FROM usuarios u 
JOIN usuario_roles ur ON u.id = ur.usuario_id 
WHERE u.email = 'celopez@udemedellin.edu.co';
```

### **2. Verificar Dashboard**
- Iniciar sesión con `celopez@udemedellin.edu.co`
- Debería redirigir a `/dashboard-decano`
- Verificar que muestra todas las carreras

### **3. Verificar Permisos**
- Acceder a `/api/teachers/faculty`
- Debería devolver datos de todas las carreras
- Verificar que otros usuarios no pueden acceder

## Solución de Problemas

### **Problema**: No redirige al dashboard correcto
**Solución**: Verificar que el rol `decano` esté asignado correctamente en `usuario_roles`

### **Problema**: No puede ver profesores de otras carreras
**Solución**: Verificar permisos en `roleService.ts` y endpoint `/teachers/faculty`

### **Problema**: Error 403 en endpoints
**Solución**: Verificar que el usuario tenga el rol `decano` activo

## Archivos Modificados

### **Backend**
- `src/services/roleService.ts` - Permisos y dashboard del decano
- `src/routes/teachers.ts` - Endpoint `/teachers/faculty`
- `scripts/add-decano-role.sql` - Script SQL para el rol
- `scripts/configurar-decano-celopez.js` - Configuración del usuario

### **Frontend**
- `src/pages/DashboardDecano.tsx` - Dashboard específico del decano
- `src/api/teachers.ts` - Función `fetchFacultyProfessors()`
- `src/App.tsx` - Ruta `/dashboard-decano`

## Próximos Pasos

1. **Probar la funcionalidad** con el usuario `celopez@udemedellin.edu.co`
2. **Verificar** que puede ver todas las carreras y profesores
3. **Confirmar** que el dashboard funciona correctamente
4. **Documentar** cualquier problema encontrado

---

## Resumen

El rol de **Decano** proporciona una vista completa de la facultad, permitiendo al usuario `celopez@udemedellin.edu.co` gestionar y supervisar todas las carreras y profesores desde un dashboard específico y funcional. Esta implementación es más clara y organizada que usar el dashboard de coordinador, ya que está diseñada específicamente para las necesidades de un decano de facultad.
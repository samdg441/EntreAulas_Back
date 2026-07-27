# Creación de Tabla de Decanos

## Descripción

Para implementar completamente el sistema de decanos, es recomendable crear una tabla específica `decanos` que almacene información adicional del decano, similar a como existe la tabla `coordinadores`.

## Estructura de la Tabla

### **Tabla `facultades`**
```sql
CREATE TABLE IF NOT EXISTS facultades (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    codigo VARCHAR(50) UNIQUE,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### **Tabla `decanos`**
```sql
CREATE TABLE IF NOT EXISTS decanos (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    facultad_id INTEGER REFERENCES facultades(id) ON DELETE SET NULL,
    fecha_nombramiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT decanos_usuario_unique UNIQUE (usuario_id),
    CONSTRAINT decanos_facultad_unique UNIQUE (facultad_id)
);
```

### **Índices**
```sql
CREATE INDEX IF NOT EXISTS idx_decanos_usuario_id ON decanos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_decanos_facultad_id ON decanos(facultad_id);
CREATE INDEX IF NOT EXISTS idx_decanos_activo ON decanos(activo);
```

## Ventajas de Crear la Tabla

### ✅ **Beneficios:**

1. **Información Específica**: Almacena datos específicos del decano como:
   - Facultad que dirige
   - Fecha de nombramiento
   - Observaciones
   - Estado activo/inactivo

2. **Mejor Organización**: Separa la información del decano de la tabla general de usuarios

3. **Escalabilidad**: Permite agregar más campos específicos en el futuro

4. **Integridad**: Relaciones claras con facultades y usuarios

5. **Consultas Eficientes**: Índices optimizados para búsquedas frecuentes

### 🔧 **Funcionalidades Adicionales:**

- **Gestión de Facultades**: Cada decano puede estar asociado a una facultad específica
- **Historial**: Fecha de nombramiento para seguimiento
- **Observaciones**: Notas adicionales sobre el decano
- **Estado**: Control de decanos activos/inactivos

## Implementación Actual vs. Propuesta

### **Implementación Actual:**
- ✅ Usuario con rol `decano` en `usuario_roles`
- ✅ Dashboard específico `/dashboard-decano`
- ✅ Permisos específicos del decano
- ✅ Endpoints para obtener profesores por facultad

### **Implementación con Tabla `decanos`:**
- ✅ Todo lo anterior +
- ✅ Información específica de facultad
- ✅ Fecha de nombramiento
- ✅ Observaciones y notas
- ✅ Mejor organización de datos
- ✅ Consultas más eficientes

## Cómo Crear las Tablas

### **Opción 1: SQL Directo (Recomendado)**
```bash
# Conectarse a la base de datos PostgreSQL
psql -h tu-host -U tu-usuario -d tu-base-de-datos

# Ejecutar el script SQL
\i scripts/create-decanos-table.sql
```

### **Opción 2: Supabase Dashboard**
1. Ir al dashboard de Supabase
2. Navegar a "SQL Editor"
3. Ejecutar el contenido de `create-decanos-table.sql`

### **Opción 3: Migración**
1. Crear archivo de migración
2. Ejecutar migración en el entorno de desarrollo
3. Aplicar en producción

## Datos de Ejemplo

### **Insertar Facultad:**
```sql
INSERT INTO facultades (nombre, codigo, descripcion) 
VALUES ('Facultad de Ingenierías', 'FI', 'Facultad de Ingenierías de la Universidad de Medellín');
```

### **Insertar Decano:**
```sql
INSERT INTO decanos (usuario_id, facultad_id, observaciones)
SELECT 
    u.id,
    f.id,
    'Decano de la Facultad de Ingenierías'
FROM usuarios u, facultades f
WHERE u.email = 'celopez@udemedellin.edu.co'
AND f.codigo = 'FI';
```

## Verificación

### **Verificar Tablas Creadas:**
```sql
-- Verificar tabla facultades
SELECT * FROM facultades;

-- Verificar tabla decanos
SELECT * FROM decanos;

-- Verificar relaciones
SELECT 
    d.id,
    u.nombre,
    u.apellido,
    f.nombre as facultad
FROM decanos d
JOIN usuarios u ON d.usuario_id = u.id
JOIN facultades f ON d.facultad_id = f.id;
```

## Estado Actual del Sistema

### ✅ **Ya Implementado:**
- Rol `decano` en el sistema de autenticación
- Dashboard específico `/dashboard-decano`
- Permisos específicos del decano
- Endpoints para obtener profesores de toda la facultad
- Validación de tipos de usuario
- Redirección automática al dashboard correcto

### 🔄 **Pendiente (Opcional):**
- Crear tabla `decanos` para información específica
- Crear tabla `facultades` para organización
- Insertar datos del decano en las nuevas tablas

## Recomendación

**El sistema funciona perfectamente sin la tabla `decanos`**, ya que:
- ✅ El rol `decano` está implementado
- ✅ El dashboard funciona correctamente
- ✅ Los permisos están configurados
- ✅ La autenticación funciona

**La tabla `decanos` es una mejora opcional** que proporciona:
- 📊 Mejor organización de datos
- 🔍 Información específica del decano
- 📈 Escalabilidad futura
- 🏛️ Gestión de facultades

## Conclusión

El sistema de decanos está **completamente funcional** con la implementación actual. La creación de la tabla `decanos` es una mejora opcional que se puede implementar cuando sea conveniente, sin afectar la funcionalidad existente.





# Guía Completa para Datos Quemados del Dashboard

## 🎯 **Problema Resuelto**

El dashboard del profesor no muestra datos porque no existen evaluaciones en la base de datos. Los gráficos y estadísticas aparecen vacíos porque el sistema está buscando datos reales que no existen.

## ✅ **Solución Implementada**

Se han creado scripts completos para insertar datos de prueba (datos quemados) que permiten visualizar el funcionamiento del dashboard del profesor.

## 📁 **Archivos Creados**

### 1. `insertar-datos-completos.js`
Script principal que inserta todos los datos necesarios:
- ✅ 100 evaluaciones de prueba
- ✅ Múltiples períodos (2025-2, 2025-1, 2024-2, 2024-1, 2023-2, 2023-1)
- ✅ Calificaciones realistas (3.0 - 5.0)
- ✅ Comentarios variados y creíbles
- ✅ Datos históricos para tendencias

### 2. `verificar-datos-dashboard.js`
Script de verificación que comprueba:
- ✅ Conexión a la base de datos
- ✅ Existencia de profesores, estudiantes, cursos y grupos
- ✅ Evaluaciones insertadas
- ✅ Estadísticas por profesor
- ✅ Resumen completo de datos

## 🚀 **Cómo Usar (Paso a Paso)**

### **Paso 1: Configurar Credenciales**

1. **Edita el archivo de configuración:**
   ```bash
   # Abre back/scripts/insertar-datos-completos.js
   # Reemplaza estas líneas con tus valores de Supabase:
   const supabaseUrl = 'https://tu-proyecto.supabase.co';
   const supabaseKey = 'tu-service-role-key';
   ```

2. **Obtén las credenciales desde Supabase:**
   - Ve a tu proyecto de Supabase
   - Settings → API
   - Copia la URL del proyecto
   - Copia la service_role key (no la anon key)

### **Paso 2: Verificar Estado Actual**

```bash
cd back
node scripts/verificar-datos-dashboard.js
```

Este script te mostrará:
- ✅ Cuántos profesores, estudiantes, cursos y grupos existen
- ✅ Cuántas evaluaciones hay en la base de datos
- ✅ Si el dashboard debería mostrar datos o no

### **Paso 3: Insertar Datos Quemados**

```bash
cd back
node scripts/insertar-datos-completos.js
```

Este script:
- ✅ Limpia evaluaciones existentes (opcional)
- ✅ Genera 100 evaluaciones de prueba
- ✅ Inserta los datos en la base de datos
- ✅ Verifica que todo se insertó correctamente

### **Paso 4: Verificar Resultado**

```bash
cd back
node scripts/verificar-datos-dashboard.js
```

Ahora deberías ver:
- ✅ Total de evaluaciones > 0
- ✅ Estadísticas por profesor
- ✅ Mensaje: "¡El dashboard debería mostrar datos!"

### **Paso 5: Probar en el Frontend**

1. **Ve al dashboard del profesor:**
   ```
   http://localhost:3001/reports
   ```

2. **Verifica que aparezcan:**
   - ✅ Total de evaluaciones > 0
   - ✅ Calificación promedio > 0
   - ✅ Gráficos con datos
   - ✅ Estadísticas por curso
   - ✅ Tendencias históricas

## 📊 **Datos que se Insertan**

### **Evaluaciones de Prueba**
- **Cantidad**: 100 evaluaciones
- **Calificaciones**: Entre 3.0 y 5.0 (aleatorias)
- **Períodos**: 2025-2, 2025-1, 2024-2, 2024-1, 2023-2, 2023-1
- **Comentarios**: 15 comentarios diferentes y realistas

### **Características de los Datos**
- **Realistas**: Las calificaciones y comentarios son creíbles
- **Diversos**: Múltiples profesores, estudiantes, cursos y períodos
- **Históricos**: Incluye datos de períodos anteriores para mostrar tendencias
- **Completos**: Cubre todos los aspectos del dashboard

## 🔧 **Troubleshooting**

### **Error: Variables de entorno no configuradas**
```
❌ Error: Las variables de configuración no están configuradas
```
**Solución**: Edita el archivo del script y configura las credenciales de Supabase.

### **Error: No hay suficientes datos base**
```
❌ Error: No hay suficientes datos base para crear evaluaciones de prueba
```
**Solución**: Asegúrate de que existan profesores, estudiantes, cursos y grupos en la base de datos.

### **Error: Error de conexión**
```
❌ Error: Error de conexión: [mensaje]
```
**Solución**: Verifica que las credenciales de Supabase sean correctas y que la base de datos esté accesible.

### **Dashboard sigue vacío después de insertar datos**
**Posibles causas:**
1. **Cache del navegador**: Refresca la página (Ctrl+F5)
2. **Error en el frontend**: Revisa la consola del navegador (F12)
3. **Datos no se insertaron**: Ejecuta el script de verificación

## 📋 **Verificación de Funcionamiento**

### **En el Backend**
```sql
-- Verificar evaluaciones insertadas
SELECT COUNT(*) as total_evaluaciones FROM evaluaciones;

-- Verificar estadísticas por profesor
SELECT 
    p.id,
    u.nombre,
    u.apellido,
    COUNT(e.id) as total_evaluaciones,
    ROUND(AVG(e.calificacion_general), 2) as promedio
FROM profesores p
JOIN usuarios u ON p.usuario_id = u.id
LEFT JOIN evaluaciones e ON p.id = e.profesor_id
GROUP BY p.id, u.nombre, u.apellido
ORDER BY total_evaluaciones DESC;
```

### **En el Frontend**
1. Abre las herramientas de desarrollador (F12)
2. Ve a la consola
3. Busca mensajes como:
   - `✅ Teacher stats loaded for reports: [datos]`
   - `✅ Historical data loaded: [datos]`
   - `📊 Evaluaciones encontradas: [número]`

## 🎉 **Resultado Esperado**

Después de ejecutar los scripts, el dashboard del profesor mostrará:

### **Estadísticas Principales**
- ✅ **Total Evaluaciones**: > 0
- ✅ **Calificación Promedio**: Entre 3.0 y 5.0
- ✅ **Tasa de Respuesta**: Calculada automáticamente
- ✅ **Cursos Evaluados**: > 0

### **Gráficos y Visualizaciones**
- ✅ **Gráfico de Tendencias**: Línea con datos históricos
- ✅ **Distribución de Calificaciones**: Gráfico de pastel
- ✅ **Calificaciones por Categoría**: Gráfico de barras
- ✅ **Perfil de Competencias**: Gráfico radar

### **Datos Históricos**
- ✅ **Múltiples períodos**: 2023-1 hasta 2025-2
- ✅ **Tendencias**: Evolución de calificaciones
- ✅ **Comparaciones**: Período actual vs anteriores

## ⚠️ **Notas Importantes**

### **Solo para Desarrollo**
- Los datos son **completamente ficticios**
- Solo para propósitos de **demostración y desarrollo**
- **No usar en producción**

### **Limpieza (Opcional)**
Si quieres eliminar los datos de prueba:
```sql
DELETE FROM evaluaciones WHERE comentarios IN (
  'Excelente profesor, muy claro en sus explicaciones',
  'Buen profesor, aunque podría mejorar la metodología',
  -- ... otros comentarios de prueba
);
```

### **Personalización**
Puedes modificar los scripts para:
- Cambiar la cantidad de evaluaciones
- Ajustar el rango de calificaciones
- Agregar más períodos
- Personalizar los comentarios

## 🆘 **Soporte**

Si tienes problemas:

1. **Verifica la configuración**: Credenciales de Supabase
2. **Revisa los logs**: Consola del navegador y terminal
3. **Ejecuta la verificación**: `node scripts/verificar-datos-dashboard.js`
4. **Revisa la base de datos**: Que las tablas existan y tengan datos

## 📞 **Contacto**

Si necesitas ayuda adicional, revisa:
- Los logs de error en la consola
- La documentación de Supabase
- Los scripts de ejemplo en la carpeta `back/scripts/`









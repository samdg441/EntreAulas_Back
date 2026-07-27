# Configuración del Backend - EntreAulas

## Requisitos Previos

- Node.js 18+ 
- PostgreSQL (local o Supabase)
- npm o yarn

## Instalación

### 1. Instalar dependencias
```bash
cd back
npm install
```

### 2. Configurar variables de entorno
Crear archivo `back/.env`:
```env
# Base de datos
DATABASE_URL="postgresql://usuario:password@localhost:5432/conciencia_academica"

# JWT
JWT_SECRET="tu_clave_secreta_muy_segura_aqui"

# Servidor
PORT=3000
NODE_ENV=development
```

### 3. Configurar Prisma
```bash
# Generar cliente Prisma
npx prisma generate

# Si usas una BD existente, hacer introspección
npx prisma db pull

# Si es una BD nueva, aplicar migraciones
npx prisma db push
```

### 4. Ejecutar servidor
```bash
# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

## Estructura del Proyecto

```
back/
├── src/
│   ├── config/
│   │   └── db.ts              # Cliente Prisma
│   ├── middleware/
│   │   └── auth.ts            # Middleware JWT y roles
│   ├── routes/
│   │   ├── auth.ts            # POST /auth/login, /auth/register
│   │   ├── evaluaciones.ts    # GET/POST /evaluaciones
│   │   └── resultados.ts      # GET /resultados
│   ├── app.ts                 # Configuración Express
│   └── server.ts              # Servidor principal
├── prisma/
│   └── schema.prisma          # Modelo de datos
└── package.json
```

## Endpoints Disponibles

### Autenticación
- `POST /auth/register` - Registro de usuarios
- `POST /auth/login` - Inicio de sesión

### Evaluaciones
- `GET /evaluaciones` - Listar evaluaciones del estudiante
- `POST /evaluaciones` - Crear nueva evaluación
- `GET /evaluaciones/preguntas` - Obtener preguntas de evaluación

### Resultados
- `GET /resultados` - Obtener resultados (profesores/coordinadores)
- `GET /resultados/estadisticas` - Estadísticas agregadas

### Health Check
- `GET /health` - Estado del servidor

## Roles de Usuario

- `estudiante` - Puede crear evaluaciones
- `profesor` - Puede ver sus resultados
- `coordinador` - Puede ver resultados departamentales
- `admin` - Acceso completo

## Base de Datos

El esquema incluye las siguientes tablas principales:
- `usuarios` - Usuarios del sistema
- `profesores` - Información de profesores
- `estudiantes` - Información de estudiantes
- `cursos` - Catálogo de cursos
- `grupos` - Grupos de cursos
- `evaluaciones` - Evaluaciones realizadas
- `preguntas_evaluacion` - Preguntas de evaluación
- `respuestas_evaluacion` - Respuestas a preguntas

## Notas de Seguridad

- Las contraseñas se hashean con bcrypt (salt rounds: 10)
- JWT tokens expiran en 24 horas
- Middleware de autenticación en todas las rutas protegidas
- Validación de datos con Zod
- CORS habilitado para desarrollo

## IA: Resumen de respuestas abiertas (Google Gemini)

1. **Obtén tu API key GRATIS**:
   - Ve a https://makersuite.google.com/app/apikey
   - Inicia sesión con tu cuenta de Google
   - Crea una nueva API key (es gratuita, tier generoso)

2. **Configura en `back/.env`**:
   ```env
   GOOGLE_GEMINI_API_KEY=tu_api_key_aqui
   ```

3. **Endpoints disponibles** (requiere JWT con rol docente/admin/coordinador/decano):
   - `POST /api/ai/summarize` - Resumir textos directamente
   - `GET /api/ai/summarize/by-professor?profesor_id=...&periodo_id=...`
   - `GET /api/ai/summarize/by-career?carrera_id=...&periodo_id=...`
   - `GET /api/ai/summarize/by-faculty?periodo_id=...`

4. **Implementación**:
   - **Resumen**: Generado por Google Gemini 2.5 Flash (modelo gratuito, excelente calidad)
   - **Temas**: Extracción local inteligente + temas sugeridos por Gemini
   - **Fallback**: Si Gemini no está disponible, usa resumen local inteligente

5. **Ventajas de Gemini**:
   - ✅ Tier gratuito generoso (60 requests/minuto)
   - ✅ Excelente calidad en español
   - ✅ Sin costos ocultos
   - ✅ Respuestas contextuales y coherentes


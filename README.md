# EntreAulas Backend

## Descripción general
Este backend forma parte del sistema EntreAulas, una plataforma para gestionar evaluaciones tempranas a docentes, recolectar respuestas, visualizar resultados y apoyar la toma de decisiones académicas. Su propósito es reemplazar procesos manuales o basados en formularios estáticos por un sistema más estructurado, seguro y orientado a la universidad.

La API está construida con Node.js, Express y TypeScript, y se integra con Supabase para la persistencia de datos y autenticación.

## ¿Qué funcionalidades ofrece?
El sistema está pensado para cubrir estas funciones principales:

- Autenticación y autorización de usuarios con JWT.
- Registro e inicio de sesión para distintos roles:
  - estudiante
  - profesor / docente
  - coordinador
  - decano
  - admin
- Gestión de evaluaciones y preguntas de encuesta.
- Consulta de resultados y estadísticas para profesores y coordinadores.
- Gestión de cursos, grupos, profesores y relaciones académicas.
- Generación y uso de enlaces QR para evaluaciones.
- Recuperación de contraseña.
- Resúmenes automáticos con IA para análisis de resultados.
- Gestión básica de usuarios por parte de administradores.

## Requisitos
Antes de ejecutar el proyecto necesitas:

- Node.js 18 o superior
- npm
- Una instancia de Supabase configurada
- Variables de entorno definidas en un archivo .env

## Instalación
1. Clona el repositorio.
2. Instala dependencias:

```bash
npm install
```

3. Copia el archivo de ejemplo de variables de entorno:

```bash
cp env.example .env
```

4. Ajusta los valores del archivo .env con tus credenciales de Supabase, JWT y correo.

## Variables de entorno importantes
El proyecto espera estas variables mínimas:

```env
SUPABASE_URL=tu_url_de_supabase
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
JWT_SECRET=tu_secreto_jwt
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

También puedes configurar correo SMTP y claves de IA si vas a usar funciones extras como recuperación de contraseña o resumen con Gemini/Hugging Face.

## Ejecución local
Para iniciar el servidor en modo desarrollo:

```bash
npm run dev
```

El backend quedará disponible en:

```bash
http://localhost:3000
```

## Verificar que el servicio responde
Puedes consultar el estado del servidor con:

```bash
curl http://localhost:3000/health
```

Respuesta esperada:

```json
{ "ok": true }
```

## Estructura del proyecto

```text
src/
  app.ts                 # configuración principal de Express
  server.ts              # arranque del servidor
  routes/                # endpoints agrupados por módulo
  controllers/           # lógica de controladores
  services/              # servicios de negocio
  middleware/            # autenticación y permisos
  config/                # configuración de Supabase y entorno
  utils/                 # utilidades varias
```

## Cómo funciona el flujo principal
1. El usuario inicia sesión mediante /api/auth/login.
2. El backend genera un token JWT válido por 24 horas.
3. Ese token se envía en el header Authorization para proteger rutas.
4. Dependiendo del rol, el usuario puede:
   - responder evaluaciones,
   - ver resultados,
   - gestionar datos académicos,
   - generar enlaces QR,
   - consultar reportes.

## Endpoints principales
La API está montada bajo el prefijo /api.

### 1. Salud y estado
- GET /health
  - Verifica que el servidor esté funcionando.
  - Responde con un objeto JSON simple.

### 2. Autenticación y usuarios
- POST /api/auth/register
  - Registra un nuevo usuario.
  - Recibe: email, nombre, apellido, tipo_usuario, password.
  - Devuelve un token JWT y los datos del usuario.

- POST /api/auth/login
  - Inicia sesión con email y contraseña.
  - Devuelve un token JWT y, si aplica, información de roles múltiples.

- POST /api/auth/login-with-role
  - Permite seleccionar o resolver un rol específico cuando el usuario tiene múltiples roles.

- GET /api/auth/profile
  - Devuelve el perfil del usuario autenticado.

- GET /api/auth/me
  - Devuelve información básica del usuario actual.

- POST /api/auth/create-user
  - Crea un usuario desde un contexto administrativo.
  - Requiere permisos de admin.

- POST /api/auth/forgot-password
  - Envía un correo para recuperar la contraseña.

- GET /api/auth/validate-reset-token/:token
  - Valida un token de recuperación.

- POST /api/auth/reset-password
  - Cambia la contraseña usando el token recibido.

### 3. Evaluaciones
- GET /api/evaluaciones
  - Obtiene las evaluaciones asociadas al estudiante autenticado.
  - Requiere rol estudiante.

- GET /api/evaluaciones/preguntas
  - Devuelve las preguntas disponibles para las evaluaciones.

### 4. Resultados y estadísticas
- GET /api/resultados
  - Obtiene resultados de evaluaciones para profesores, coordinadores o administradores.
  - Puede filtrar por periodo y grupo.

- GET /api/resultados/estadisticas
  - Devuelve métricas agregadas como promedio, mínimo, máximo y distribución por mes.

### 5. Docentes, cursos y reportes académicos
- GET /api/teachers
  - Lista docentes o información general de profesores según el contexto de la sesión.

- GET /api/teachers/:profesorId/stats
  - Devuelve estadísticas de un profesor específico.

- GET /api/teachers/:profesorId/stats/historical
  - Devuelve estadísticas históricas del profesor.

- POST /api/teachers/evaluations
  - Permite registrar o procesar evaluaciones asociadas al profesor.

- GET /api/teachers/evaluation-questions/:courseId
  - Devuelve preguntas vinculadas a un curso.

- GET /api/teachers/student-info
  - Obtiene información relacionada con estudiantes.

- GET /api/teachers/teacher-info
  - Devuelve datos del docente autenticado.

- GET /api/teachers/by-career/:careerId
  - Obtiene información de profesores o datos asociados a una carrera.

- GET /api/teachers/professor-subjects
  - Trae las asignaturas o cursos del profesor.

- GET /api/teachers/career-subjects
  - Trae asignaturas vinculadas a una carrera.

- GET /api/teachers/faculty
  - Devuelve datos de facultad o estructura asociada.

- GET /api/teachers/careers
  - Lista las carreras disponibles.

- GET /api/teachers/:teacherId/courses
  - Lista cursos de un profesor.

- GET /api/teachers/career-results/all
  - Devuelve resultados por carrera de forma general.

- GET /api/teachers/career-results/:careerId
  - Devuelve resultados de una carrera específica.

- GET /api/teachers/student-stats
  - Entrega estadísticas relacionadas con estudiantes.

- GET /api/teachers/student-enrolled-subjects
  - Obtiene materias en las que el estudiante está inscrito.

- GET /api/teachers/teacher-stats/:teacherId
  - Devuelve estadísticas de un docente.

- GET /api/teachers/teacher-courses/:teacherId
  - Lista cursos de un docente.

- GET /api/teachers/teacher-id
  - Devuelve el identificador del docente autenticado.

- GET /api/teachers/period-stats
  - Estadísticas por periodo académico.

- GET /api/teachers/period-category-stats
  - Estadísticas por categoría de evaluación y periodo.

### 6. Cursos
- GET /api/courses/by-career/:careerId
  - Devuelve cursos asociados a una carrera.

### 7. Coordinador
- GET /api/coordinador/cursos-con-profesor
  - Lista cursos relacionados con profesores para la vista del coordinador.

- GET /api/coordinador/dashboard-summary
  - Devuelve un resumen general del panel de coordinador.

- GET /api/coordinador/reports-overview
  - Proporciona una vista general de reportes.

- GET /api/coordinador/profesor-stats/:profesorId
  - Entrega estadísticas de un profesor para el coordinador.

### 8. Evaluaciones con QR
- POST /api/qr-evaluaciones/batch
  - Genera múltiples enlaces QR de evaluación en lote.
  - Recibe un array de grupoIds.
  - Útil para coordinadores o administradores.

- POST /api/qr-evaluaciones/share-email
  - Envía un correo con enlaces de evaluación.

- GET /api/qr-evaluaciones/:token
  - Obtiene información de una evaluación usando el token QR.

- POST /api/qr-evaluaciones/:token/auto-enroll
  - Inscribe automáticamente al usuario a la evaluación vinculada al token.

### 9. IA y análisis de texto
- POST /api/ai/summarize
  - Genera un resumen textual de respuestas o resultados.

- GET /api/ai/summarize/by-professor
  - Resume información por profesor.

- GET /api/ai/summarize/by-career
  - Resume información por carrera.

- GET /api/ai/summarize/by-faculty
  - Resume información por facultad.

### 10. Administración de usuarios
- GET /api/users
  - Lista usuarios del sistema.
  - Requiere permisos de admin.

## Autenticación
La mayoría de los endpoints requieren un token JWT enviado en el header:

```http
Authorization: Bearer <token>
```

El token se obtiene al hacer login y se usa para validar permisos por rol.

## Sugerencias para desarrollo
- Usa Postman o Insomnia para probar los endpoints.
- Mantén el archivo .env fuera del control de versiones.
- Si agregas nuevas rutas, es recomendable documentarlas aquí para mantener el backend claro.

## Notas
 El backend está preparado para servir como capa de negocio y acceso a datos para un frontend que consuma estas rutas.

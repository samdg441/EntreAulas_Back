# API Documentation - EntreAulas

## Base URL
```
http://localhost:3000
```

## Autenticación
Todas las rutas protegidas requieren un token JWT en el header:
```
Authorization: Bearer <token>
```

## Endpoints

### Autenticación

#### POST /auth/register
Registra un nuevo usuario en el sistema.

**Request Body:**
```json
{
  "email": "usuario@ejemplo.com",
  "nombre": "Juan",
  "apellido": "Pérez",
  "tipo_usuario": "estudiante",
  "password": "contraseña123"
}
```

**Response (201):**
```json
{
  "message": "Usuario registrado exitosamente",
  "token": "jwt_token_aqui",
  "user": {
    "id": "uuid",
    "email": "usuario@ejemplo.com",
    "nombre": "Juan",
    "apellido": "Pérez",
    "tipo_usuario": "estudiante"
  }
}
```

#### POST /auth/login
Inicia sesión con email y contraseña.

**Request Body:**
```json
{
  "email": "usuario@ejemplo.com",
  "password": "contraseña123"
}
```

**Response (200):**
```json
{
  "message": "Login exitoso",
  "token": "jwt_token_aqui",
  "user": {
    "id": "uuid",
    "email": "usuario@ejemplo.com",
    "nombre": "Juan",
    "apellido": "Pérez",
    "tipo_usuario": "estudiante"
  }
}
```

### Evaluaciones

#### GET /evaluaciones
Obtiene las evaluaciones del estudiante autenticado.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
[
  {
    "id": "uuid",
    "estudiante_id": "uuid",
    "profesor_id": "uuid",
    "grupo_id": 1,
    "periodo_id": 1,
    "completada": true,
    "comentarios": "Excelente profesor",
    "calificacion_promedio": 4.5,
    "fecha_inicio": "2024-01-01T00:00:00Z",
    "fecha_completada": "2024-01-01T00:30:00Z",
    "profesor": {
      "id": "uuid",
      "usuario": {
        "nombre": "María",
        "apellido": "García"
      }
    },
    "grupo": {
      "id": 1,
      "curso": {
        "id": 1,
        "nombre": "Matemáticas I",
        "codigo": "MAT-101"
      },
      "periodo": {
        "id": 1,
        "nombre": "2024-1",
        "codigo": "2024-1"
      }
    },
    "respuestas_evaluacion": [
      {
        "id": "uuid",
        "pregunta_id": 1,
        "respuesta_rating": 5,
        "pregunta": {
          "id": 1,
          "texto_pregunta": "El profesor explica claramente",
          "categoria": {
            "nombre": "Claridad Expositiva"
          }
        }
      }
    ]
  }
]
```

#### POST /evaluaciones
Crea una nueva evaluación.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "profesor_id": "uuid",
  "grupo_id": 1,
  "periodo_id": 1,
  "comentarios": "Muy buen profesor",
  "respuestas": [
    {
      "pregunta_id": 1,
      "respuesta_rating": 5
    },
    {
      "pregunta_id": 2,
      "respuesta_texto": "Excelente metodología"
    }
  ]
}
```

**Response (201):**
```json
{
  "message": "Evaluación creada exitosamente",
  "evaluacion": {
    // ... objeto evaluación completo
  }
}
```

#### GET /evaluaciones/preguntas
Obtiene todas las preguntas de evaluación activas.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
[
  {
    "id": 1,
    "categoria_id": 1,
    "texto_pregunta": "El profesor explica claramente los conceptos",
    "descripcion": "Evalúa la claridad en la explicación",
    "tipo_pregunta": "rating",
    "opciones": null,
    "obligatoria": true,
    "orden": 1,
    "activa": true,
    "categoria": {
      "id": 1,
      "nombre": "Claridad Expositiva",
      "descripcion": "Evaluación de la claridad en la enseñanza",
      "orden": 1
    }
  }
]
```

### Resultados

#### GET /resultados
Obtiene resultados de evaluaciones (profesores, coordinadores, admin).

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `periodo_id` (opcional): Filtrar por período
- `grupo_id` (opcional): Filtrar por grupo

**Response (200):**
```json
{
  "evaluaciones": [
    // ... array de evaluaciones
  ],
  "estadisticas": [
    {
      "pregunta_id": 1,
      "pregunta_texto": "El profesor explica claramente",
      "categoria": {
        "id": 1,
        "nombre": "Claridad Expositiva"
      },
      "promedio": 4.2,
      "total_respuestas": 25
    }
  ],
  "total_evaluaciones": 25
}
```

#### GET /resultados/estadisticas
Obtiene estadísticas agregadas.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `periodo_id` (opcional): Filtrar por período
- `profesor_id` (opcional): Filtrar por profesor

**Response (200):**
```json
{
  "estadisticas_generales": {
    "promedio_general": 4.3,
    "total_evaluaciones": 50
  },
  "estadisticas_por_categoria": [
    {
      "categoria_id": 1,
      "categoria_nombre": "Claridad Expositiva",
      "promedio": 4.2,
      "total_respuestas": 50
    }
  ]
}
```

## Códigos de Error

- `400` - Datos inválidos
- `401` - No autenticado
- `403` - Permisos insuficientes
- `404` - Recurso no encontrado
- `500` - Error interno del servidor

## Ejemplos de Uso

### Flujo completo de evaluación

1. **Login:**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"estudiante@ejemplo.com","password":"123456"}'
```

2. **Obtener preguntas:**
```bash
curl -X GET http://localhost:3000/evaluaciones/preguntas \
  -H "Authorization: Bearer <token>"
```

3. **Crear evaluación:**
```bash
curl -X POST http://localhost:3000/evaluaciones \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "profesor_id": "uuid",
    "grupo_id": 1,
    "periodo_id": 1,
    "respuestas": [
      {"pregunta_id": 1, "respuesta_rating": 5}
    ]
  }'
```


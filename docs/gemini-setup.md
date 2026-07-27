# Configuración de Google Gemini API

## 🎯 ¿Por qué Gemini?

Google Gemini es una excelente opción para IA porque:
- ✅ **Completamente GRATIS** con tier generoso (60 requests/minuto)
- ✅ **Excelente calidad** en español
- ✅ **Sin costos ocultos** ni sorpresas
- ✅ **Fácil de configurar** (solo necesitas una API key)

## 📝 Pasos para Configurar

### 1. Obtener tu API Key

1. Ve a https://makersuite.google.com/app/apikey
2. Inicia sesión con tu cuenta de Google
3. Haz clic en **"Create API Key"**
4. Selecciona o crea un proyecto de Google Cloud (puede ser uno nuevo)
5. Copia la API key que se genera (empieza con `AIza...`)

### 2. Configurar en el Backend

Abre el archivo `back/.env` y añade:

```env
GOOGLE_GEMINI_API_KEY=AIzaSy...tu_api_key_aqui
```

### 3. Reiniciar el Backend

```bash
cd back
npm run dev
```

Deberías ver:
```
✅ IA conectada correctamente (Google Gemini)
```

### 4. Probar

Ahora cuando uses los endpoints de IA, verás:
- **Resúmenes generados por Gemini** (mucho más naturales y contextuales)
- **Temas extraídos** (combinación de IA + análisis local)

## 🔍 Verificación

Si al reiniciar ves:
```
ℹ️  GOOGLE_GEMINI_API_KEY no configurada - usando resumen local inteligente
```

Significa que:
- No has añadido la variable al `.env`
- O la API key no es válida

## 💡 Ejemplo de Uso

Una vez configurado, cuando un profesor use la card de IA en los resultados:

**Antes (sin Gemini)**: 
> "Se analizaron 45 respuestas. Predominan comentarios sobre aspectos positivos..."

**Ahora (con Gemini)**:
> "Los estudiantes valoran positivamente la claridad de las explicaciones y la disponibilidad del profesor para resolver dudas. Sin embargo, mencionan que el ritmo de clase es rápido y sugieren más ejercicios prácticos para consolidar los conceptos."

## 📊 Límites del Tier Gratuito

- **60 requests por minuto** (más que suficiente para uso normal)
- **Sin límite de requests diarios**
- **Sin tarjeta de crédito requerida**

## 🛡️ Seguridad

- ✅ Nunca subas tu `.env` al repositorio
- ✅ La API key solo se usa en el backend (nunca en el frontend)
- ✅ Si expones tu key, puedes revocarla y crear una nueva en el mismo link

## ❓ Troubleshooting

**Error: "API_KEY_INVALID"**
- Verifica que copiaste toda la API key correctamente
- Asegúrate de que no haya espacios antes/después

**Error: "API key not found"**
- Verifica que el archivo `.env` esté en `back/.env`
- Reinicia el servidor después de modificar `.env`

**Sigue usando resumen local:**
- Revisa la consola del backend para ver el mensaje exacto
- Verifica que la variable esté en mayúsculas: `GOOGLE_GEMINI_API_KEY`



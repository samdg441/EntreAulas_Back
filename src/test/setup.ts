import dotenv from 'dotenv'

dotenv.config()

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret'

// Las pruebas nunca envían correos reales: las que prueban el envío levantan su propio buzón SMTP local.
// Se deja vacío (no delete) para que el dotenv.config() de app.ts no vuelva a cargar el valor del .env.
for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'BREVO_API_KEY']) {
  process.env[key] = ''
}

// El modo debug de recuperación lo activa cada prueba que lo necesita, no el .env local.
process.env.PASSWORD_RESET_DEBUG_RESPONSE = ''

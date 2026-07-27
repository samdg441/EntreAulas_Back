import { Router } from 'express'
import { supabaseAdmin } from '../config/supabaseClient'
import crypto from 'crypto'
import { hashPassword } from '../utils/passwordSecurity'

const router = Router()

// Interfaz para el token de reset
interface ResetToken {
  id: string
  email: string
  token: string
  expires_at: string
  used: boolean
  created_at: string
}

// Función para generar token seguro
function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Función para generar fecha de expiración (1 hora)
function generateExpirationDate(): string {
  const expirationDate = new Date()
  expirationDate.setHours(expirationDate.getHours() + 1)
  return expirationDate.toISOString()
}

// Endpoint para solicitar reset de contraseña
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body

    // Validar que se proporcione el email
    if (!email) {
      return res.status(400).json({ 
        error: 'El correo electrónico es requerido' 
      })
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Formato de correo electrónico inválido' 
      })
    }


    // Verificar que el usuario existe
    const { data: user, error: userError } = await supabaseAdmin
      .from('usuarios')
      .select('id, email, nombre, apellido')
      .eq('email', email)
      .eq('activo', true)
      .single()

    if (userError || !user) {
      // No revelar si el correo existe
      return res.status(200).json({ 
        message: 'Si el correo electrónico existe en nuestro sistema, recibirás un enlace de recuperación' 
      })
    }

    // Generar token de reset
    const resetToken = generateResetToken()
    const expiresAt = generateExpirationDate()

    // Guardar token en la base de datos
    const { error: tokenError } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({
        email: email,
        token: resetToken,
        expires_at: expiresAt,
        used: false
      })

    if (tokenError) {
      console.error('❌ Error al guardar token de reset:', tokenError)
      return res.status(500).json({ 
        error: 'Error interno del servidor' 
      })
    }

    // TODO: enviar correo con enlace (nodemailer); nunca devolver el token en JSON en producción.

    const debugReset =
      process.env.PASSWORD_RESET_DEBUG_RESPONSE === 'true' &&
      process.env.NODE_ENV !== 'production'

    res.status(200).json({
      message:
        'Si el correo electrónico existe en nuestro sistema, recibirás un enlace de recuperación',
      ...(debugReset && {
        resetToken,
        resetLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/forgot-password?token=${resetToken}&email=${encodeURIComponent(email)}`
      })
    })

  } catch (error) {
    console.error('❌ Error en forgot-password:', error)
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    })
  }
})

// Endpoint para validar token de reset
router.get('/validate-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params
    const { email } = req.query

    if (!email) {
      return res.status(400).json({ 
        error: 'El correo electrónico es requerido' 
      })
    }


    // Buscar el token en la base de datos
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('*')
      .eq('token', token)
      .eq('email', email)
      .eq('used', false)
      .single()

    if (tokenError || !tokenData) {
      return res.status(400).json({ 
        error: 'Token inválido o ya utilizado' 
      })
    }

    // Verificar si el token ha expirado
    const now = new Date()
    const expirationDate = new Date(tokenData.expires_at)

    if (now > expirationDate) {
      return res.status(400).json({ 
        error: 'El token ha expirado. Solicita uno nuevo.' 
      })
    }

    res.status(200).json({ 
      message: 'Token válido',
      valid: true
    })

  } catch (error) {
    console.error('❌ Error en validate-reset-token:', error)
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    })
  }
})

// Endpoint para resetear la contraseña
router.post('/reset-password', async (req, res) => {
  try {
    const { token, email, newPassword, confirmPassword } = req.body

    // Validar datos requeridos
    if (!token || !email || !newPassword || !confirmPassword) {
      return res.status(400).json({ 
        error: 'Todos los campos son requeridos' 
      })
    }

    // Validar que las contraseñas coincidan
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        error: 'Las contraseñas no coinciden' 
      })
    }

    // Validar fortaleza de la contraseña
    const minLength = 8
    const hasUpperCase = /[A-Z]/.test(newPassword)
    const hasLowerCase = /[a-z]/.test(newPassword)
    const hasNumbers = /\d/.test(newPassword)
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword)

    if (newPassword.length < minLength) {
      return res.status(400).json({ 
        error: 'La contraseña debe tener al menos 8 caracteres' 
      })
    }
    if (!hasUpperCase) {
      return res.status(400).json({ 
        error: 'La contraseña debe contener al menos una letra mayúscula' 
      })
    }
    if (!hasLowerCase) {
      return res.status(400).json({ 
        error: 'La contraseña debe contener al menos una letra minúscula' 
      })
    }
    if (!hasNumbers) {
      return res.status(400).json({ 
        error: 'La contraseña debe contener al menos un número' 
      })
    }
    if (!hasSpecialChar) {
      return res.status(400).json({ 
        error: 'La contraseña debe contener al menos un carácter especial' 
      })
    }

    // Buscar y validar el token
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('*')
      .eq('token', token)
      .eq('email', email)
      .eq('used', false)
      .single()

    if (tokenError || !tokenData) {
      return res.status(400).json({ 
        error: 'Token inválido o ya utilizado' 
      })
    }

    // Verificar si el token ha expirado
    const now = new Date()
    const expirationDate = new Date(tokenData.expires_at)

    if (now > expirationDate) {
      return res.status(400).json({ 
        error: 'El token ha expirado. Solicita uno nuevo.' 
      })
    }

    // Verificar que el usuario existe
    const { data: user, error: userError } = await supabaseAdmin
      .from('usuarios')
      .select('id, email')
      .eq('email', email)
      .eq('activo', true)
      .single()

    if (userError || !user) {
      return res.status(400).json({ 
        error: 'Usuario no encontrado' 
      })
    }

    const hashedPassword = await hashPassword(newPassword)

    // Actualizar la contraseña del usuario
    const { error: updateError } = await supabaseAdmin
      .from('usuarios')
      .update({ 
        password: hashedPassword,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('❌ Error al actualizar contraseña:', updateError)
      return res.status(500).json({ 
        error: 'Error al actualizar la contraseña' 
      })
    }

    // Marcar el token como usado
    const { error: markUsedError } = await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('id', tokenData.id)

    if (markUsedError) {
      console.error('❌ Error al marcar token como usado:', markUsedError)
      // No es crítico, solo logueamos el error
    }

    res.status(200).json({ 
      message: 'Contraseña actualizada exitosamente'
    })

  } catch (error) {
    console.error('❌ Error en reset-password:', error)
    res.status(500).json({ 
      error: 'Error interno del servidor' 
    })
  }
})

export default router

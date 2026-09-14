import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { authRepository } from './auth.repository'
import { verifyStoredPassword } from '../../utils/passwordSecurity'
import { dashboardDesdeRolSeleccionado } from './dashboard'
import { proyectarUsuarioPublico } from './auth.dto'
import {
  armarPerfilConRoles,
  autenticarCredenciales,
  crearUsuarioConTipo,
  generarTokenSesion,
  migrarPasswordSiHaceFalta,
  normalizarTipoUsuario,
  resolverRolesUsuario
} from './auth.service'
import {
  badRequest,
  notFound,
  sendError,
  unauthorized,
  asyncHandler
} from '../../shared/errors'

const router = Router()

const registerSchema = z.object({
  email: z.string().email(),
  nombre: z.string().min(2),
  apellido: z.string().min(2),
  tipo_usuario: z.enum(['estudiante', 'profesor', 'docente', 'coordinador', 'admin', 'decano']),
  password: z.string().min(8),
  // Campos opcionales para profesores
  codigo_profesor: z.string().optional(),
  departamento: z.string().optional(),
  // Campos opcionales para estudiantes
  codigo_estudiante: z.string().optional(),
  carrera_id: z.number().optional(),
  semestre: z.string().optional()
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

// POST /auth/register
router.post('/register', asyncHandler(async (req, res) => {
  let validatedData
  try {
    validatedData = registerSchema.parse(req.body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, badRequest('Datos inválidos', error.errors))
    }
    throw error
  }

  const user = await crearUsuarioConTipo(validatedData)
  const token = generarTokenSesion({ userId: user.id, email: user.email, tipo_usuario: user.tipo_usuario })

  res.status(201).json({
    message: 'Usuario registrado exitosamente',
    token,
    user: proyectarUsuarioPublico(user)
  })
}))

// POST /auth/login
router.post('/login', asyncHandler(async (req, res) => {
  let validatedData
  try {
    validatedData = loginSchema.parse(req.body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, badRequest('Datos inválidos', error.errors))
    }
    throw error
  }

  const user = await autenticarCredenciales(validatedData.email, validatedData.password)
  const roles = await resolverRolesUsuario(user.id, user.tipo_usuario)

  if (roles.length > 1) {
    return res.status(200).json({
      message: 'Usuario con múltiples roles detectado',
      user: proyectarUsuarioPublico(user, { roles, multiple_roles: true }),
      available_roles: roles,
      requires_role_selection: true
    })
  }

  const token = generarTokenSesion({ userId: user.id, email: user.email, tipo_usuario: user.tipo_usuario })
  const additionalInfo = await armarPerfilConRoles(user.id, roles, user.tipo_usuario)
  const userTypeDisplay = normalizarTipoUsuario(user.tipo_usuario)

  res.json({
    message: 'Login exitoso',
    token,
    user: proyectarUsuarioPublico(user, {
      user_type: userTypeDisplay,
      user_role: userTypeDisplay,
      ...additionalInfo
    })
  })
}))

// POST /auth/login-with-role - Login con rol específico
router.post('/login-with-role', async (req, res) => {
  try {
    const { email, password, selectedRole } = req.body

    const user = await authRepository.findUserByEmail(email)

    if (!user) {
      throw unauthorized('Credenciales inválidas')
    }

    if (!user.activo) {
      throw unauthorized('Credenciales inválidas')
    }

    const passwordCheck = await verifyStoredPassword(password, user.password)

    if (!passwordCheck.ok) {
      throw unauthorized('Credenciales inválidas')
    }

    await migrarPasswordSiHaceFalta(user.id, passwordCheck)

    const { RoleService } = await import('./role.service')
    const roles = await RoleService.obtenerRolesUsuario(user.id)

    if (!roles.includes(selectedRole)) {
      throw unauthorized('Credenciales inválidas')
    }

    // Generar token JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        selectedRole: selectedRole
      },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    )

    const dashboard = dashboardDesdeRolSeleccionado(selectedRole)

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        tipo_usuario: user.tipo_usuario,
        roles: roles,
        selected_role: selectedRole,
        dashboard: dashboard
      }
    })
  } catch (error) {
    return sendError(res, error)
  }
})

// GET /auth/profile — sesión actual (middleware JWT). Preferible para nuevas integraciones.
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      throw unauthorized('No autenticado')
    }

    const u = await authRepository.findUserById(req.user.id)
    if (!u) {
      throw notFound('Usuario no encontrado')
    }

    res.json({
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      apellido: u.apellido,
      tipo_usuario: u.tipo_usuario,
      activo: u.activo,
      created_at: u.created_at,
      roles: req.user.roles,
      permisos: req.user.permisos
    })
  } catch (e) {
    return sendError(res, e)
  }
})

// GET /auth/me - Obtener información del usuario actual
router.get('/me', async (req, res) => {
  try {
    // Obtener el token del header Authorization
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw unauthorized('Token de autorización requerido')
    }

    const token = authHeader.substring(7) // Remover 'Bearer '

    // Verificar y decodificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any

    // Buscar el usuario en la base de datos
    const user = await authRepository.findUserByEmail(decoded.email)

    if (!user || !user.activo) {
      throw unauthorized('Usuario no encontrado o inactivo')
    }

    // Determinar el tipo de usuario para la respuesta
    let userTypeDisplay = user.tipo_usuario
    let userRole = user.tipo_usuario

    // Normalizar 'docente' a 'profesor' para compatibilidad
    if (user.tipo_usuario === 'docente') {
      userTypeDisplay = 'profesor'
      userRole = 'profesor'
    }

    // Información adicional según el tipo de usuario
    let additionalInfo = {}

    switch (user.tipo_usuario) {
      case 'estudiante':
        additionalInfo = {
          dashboard: '/dashboard-estudiante',
          permissions: ['view_evaluations', 'submit_evaluations'],
          role_description: 'Estudiante del sistema'
        }
        break
      case 'profesor':
      case 'docente':
        additionalInfo = {
          dashboard: '/dashboard-profesor',
          permissions: ['view_evaluations', 'create_evaluations', 'view_reports'],
          role_description: 'Profesor/Docente del sistema'
        }
        break
      case 'coordinador':
        additionalInfo = {
          dashboard: '/dashboard-coordinador',
          permissions: ['view_evaluations', 'create_evaluations', 'view_reports', 'manage_users'],
          role_description: 'Coordinador académico'
        }
        break
      case 'admin':
        additionalInfo = {
          dashboard: '/dashboard-admin',
          permissions: ['all'],
          role_description: 'Administrador del sistema'
        }
        break
    }

    // Devolver información del usuario (sin la contraseña)
    res.json({
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      tipo_usuario: user.tipo_usuario,
      user_type: userTypeDisplay,
      user_role: userRole,
      activo: user.activo,
      created_at: user.created_at,
      ...additionalInfo
    })
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return sendError(res, unauthorized('Token expirado'))
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return sendError(res, unauthorized('Token inválido'))
    }
    return sendError(res, error)
  }
})

// POST /auth/create-user - Crear usuario con hash automático (solo administradores)
router.post('/create-user', authenticateToken, requireRole(['admin']), asyncHandler(async (req, res) => {
  const {
    email,
    password,
    nombre,
    apellido,
    tipo_usuario,
    // Campos opcionales para profesores
    codigo_profesor,
    departamento,
    // Campos opcionales para estudiantes
    codigo_estudiante,
    carrera_id,
    semestre
  } = req.body

  if (!email || !password || !nombre || !apellido || !tipo_usuario) {
    throw badRequest('Todos los campos son requeridos')
  }

  if (typeof password !== 'string' || password.length < 8) {
    throw badRequest('La contraseña debe tener al menos 8 caracteres')
  }

  const user = await crearUsuarioConTipo({
    email, password, nombre, apellido, tipo_usuario,
    codigo_profesor, departamento, codigo_estudiante, carrera_id, semestre
  })

  res.status(201).json({
    message: 'Usuario creado exitosamente',
    user: proyectarUsuarioPublico(user, { activo: user.activo })
  })
}))

export default router

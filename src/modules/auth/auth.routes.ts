import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { limiteLogin } from '../../middleware/limite-de-intentos'
import { authRepository } from './auth.repository'
import {
  hashPassword,
  igualarTiempoSinCuenta,
  tokenAnteriorAlCambioDeClave,
  validarPoliticaDeClave,
  verifyStoredPassword
} from '../../utils/passwordSecurity'
import { dashboardDesdeRolSeleccionado } from './dashboard'
import {
  badRequest,
  forbidden,
  notFound,
  sendError,
  unauthorized,
} from '../../shared/errors'
import { normalizarCorreoInstitucional } from './correo-institucional'
import {
  armarPerfilConRoles,
  infoPorTipoDeUsuario,
  migrarPasswordSiHaceFalta,
  normalizarTipoUsuario,
  resolverRolesUsuario,
  VALID_USER_TYPES,
} from './auth.service'

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

// RQ1: las demás cuentas solo las crea un administrador con create-user (DEF-39).
const TIPOS_AUTORREGISTRO = new Set(['estudiante'])

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const validatedData = registerSchema.parse(req.body)

    if (!TIPOS_AUTORREGISTRO.has(validatedData.tipo_usuario)) {
      throw forbidden('El autorregistro solo está disponible para estudiantes; las demás cuentas las crea un administrador')
    }

    const errorClave = validarPoliticaDeClave(validatedData.password)
    if (errorClave) {
      throw badRequest(errorClave)
    }

    // Verificar si el usuario ya existe
    const existingUser = await authRepository.findUserByEmail(validatedData.email)

    if (existingUser) {
      throw badRequest('El email ya está registrado')
    }

    const hashedPassword = await hashPassword(validatedData.password)

    // Crear usuario con inserción automática en tabla específica
    const user = await authRepository.createUserWithType({
      email: validatedData.email,
      password: hashedPassword,
      nombre: validatedData.nombre,
      apellido: validatedData.apellido,
      tipo_usuario: validatedData.tipo_usuario,
      // Campos para profesores
      codigo_profesor: validatedData.codigo_profesor,
      departamento: validatedData.departamento,
      // Campos para estudiantes
      codigo_estudiante: validatedData.codigo_estudiante,
      carrera_id: validatedData.carrera_id,
      semestre: validatedData.semestre
    })

    // Generar JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, tipo_usuario: user.tipo_usuario },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    )

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        tipo_usuario: user.tipo_usuario
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, badRequest('Datos inválidos', error.errors))
    }
    return sendError(res, error)
  }
})

// POST /auth/login
router.post('/login', limiteLogin, async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body)

    const user = await authRepository.findUserByEmail(validatedData.email)

    // Mismo mensaje y mismo costo (bcrypt) exista o no la cuenta: no se puede enumerar usuarios (DEF-41).
    if (!user?.activo) {
      await igualarTiempoSinCuenta(validatedData.password)
      throw unauthorized('Credenciales inválidas')
    }

    const passwordCheck = await verifyStoredPassword(
      validatedData.password,
      user.password
    )

    if (!passwordCheck.ok) {
      throw unauthorized('Credenciales inválidas')
    }

    await migrarPasswordSiHaceFalta(user.id, passwordCheck)

    // Roles y perfil: reglas de auth.service.ts (antes estaban duplicadas aquí).
    const roles = await resolverRolesUsuario(user.id, user.tipo_usuario)

    if (roles.length > 1) {
      return res.status(200).json({
        message: 'Usuario con múltiples roles detectado',
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          apellido: user.apellido,
          tipo_usuario: user.tipo_usuario,
          roles: roles,
          multiple_roles: true
        },
        available_roles: roles,
        requires_role_selection: true
      })
    }

    // Generar JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, tipo_usuario: user.tipo_usuario },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    )

    // Normalizar 'docente' a 'profesor' para compatibilidad
    const userTypeDisplay = normalizarTipoUsuario(user.tipo_usuario)
    const userRole = userTypeDisplay

    // Panel, permisos y datos de coordinador/decano según los roles
    const additionalInfo = await armarPerfilConRoles(user.id, roles, user.tipo_usuario)

    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        tipo_usuario: user.tipo_usuario,
        user_type: userTypeDisplay,
        user_role: userRole,
        ...additionalInfo
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, badRequest('Datos inválidos', error.errors))
    }
    return sendError(res, error)
  }
})

// POST /auth/login-with-role - Login con rol específico
router.post('/login-with-role', limiteLogin, async (req, res) => {
  try {
    const { email, password, selectedRole } = req.body

    const user = await authRepository.findUserByEmail(email)

    if (!user?.activo) {
      await igualarTiempoSinCuenta(password)
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
    if (!authHeader?.startsWith('Bearer ')) {
      throw unauthorized('Token de autorización requerido')
    }

    const token = authHeader.substring(7) // Remover 'Bearer '

    // Verificar y decodificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload & { email?: string }

    // Buscar el usuario en la base de datos
    if (!decoded.email) {
      throw unauthorized('Token inválido')
    }

    const user = await authRepository.findUserByEmail(decoded.email)

    if (!user?.activo) {
      throw unauthorized('Usuario no encontrado o inactivo')
    }

    if (tokenAnteriorAlCambioDeClave(decoded.iat, user.password_changed_at)) {
      throw unauthorized('La sesión expiró porque la contraseña cambió')
    }

    // Normalizar 'docente' a 'profesor' para compatibilidad
    const userTypeDisplay = normalizarTipoUsuario(user.tipo_usuario)
    const userRole = userTypeDisplay
    const additionalInfo = infoPorTipoDeUsuario(user.tipo_usuario)

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
router.post('/create-user', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
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

    if (typeof tipo_usuario !== 'string' || !VALID_USER_TYPES.has(tipo_usuario)) {
      throw badRequest('tipo_usuario inválido')
    }

    const errorClave = validarPoliticaDeClave(password)
    if (errorClave) {
      throw badRequest(errorClave)
    }

    const correoInstitucional = normalizarCorreoInstitucional(email, tipo_usuario)

    const existingUser = await authRepository.findUserByEmail(correoInstitucional)
    if (existingUser) {
      throw badRequest('El email ya está registrado')
    }

    const hashedPassword = await hashPassword(password)

    // Crear usuario con inserción automática en tabla específica
    const user = await authRepository.createUserWithType({
      email: correoInstitucional,
      password: hashedPassword,
      nombre,
      apellido,
      tipo_usuario,
      // Campos para profesores
      codigo_profesor,
      departamento,
      // Campos para estudiantes
      codigo_estudiante,
      carrera_id,
      semestre
    })

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        tipo_usuario: user.tipo_usuario,
        activo: user.activo
      }
    })
  } catch (error) {
    return sendError(res, error)
  }
})

export default router

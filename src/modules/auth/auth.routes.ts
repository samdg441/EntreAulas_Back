import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { authenticateToken, requireRole } from '../../middleware/auth'
import { authRepository } from './auth.repository'
import {
  hashPassword,
  verifyStoredPassword
} from '../../utils/passwordSecurity'
import { dashboardDesdeRolSeleccionado } from './dashboard'

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

const VALID_USER_TYPES = new Set(['estudiante', 'profesor', 'docente', 'coordinador', 'admin', 'decano'])


async function migrarPasswordSiHaceFalta(
  userId: string,
  passwordCheck: { migratePlaintextToHash?: string }
): Promise<void> {
  if (!passwordCheck.migratePlaintextToHash) return
  try {
    const hashedPassword = await hashPassword(passwordCheck.migratePlaintextToHash)
    await authRepository.updateUser(userId, { password: hashedPassword })
  } catch (updateError) {
    console.error('Error migrando contraseña a bcrypt:', updateError)
  }
}

function tieneRolValido(tipoUsuario: string, roles: string[]): boolean {
  return (
    VALID_USER_TYPES.has(tipoUsuario) ||
    roles.some((rol) => VALID_USER_TYPES.has(rol))
  )
}

// Normaliza 'docente' a 'profesor' para compatibilidad con el frontend.
function normalizarTipoUsuario(tipoUsuario: string): string {
  return tipoUsuario === 'docente' ? 'profesor' : tipoUsuario
}

function describirRolPrincipal(roles: string[], tipoUsuario: string): string {
  if (roles.includes('admin')) return 'Administrador del sistema'
  if (roles.includes('decano')) return 'Decano de la facultad'
  if (roles.includes('coordinador')) return 'Coordinador del sistema'
  if (roles.includes('profesor') || roles.includes('docente')) return 'Profesor/Docente del sistema'
  if (roles.includes('estudiante')) return 'Estudiante del sistema'
  return roles.length > 1
    ? `Usuario con múltiples roles: ${roles.join(', ')}`
    : `Usuario con rol: ${roles[0] || tipoUsuario}`
}

async function obtenerCoordinadorInfo(
  roles: string[],
  userId: string
): Promise<{ carrera_id: unknown } | null> {
  if (!roles.includes('coordinador')) return null
  try {
    const { RoleService } = await import('./role.service')
    const info = await RoleService.obtenerCoordinadorPorUsuario(userId)
    return info ? { carrera_id: info.carrera_id ?? null } : null
  } catch (e) {
    console.warn('Error obteniendo info del coordinador:', e)
    return null
  }
}

async function obtenerDecanoInfo(
  roles: string[],
  userId: string
): Promise<Record<string, unknown> | null> {
  if (!roles.includes('decano')) return null
  try {
    const { RoleService } = await import('./role.service')
    const info = await RoleService.obtenerDecanoPorUsuario(userId)
    if (!info) return null
    return {
      facultad_id: info.facultad_id ?? null,
      facultad_nombre: info.facultades?.nombre ?? null,
      fecha_nombramiento: info.fecha_nombramiento
    }
  } catch (e) {
    console.warn('Error obteniendo info del decano:', e)
    return null
  }
}

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const validatedData = registerSchema.parse(req.body)
    
    // Verificar si el usuario ya existe
    const existingUser = await authRepository.findUserByEmail(validatedData.email)

    if (existingUser) {
      return res.status(400).json({ error: 'El email ya está registrado' })
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
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors })
    }
    console.error('Error en registro:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body)

    const user = await authRepository.findUserByEmail(validatedData.email)

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    if (!user.activo) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    const passwordCheck = await verifyStoredPassword(
      validatedData.password,
      user.password
    )

    if (!passwordCheck.ok) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    await migrarPasswordSiHaceFalta(user.id, passwordCheck)

    const { RoleService } = await import('./role.service')
    const roles = await RoleService.obtenerRolesUsuario(user.id)

    if (!tieneRolValido(user.tipo_usuario, roles)) {
      return res.status(401).json({ error: 'Tipo de usuario no válido' })
    }

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

    // Determinar el dashboard basado en roles múltiples
    const dashboard = await RoleService.obtenerDashboardUsuario(user.id)
    const permisos = await RoleService.obtenerPermisosUsuario(user.id)

    const coordinadorInfo = await obtenerCoordinadorInfo(roles, user.id)
    const decanoInfo = await obtenerDecanoInfo(roles, user.id)

    // Normalizar 'docente' a 'profesor' para compatibilidad
    const userTypeDisplay = normalizarTipoUsuario(user.tipo_usuario)
    const userRole = userTypeDisplay

    // Información adicional según los roles del usuario
    const additionalInfo: any = {
      dashboard: dashboard,
      permissions: permisos,
      roles: roles,
      role_description: describirRolPrincipal(roles, user.tipo_usuario)
    }

    if (coordinadorInfo) {
      additionalInfo.coordinador = coordinadorInfo
    }

    if (decanoInfo) {
      additionalInfo.decano = decanoInfo
    }

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
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors })
    }
    console.error('Error en login:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// POST /auth/login-with-role - Login con rol específico
router.post('/login-with-role', async (req, res) => {
  try {
    const { email, password, selectedRole } = req.body

    const user = await authRepository.findUserByEmail(email)

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    if (!user.activo) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    const passwordCheck = await verifyStoredPassword(password, user.password)

    if (!passwordCheck.ok) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    await migrarPasswordSiHaceFalta(user.id, passwordCheck)

    const { RoleService } = await import('./role.service')
    const roles = await RoleService.obtenerRolesUsuario(user.id)

    if (!roles.includes(selectedRole)) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
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
    console.error('Error en login con rol:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /auth/profile — sesión actual (middleware JWT). Preferible para nuevas integraciones.
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    const u = await authRepository.findUserById(req.user.id)
    if (!u) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
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
    console.error('GET /auth/profile:', e)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// GET /auth/me - Obtener información del usuario actual
router.get('/me', async (req, res) => {
  try {
    // Obtener el token del header Authorization
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autorización requerido' })
    }

    const token = authHeader.substring(7) // Remover 'Bearer '

    // Verificar y decodificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any

    // Buscar el usuario en la base de datos
    const user = await authRepository.findUserByEmail(decoded.email)

    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo' })
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
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Token inválido' })
    }
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expirado' })
    }
    console.error('Error en /auth/me:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
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
      return res.status(400).json({ error: 'Todos los campos son requeridos' })
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        error: 'La contraseña debe tener al menos 8 caracteres'
      })
    }

    const existingUser = await authRepository.findUserByEmail(email)
    if (existingUser) {
      return res.status(400).json({ error: 'El email ya está registrado' })
    }

    const hashedPassword = await hashPassword(password)
    
    // Crear usuario con inserción automática en tabla específica
    const user = await authRepository.createUserWithType({
      email,
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
    console.error('Error creando usuario:', error)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

export default router

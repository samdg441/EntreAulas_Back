import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Cargar variables de entorno
dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Faltan las variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
}

// Cliente de Supabase con permisos de administrador
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

// Funciones de base de datos usando Supabase
export class SupabaseDB {
  static supabaseAdmin = supabaseAdmin
  // Usuarios
  static async createUser(userData: {
    email: string
    password: string
    nombre: string
    apellido: string
    tipo_usuario: string
  }) {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .insert([userData])
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  static async findUserByEmail(email: string) {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .select('*')
      .eq('email', email)
      .single()
    
    if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows returned
    return data
  }

  static async findUserById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error && error.code !== 'PGRST116') throw error
    return data
  }

  static async updateUser(id: string, updates: any) {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  static async countUsers() {
    const { count, error } = await supabaseAdmin
      .from('usuarios')
      .select('*', { count: 'exact', head: true })
    
    if (error) throw error
    return count || 0
  }

  /** Listado para administración: sin columna `password`. */
  static async listUsersSummary() {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .select('id, email, nombre, apellido, tipo_usuario, activo, created_at')
      .order('email')

    if (error) throw error
    return data ?? []
  }

  // Evaluaciones
  static async createEvaluation(evaluationData: any) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .insert([evaluationData])
      .select()
      .single()
    
    if (error) throw error
    return data
  }


  // Preguntas de evaluación
  static async getEvaluationQuestions() {
    const { data, error } = await supabaseAdmin
      .from('preguntas_evaluacion')
      .select('*')
      .eq('activa', true)
      .order('orden')
    
    if (error) throw error
    return data
  }

  // Respuestas de evaluación
  static async createEvaluationResponse(responseData: any) {
    const { data, error } = await supabaseAdmin
      .from('respuestas_evaluacion')
      .insert([responseData])
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  static async getEvaluationResponses(evaluationId: string) {
    const { data, error } = await supabaseAdmin
      .from('respuestas_evaluacion')
      .select('*')
      .eq('evaluacion_id', evaluationId)
    
    if (error) throw error
    return data
  }

  // Profesores
  static async getProfessors() {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .select(`
        *,
        usuario:usuarios(*)
      `)
      .eq('activo', true)
    
    if (error) throw error
    return data
  }

  // Estudiantes
  static async getStudents() {
    const { data, error } = await supabaseAdmin
      .from('estudiantes')
      .select(`
        *,
        usuario:usuarios(*),
        carrera:carreras(*)
      `)
      .eq('activo', true)
    
    if (error) throw error
    return data
  }

  // Grupos
  static async getGroups() {
    const { data, error } = await supabaseAdmin
      .from('grupos')
      .select(`
        *,
        curso:cursos(*),
        periodo:periodos_academicos(*)
      `)
      .eq('activo', true)
    
    if (error) throw error
    return data
  }

  // Carreras
  static async getCareers() {
    const { data, error } = await supabaseAdmin
      .from('carreras')
      .select('*')
      .eq('activa', true)
    
    if (error) throw error
    return data
  }

  // Cursos
  static async getCourses() {
    const { data, error } = await supabaseAdmin
      .from('cursos')
      .select('*')
      .eq('activo', true)
    
    if (error) throw error
    return data
  }

  // Períodos académicos
  static async getAcademicPeriods() {
    const { data, error } = await supabaseAdmin
      .from('periodos_academicos')
      .select('*')
      .eq('activo', true)
    
    if (error) throw error
    return data
  }

  // Inscripciones
  static async findInscription(studentId: string, groupId: number) {
    const { data, error } = await supabaseAdmin
      .from('inscripciones')
      .select('*')
      .eq('estudiante_id', studentId)
      .eq('grupo_id', groupId)
      .eq('activa', true)
      .single()
    
    if (error && error.code !== 'PGRST116') throw error
    return data
  }

  // Evaluaciones con relaciones
  static async getEvaluationsByStudent(studentId: string) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .select(`
        *,
        profesor:profesores(
          *,
          usuario:usuarios(nombre, apellido)
        ),
        grupo:grupos(
          *,
          curso:cursos(*),
          periodo:periodos_academicos(*)
        ),
        respuestas_evaluacion(
          *,
          pregunta:preguntas_evaluacion(*)
        )
      `)
      .eq('estudiante_id', studentId)
      .order('fecha_creacion', { ascending: false })
    
    if (error) throw error
    return data
  }

  static async findExistingEvaluation(studentId: string, profesorId: string, groupId: number, periodoId: number) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .select('*')
      .eq('estudiante_id', studentId)
      .eq('profesor_id', profesorId)
      .eq('grupo_id', groupId)
      .eq('periodo_id', periodoId)
      .single()
    
    if (error && error.code !== 'PGRST116') throw error
    return data
  }

  static async createEvaluationWithResponses(evaluationData: any, responses: any[]) {
    // Crear evaluación
    const { data: evaluation, error: evalError } = await supabaseAdmin
      .from('evaluaciones')
      .insert([evaluationData])
      .select()
      .single()
    
    if (evalError) throw evalError

    // Crear respuestas si existen
    if (responses.length > 0) {
      const responsesWithEvaluationId = responses.map(response => ({
        ...response,
        evaluacion_id: evaluation.id
      }))

      const { error: respError } = await supabaseAdmin
        .from('respuestas_evaluacion')
        .insert(responsesWithEvaluationId)
      
      if (respError) throw respError
    }

    return evaluation
  }

  static async getEvaluationWithRelations(evaluationId: string) {
    const { data, error } = await supabaseAdmin
      .from('evaluaciones')
      .select(`
        *,
        profesor:profesores(
          *,
          usuario:usuarios(nombre, apellido)
        ),
        grupo:grupos(
          *,
          curso:cursos(*),
          periodo:periodos_academicos(*)
        ),
        respuestas_evaluacion(
          *,
          pregunta:preguntas_evaluacion(*)
        )
      `)
      .eq('id', evaluationId)
      .single()
    
    if (error) throw error
    return data
  }

  // Preguntas con categorías
  static async getQuestionsWithCategories() {
    const { data, error } = await supabaseAdmin
      .from('preguntas_evaluacion')
      .select(`
        *,
        categoria:categorias_pregunta(*)
      `)
      .eq('activa', true)
      .order('categoria_id', { ascending: true })
      .order('orden', { ascending: true })
    
    if (error) throw error
    return data
  }

  // Preguntas por carrera
  static async getQuestionsByCareer(carreraId?: number) {
    let query = supabaseAdmin
      .from('preguntas_evaluacion')
      .select(`
        *,
        categoria:categorias_pregunta(*)
      `)
      .eq('activa', true)
      .order('orden', { ascending: true })

    if (carreraId) {
      // Primero intentar obtener preguntas específicas de la carrera
      const { data: specificQuestions, error: specificError } = await query
        .eq('id_carrera', carreraId)
      
      if (specificError) throw specificError
      
      // Si hay preguntas específicas, retornarlas
      if (specificQuestions && specificQuestions.length > 0) {
        return specificQuestions
      }
      
      // Si no hay preguntas específicas, obtener preguntas generales
      const { data: generalQuestions, error: generalError } = await supabaseAdmin
        .from('preguntas_evaluacion')
        .select(`
          *,
          categoria:categorias_pregunta(*)
        `)
        .eq('activa', true)
        .is('id_carrera', null)
        .order('orden', { ascending: true })
      
      if (generalError) throw generalError
      return generalQuestions || []
    } else {
      // Si no se especifica carrera, obtener todas las preguntas activas
      const { data, error } = await query
      if (error) throw error
      return data
    }
  }

  // Crear profesor
  static async createProfessor(professorData: {
    usuario_id: string
    codigo?: string
    departamento?: string
    activo?: boolean
  }) {
    const { data, error } = await supabaseAdmin
      .from('profesores')
      .insert([{
        usuario_id: professorData.usuario_id,
        codigo: professorData.codigo || null,
        departamento: professorData.departamento || null,
        activo: professorData.activo !== undefined ? professorData.activo : true
      }])
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  // Crear estudiante
  static async createStudent(studentData: {
    usuario_id: string
    codigo?: string
    carrera_id?: number
    semestre?: string
    activo?: boolean
  }) {
    const { data, error } = await supabaseAdmin
      .from('estudiantes')
      .insert([{
        usuario_id: studentData.usuario_id,
        codigo: studentData.codigo || null,
        carrera_id: studentData.carrera_id || null,
        semestre: studentData.semestre || null,
        activo: studentData.activo !== undefined ? studentData.activo : true
      }])
      .select()
      .single()
    
    if (error) throw error
    return data
  }

  // Crear usuario con inserción automática en tabla específica
  static async createUserWithType(userData: {
    email: string
    password: string
    nombre: string
    apellido: string
    tipo_usuario: string
    // Campos adicionales para profesores
    codigo_profesor?: string
    departamento?: string
    // Campos adicionales para estudiantes
    codigo_estudiante?: string
    carrera_id?: number
    semestre?: string
  }) {
    // Crear usuario primero
    const user = await this.createUser({
      email: userData.email,
      password: userData.password,
      nombre: userData.nombre,
      apellido: userData.apellido,
      tipo_usuario: userData.tipo_usuario
    })

    // Insertar en tabla específica según el tipo
    if (userData.tipo_usuario === 'profesor' || userData.tipo_usuario === 'docente') {
      await this.createProfessor({
        usuario_id: user.id,
        codigo: userData.codigo_profesor,
        departamento: userData.departamento
      })
    } else if (userData.tipo_usuario === 'estudiante') {
      await this.createStudent({
        usuario_id: user.id,
        codigo: userData.codigo_estudiante,
        carrera_id: userData.carrera_id,
        semestre: userData.semestre
      })
    }

    return user
  }
}

export default SupabaseDB

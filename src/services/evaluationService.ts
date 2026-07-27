import { SupabaseDB } from '../config/supabase-only';

export interface PreguntaEvaluacion {
  id: number;
  categoria_id: number;
  texto_pregunta: string;
  descripcion?: string;
  tipo_pregunta: string;
  opciones?: any;
  obligatoria: boolean;
  orden: number;
  activa: boolean;
  id_carrera?: number;
  categoria: {
    id: number;
    nombre: string;
    descripcion?: string;
    orden: number;
  };
}

export class EvaluationService {
  /**
   * Obtener preguntas de evaluación por carrera
   * @param carreraId ID de la carrera (opcional)
   * @returns Array de preguntas de evaluación
   */
  static async getQuestionsByCareer(carreraId?: number): Promise<PreguntaEvaluacion[]> {
    try {
      return await SupabaseDB.getQuestionsByCareer(carreraId);
    } catch (error) {
      console.error('Error obteniendo preguntas por carrera:', error);
      throw new Error('Error al obtener preguntas de evaluación');
    }
  }

  /**
   * Obtener todas las preguntas de evaluación activas
   * @returns Array de preguntas de evaluación
   */
  static async getAllActiveQuestions(): Promise<PreguntaEvaluacion[]> {
    try {
      return await SupabaseDB.getQuestionsWithCategories();
    } catch (error) {
      console.error('Error obteniendo todas las preguntas:', error);
      throw new Error('Error al obtener preguntas de evaluación');
    }
  }

  /**
   * Obtener preguntas de evaluación básicas (sin categorías)
   * @returns Array de preguntas de evaluación
   */
  static async getBasicQuestions(): Promise<any[]> {
    try {
      return await SupabaseDB.getEvaluationQuestions();
    } catch (error) {
      console.error('Error obteniendo preguntas básicas:', error);
      throw new Error('Error al obtener preguntas de evaluación');
    }
  }

  /**
   * Crear una nueva pregunta de evaluación
   * @param preguntaData Datos de la pregunta
   * @returns Pregunta creada
   */
  static async createQuestion(preguntaData: {
    categoria_id: number;
    texto_pregunta: string;
    descripcion?: string;
    tipo_pregunta: string;
    opciones?: any;
    obligatoria?: boolean;
    orden: number;
    id_carrera?: number;
  }): Promise<any> {
    try {
      const { data, error } = await SupabaseDB.supabaseAdmin
        .from('preguntas_evaluacion')
        .insert([{
          ...preguntaData,
          activa: true
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creando pregunta:', error);
      throw new Error('Error al crear pregunta de evaluación');
    }
  }

  /**
   * Actualizar una pregunta de evaluación
   * @param preguntaId ID de la pregunta
   * @param updateData Datos a actualizar
   * @returns Pregunta actualizada
   */
  static async updateQuestion(preguntaId: number, updateData: Partial<PreguntaEvaluacion>): Promise<any> {
    try {
      const { data, error } = await SupabaseDB.supabaseAdmin
        .from('preguntas_evaluacion')
        .update(updateData)
        .eq('id', preguntaId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error actualizando pregunta:', error);
      throw new Error('Error al actualizar pregunta de evaluación');
    }
  }

  /**
   * Desactivar una pregunta de evaluación
   * @param preguntaId ID de la pregunta
   * @returns Resultado de la operación
   */
  static async deactivateQuestion(preguntaId: number): Promise<boolean> {
    try {
      const { error } = await SupabaseDB.supabaseAdmin
        .from('preguntas_evaluacion')
        .update({ activa: false })
        .eq('id', preguntaId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error desactivando pregunta:', error);
      return false;
    }
  }

  /**
   * Obtener preguntas por categoría y carrera
   * @param categoriaId ID de la categoría
   * @param carreraId ID de la carrera (opcional)
   * @returns Array de preguntas
   */
  static async getQuestionsByCategoryAndCareer(categoriaId: number, carreraId?: number): Promise<PreguntaEvaluacion[]> {
    try {
      let query = SupabaseDB.supabaseAdmin
        .from('preguntas_evaluacion')
        .select(`
          *,
          categoria:categorias_pregunta(*)
        `)
        .eq('categoria_id', categoriaId)
        .eq('activa', true)
        .order('orden', { ascending: true });

      if (carreraId) {
        query = query.eq('id_carrera', carreraId);
      } else {
        query = query.is('id_carrera', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo preguntas por categoría y carrera:', error);
      throw new Error('Error al obtener preguntas de evaluación');
    }
  }
}

export default EvaluationService;

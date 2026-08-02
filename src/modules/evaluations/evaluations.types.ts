export interface PreguntaEvaluacion {
  id: number
  categoria_id: number
  texto_pregunta: string
  descripcion?: string
  tipo_pregunta: string
  opciones?: unknown
  obligatoria: boolean
  orden: number
  activa: boolean
  id_carrera?: number
  categoria: {
    id: number
    nombre: string
    descripcion?: string
    orden: number
  }
}

export interface CreateQuestionInput {
  categoria_id: number
  texto_pregunta: string
  descripcion?: string
  tipo_pregunta: string
  opciones?: unknown
  obligatoria?: boolean
  orden: number
  id_carrera?: number
}

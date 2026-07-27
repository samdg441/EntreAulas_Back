import { GoogleGenerativeAI } from '@google/generative-ai'

export type AiSummaryResult = {
  summary: string
  topics: string[]
  acosoDetectado?: boolean
  mensajeAcoso?: string
  analysisSource?: 'open_text' | 'quantitative_fallback'
}

export type SummaryContext = 'profesor' | 'coordinador' | 'decano'

// Inicializar Gemini API
const genAI = process.env.GOOGLE_GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY)
  : null

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

const SPANISH_STOPWORDS = new Set<string>([
  'a','acaba','ahi','al','algo','algun','alguna','algunas','alguno','algunos','alla','alli','ambos','ante','antes','aquel','aquella','aquellas','aquello','aquellos','aqui','asi','aun','aunque','bajo','bastante','bien','cabe','cada','casi','cierto','cierta','ciertas','cierto','ciertos','como','con','contra','cual','cuales','cualquier','cualquiera','cualquieras','cuan','cuando','cuanta','cuantas','cuanto','cuantos','de','debe','deben','debido','decir','del','demasiada','demasiadas','demasiado','demasiados','dentro','deprisa','desde','despues','detras','dia','dias','dice','dicen','dicho','dicha','dichas','dichos','donde','dos','el','ella','ellas','ello','ellos','empleais','emplean','emplear','empleo','en','encima','entonces','entre','era','eramos','eran','eras','eres','es','esa','esas','ese','eso','esos','esta','estaba','estaban','estado','estados','estais','estamos','estan','estar','este','esto','estos','estoy','fin','fue','fueron','fui','fuimos','gueno','ha','hace','haceis','hacemos','hacen','hacer','haces','hacia','han','hasta','hay','incluso','intenta','intentais','intentamos','intentan','intentar','intentas','ir','jamas','junto','juntos','la','largo','las','le','les','llegar','lo','los','mas','me','menos','mi','mia','mias','mientras','mio','mios','mis','misma','mismas','mismo','mismos','modo','mucha','muchas','muchisima','muchisimas','muchisimo','muchisimos','mucho','muchos','muy','nada','ni','ningun','ninguna','ningunas','ninguno','ningunos','no','nos','nosotras','nosotros','nuestra','nuestras','nuestro','nuestros','nunca','os','otra','otras','otro','otros','para','parecer','pero','poca','pocas','poco','pocos','podeis','podemos','poder','podria','podriais','podriamos','podrian','podrias','por','por que','porque','primero','puede','pueden','pues','que','querer','quien','quienes','quiza','quizas','sabe','sabeis','sabemos','saben','saber','sabes','se','segun','ser','si','siempre','siendo','sin','sino','so','sobre','sois','solamente','solo','somos','son','soy','su','sus','suya','suyas','suyo','suyos','tal','tales','tambien','tampoco','tan','tanta','tantas','tanto','tantos','te','teneis','tenemos','tener','tengo','tenido','tiene','tienen','toda','todas','todavia','todo','todos','tras','tu','tus','tuya','tuyas','tuyo','tuyos','ultima','ultimas','ultimo','ultimos','un','una','unas','uno','unos','usa','usais','usamos','usan','usar','usas','usted','ustedes','va','vais','valor','vamos','van','varias','varios','vaya','verdad','verdadera','verdadero','vosotras','vosotros','voy','ya','yo'
])

// Palabras de bajo valor semántico que suelen aparecer en comentarios
// y no aportan como "tema" (verbos comodín, conectores, relleno).
const LOW_SIGNAL_WORDS = new Set<string>([
  'sean', 'sea', 'sido', 'siendo', 'tenga', 'tengan', 'tener', 'tiene', 'tienen',
  'haya', 'hayan', 'hacer', 'hacen', 'hace', 'pueda', 'pueden', 'podria', 'podrian',
  'debe', 'deben', 'seria', 'serian', 'cosa', 'cosas', 'tema', 'temas', 'parte',
  'veces', 'vez', 'bastante', 'muy', 'mas', 'menos', 'buena', 'bueno', 'buenos',
  'buenas', 'mejor', 'mejora', 'mejorar', 'depronto', 'pronto', 'algo', 'nada'
])

// Léxico académico/pedagógico para priorizar temas útiles en el contexto de evaluación docente.
const ACADEMIC_PRIORITY_TERMS = new Set<string>([
  'metodologia', 'metodologías', 'metodo', 'didactica', 'didáctica', 'pedagogia', 'pedagogía',
  'claridad', 'explicacion', 'explicaciones', 'comunicacion', 'comunicación', 'retroalimentacion',
  'retroalimentación', 'evaluacion', 'evaluaciones', 'calificacion', 'calificaciones',
  'aprendizaje', 'competencia', 'competencias', 'contenido', 'contenidos', 'material',
  'materiales', 'ejemplo', 'ejemplos', 'practica', 'práctica', 'practicas', 'prácticas',
  'participacion', 'participación', 'interaccion', 'interacción', 'disponibilidad',
  'organizacion', 'organización', 'puntualidad', 'respeto', 'motivacion', 'motivación',
  'dinamica', 'dinámica', 'ritmo', 'acompanamiento', 'acompañamiento', 'asesoria', 'asesoría',
  'expresion', 'expresión', 'coherencia', 'dominio', 'conocimiento', 'planeacion', 'planeación'
])

function isUsefulTopicToken(token: string): boolean {
  if (!token) return false
  if (token.length < 4) return false
  if (SPANISH_STOPWORDS.has(token)) return false
  if (LOW_SIGNAL_WORDS.has(token)) return false
  if (/^\d+$/.test(token)) return false
  return true
}

function getTopicPriority(term: string): number {
  const normalized = normalizeText(term)
  const tokens = normalized.split(/\s+/).filter(Boolean)
  // Priorizar n-gramas que contengan al menos un término académico
  if (tokens.some((t) => ACADEMIC_PRIORITY_TERMS.has(t))) return 2
  // Prioridad media a términos razonables de longitud mayor
  if (tokens.every((t) => t.length >= 5)) return 1
  return 0
}

function extractTopKeywords(texts: string[], maxTerms: number = 10): string[] {
  const counts = new Map<string, number>()
  for (const raw of texts) {
    const cleaned = normalizeText(raw)
    const tokens = cleaned
      .replace(/[^a-zA-Z\p{L}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)

    // unigrams
    for (const t of tokens) {
      if (!isUsefulTopicToken(t)) continue
      counts.set(t, (counts.get(t) || 0) + 1)
    }

    // bigrams
    for (let i = 0; i < tokens.length - 1; i++) {
      const a = tokens[i]
      const b = tokens[i + 1]
      if (!a || !b) continue
      if (!isUsefulTopicToken(a) || !isUsefulTopicToken(b)) continue
      const bigram = `${a} ${b}`
      counts.set(bigram, (counts.get(bigram) || 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      const priorityDiff = getTopicPriority(b[0]) - getTopicPriority(a[0])
      if (priorityDiff !== 0) return priorityDiff
      return b[1] - a[1]
    })
    .slice(0, maxTerms)
    .map(([term]) => term)
}

function generateSmartSummary(responses: string[]): string {
  if (responses.length === 0) return 'No hay respuestas para resumir.'
  
  const total = responses.length
  const positiveWords = ['bueno', 'excelente', 'me gusta', 'útil', 'claro', 'ayuda', 'entender', 'fácil', 'comprender']
  const negativeWords = ['difícil', 'complicado', 'confuso', 'falta', 'mejorar', 'problema', 'malo', 'lento', 'rápido']
  const neutralWords = ['tiempo', 'ejemplo', 'material', 'evaluación', 'clase', 'profesor', 'contenido']
  
  let positiveCount = 0
  let negativeCount = 0
  let mentions: { [key: string]: number } = {}
  
  responses.forEach(r => {
    const lower = normalizeText(r)
    positiveWords.forEach(w => { if (lower.includes(w)) positiveCount++ })
    negativeWords.forEach(w => { if (lower.includes(w)) negativeCount++ })
    neutralWords.forEach(w => { if (lower.includes(w)) mentions[w] = (mentions[w] || 0) + 1 })
  })
  
  const positivePct = Math.round((positiveCount / total) * 100)
  const negativePct = Math.round((negativeCount / total) * 100)
  const genericTerms = new Set(['clase', 'profesor', 'contenido', 'material'])
  const topMentions = Object.entries(mentions)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .filter((k) => !genericTerms.has(normalizeText(k)))
    .slice(0, 3)
  
  let estado = 'Estado general regular con oportunidades de mejora.'
  if (positivePct > negativePct && positivePct > 30) {
    estado = 'Estado general favorable en la percepción estudiantil.'
  } else if (negativePct > positivePct && negativePct > 30) {
    estado = 'Estado general con señales de alerta y necesidad de intervención.'
  }

  const fortalezas = topMentions.length > 0
    ? `Fortalezas observadas en varios docentes: ${topMentions.slice(0, 2).join(', ')}.`
    : 'Fortalezas observadas: buena disposición docente, cumplimiento y acompañamiento general.'

  const fallas = negativePct >= 25
    ? 'Aspectos a mejorar: claridad en explicaciones, ritmo de clase y acompañamiento en temas complejos.'
    : 'Aspectos a mejorar: mantener consistencia metodológica y retroalimentación oportuna.'

  return `${estado} ${fortalezas} ${fallas} Recomendación: priorizar seguimiento pedagógico a los docentes con evaluaciones más bajas y compartir buenas prácticas de quienes obtienen mejores resultados.`
}

export class AiService {
  static summarizeFromRatings(ratings: number[], context: SummaryContext = 'profesor'): AiSummaryResult {
    if (!Array.isArray(ratings) || ratings.length === 0) {
      return {
        summary: 'No hay respuestas cuantitativas suficientes para generar un resumen.',
        topics: [],
        analysisSource: 'quantitative_fallback'
      }
    }

    const valid = ratings
      .map((r) => Number(r))
      .filter((r) => Number.isFinite(r) && r >= 1 && r <= 5)

    if (valid.length === 0) {
      return {
        summary: 'No hay respuestas cuantitativas válidas para generar un resumen.',
        topics: [],
        analysisSource: 'quantitative_fallback'
      }
    }

    const avg = valid.reduce((a, b) => a + b, 0) / valid.length
    const dist = { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0 }
    valid.forEach((v) => {
      const rounded = Math.round(v)
      if (rounded === 1) dist.e1++
      else if (rounded === 2) dist.e2++
      else if (rounded === 3) dist.e3++
      else if (rounded === 4) dist.e4++
      else dist.e5++
    })

    const topBucket = Object.entries(dist).sort((a, b) => b[1] - a[1])[0]?.[0] || 'e3'
    const pct = (n: number) => Math.round((n / valid.length) * 100)
    const positive = dist.e4 + dist.e5
    const low = dist.e1 + dist.e2

    const contextText =
      context === 'coordinador'
        ? 'de los docentes de la carrera'
        : context === 'decano'
          ? 'de los docentes de la facultad'
          : 'del docente'

    let tone = 'La percepción general es intermedia.'
    if (avg >= 4.3) tone = 'La percepción general es muy positiva.'
    else if (avg >= 3.7) tone = 'La percepción general es positiva con oportunidades de mejora.'
    else if (avg < 3.0) tone = 'La percepción general sugiere áreas de mejora importantes.'

    const summary = `No se encontraron respuestas abiertas suficientes, así que se generó un resumen cualitativo a partir de ${valid.length} respuestas cuantitativas ${contextText}. Promedio general: ${avg.toFixed(2)}/5. ${tone} Predominan las valoraciones ${topBucket.replace('e', '')} estrellas (${pct(dist[topBucket as keyof typeof dist])}%). Valoraciones altas (4-5): ${pct(positive)}%; valoraciones bajas (1-2): ${pct(low)}%.`

    const topics = [
      `promedio ${avg.toFixed(2)}/5`,
      `${pct(positive)}% valoraciones altas`,
      `${pct(low)}% valoraciones bajas`,
      'analisis cuantitativo',
      'sin respuestas abiertas'
    ]

    return { summary, topics, analysisSource: 'quantitative_fallback' }
  }

  static async summarizeOpenResponses(responses: string[], context: SummaryContext = 'profesor'): Promise<AiSummaryResult> {
    // Extraer temas por frecuencia local (SIEMPRE funciona, gratis)
    const topics = extractTopKeywords(responses, 10)
    
    // Detectar posibles menciones de acoso
    const acosoKeywords = [
      'acoso', 'harassment', 'hostigamiento', 'abus', 'maltrato', 'intimidación',
      'inapropiado', 'inadecuado', 'abusivo', 'violencia', 'amenaza', 'amenaz',
      'miedo', 'temor', 'inseguro', 'insegura', 'incomodo', 'incómodo', 'disgusto',
      'vergüenza', 'vergüenza', 'humillación', 'humillar', 'denunciar', 'queja grave',
      'comportamiento inapropiado', 'comentario inapropiado', 'tocamiento', 'tocar',
      'agresión', 'agredir', 'ofensa sexual', 'insinuación', 'insinuar'
    ]
    
    let acosoDetectado = false
    let mensajeAcoso = ''
    const textosConAcoso: string[] = []
    
    for (const respuesta of responses) {
      const lowerRespuesta = normalizeText(respuesta)
      for (const keyword of acosoKeywords) {
        if (lowerRespuesta.includes(normalizeText(keyword))) {
          acosoDetectado = true
          textosConAcoso.push(respuesta)
          break
        }
      }
    }
    
    if (acosoDetectado) {
      const ejemplos = textosConAcoso
        .slice(0, 5)
        .map((t) => String(t).trim().replace(/\s+/g, ' '))
      const ejemplosTexto = ejemplos.length > 0
        ? `\nEjemplos detectados:\n- ${ejemplos.join('\n- ')}`
        : ''
      mensajeAcoso = `⚠️ ALERTA: Se detectaron menciones que podrían referirse a situaciones de acoso o comportamiento inapropiado en ${textosConAcoso.length} respuesta(s). Se recomienda revisar estas respuestas inmediatamente y tomar las acciones correspondientes según los protocolos institucionales.${ejemplosTexto}`
      console.warn('🚨 [AI Service] Posible acoso detectado:', textosConAcoso.length, 'respuesta(s)')
    }
    
    // Intentar usar Gemini API si está disponible
    let aiSummary = ''
    if (genAI) {
      try {
        // Usar Gemini 2.5 Flash (más nuevo, rápido y con mejor cuota)
        const model = genAI.getGenerativeModel({ 
          model: 'gemini-2.5-flash',
          generationConfig: { 
            temperature: 0.3,
            maxOutputTokens: 1000
          } 
        })
        
        const joined = responses.slice(0, 90).join('\n- ') // Más contexto para evitar resúmenes muy cortos
        
        // Generar prompt según el contexto
        let contextoPrompt = ''
        if (context === 'coordinador') {
          contextoPrompt = `Eres un asistente experto en análisis de retroalimentación educativa. Estás analizando las opiniones de estudiantes sobre TODOS los profesores de una carrera completa. 

Analiza las siguientes opiniones de estudiantes sobre su experiencia académica con los profesores de la carrera y genera:

1. Un resumen ejecutivo y conciso (máximo 3-4 oraciones) que indique: estado general (bien/regular/crítico), fortalezas principales y fallas principales de los docentes de la carrera.
2. Una lista de 5-10 temas o palabras clave más relevantes mencionados por los estudiantes sobre todos los profesores (separados por comas).

IMPORTANTE: 
- Habla en general sobre los profesores de la carrera, no sobre un profesor específico.
- El resumen debe reflejar las opiniones generales sobre todos los profesores.
- Responde SOLO en español y en este formato exacto:
Resumen: [tu resumen aquí]
Temas: [tema1, tema2, tema3, ...]

⚠️ DETECCIÓN DE ACOSO: Si detectas cualquier mención relacionada con acoso, hostigamiento, comportamiento inapropiado, violencia, abuso, intimidación, o cualquier situación que pueda representar un riesgo para los estudiantes, DEBES incluirlo claramente en el resumen con una mención destacada.

Opiniones de estudiantes sobre los profesores de la carrera:
${joined}`
        } else if (context === 'decano') {
          contextoPrompt = `Eres un asistente experto en análisis de retroalimentación educativa. Estás analizando las opiniones de estudiantes sobre TODOS los profesores de una facultad completa. 

Analiza las siguientes opiniones de estudiantes sobre su experiencia académica con los profesores de la facultad y genera:

1. Un resumen claro y útil (4-6 oraciones) que capture los puntos más importantes mencionados por los estudiantes sobre los profesores en general de la facultad.
2. Una lista de 5-10 temas o palabras clave más relevantes mencionados por los estudiantes sobre todos los profesores (separados por comas).

IMPORTANTE: 
- Habla en general sobre los profesores de la facultad, no sobre profesores específicos.
- El resumen debe reflejar las opiniones generales sobre todos los profesores.
- Responde SOLO en español y en este formato exacto:
Resumen: [tu resumen aquí]
Temas: [tema1, tema2, tema3, ...]

⚠️ DETECCIÓN DE ACOSO: Si detectas cualquier mención relacionada con acoso, hostigamiento, comportamiento inapropiado, violencia, abuso, intimidación, o cualquier situación que pueda representar un riesgo para los estudiantes, DEBES incluirlo claramente en el resumen con una mención destacada.

Opiniones de estudiantes sobre los profesores de la facultad:
${joined}`
        } else {
          // Contexto por defecto: profesor individual
          contextoPrompt = `Eres un asistente experto en análisis de retroalimentación educativa. 

Analiza las siguientes opiniones de estudiantes sobre su experiencia académica y genera:

1. Un resumen claro y útil (4-6 oraciones) que capture los puntos más importantes mencionados por los estudiantes.
2. Una lista de 5-10 temas o palabras clave más relevantes mencionados (separados por comas).

IMPORTANTE: Responde SOLO en español y en este formato exacto:
Resumen: [tu resumen aquí]
Temas: [tema1, tema2, tema3, ...]

⚠️ DETECCIÓN DE ACOSO: Si detectas cualquier mención relacionada con acoso, hostigamiento, comportamiento inapropiado, violencia, abuso, intimidación, o cualquier situación que pueda representar un riesgo para los estudiantes, DEBES incluirlo claramente en el resumen con una mención destacada.

Opiniones de estudiantes:
${joined}`
        }

        const result = await model.generateContent(contextoPrompt)
        const response = await result.response
        const text = response.text()
        
        // Parsear respuesta de Gemini
        const resumenMatch = text.match(/Resumen:\s*([\s\S]*?)(?=\n\s*Temas:|$)/i)
        const temasMatch = text.match(/Temas:\s*([\s\S]*?)$/i)
        
        if (resumenMatch) {
          aiSummary = resumenMatch[1].trim()
          console.log('✅ Resumen generado por Gemini IA:', aiSummary.substring(0, 100) + '...')
          
          // Si Gemini también devuelve temas, usarlos junto con los extraídos localmente
          if (temasMatch) {
            const temasIA = temasMatch[1]
              .split(/[,;]/)
              .map(t => t.trim())
              .filter(t => t.length > 0)
              .slice(0, 10)
            
            // Combinar temas de IA con temas locales (priorizando IA)
            const combinedTopics = [...new Set([...temasIA, ...topics.slice(0, 5)])].slice(0, 10)
            
            return { 
              summary: aiSummary, 
              topics: combinedTopics,
              acosoDetectado,
              mensajeAcoso: acosoDetectado ? mensajeAcoso : undefined
            }
          }
        } else {
          // Si no viene en formato esperado, usar el texto completo como resumen
          aiSummary = text.trim()
          console.log('✅ Resumen generado por Gemini IA (formato alternativo)')
        }
      } catch (err: any) {
        console.warn('⚠️  Error con Gemini API:', err.message || err)
        console.log('📝 Usando resumen local inteligente como fallback')
      }
    } else {
      console.log('📝 Gemini API no configurada - usando resumen local inteligente')
    }
    
    // Generar resumen inteligente local (siempre funciona como fallback)
    const localSummary = generateSmartSummary(responses)
    
    // Preferir resumen de IA si está disponible, sino usar local
    let summary = aiSummary.trim() || localSummary
    
    return { 
      summary, 
      topics,
      acosoDetectado,
      mensajeAcoso: acosoDetectado ? mensajeAcoso : undefined,
      analysisSource: 'open_text'
    }
  }
}

export default AiService




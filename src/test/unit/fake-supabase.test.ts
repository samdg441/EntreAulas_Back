import { describe, expect, it } from 'vitest'
import { FakeSupabase } from '../helpers/fake-supabase'

describe('FakeSupabase — filtros reales (sustituto de queueFrom)', () => {
  it('eq deja solo las filas de esa carrera', async () => {
    const db = new FakeSupabase()
    db.seed('cursos', [
      { id: 1, carrera_id: 1, activo: true },
      { id: 2, carrera_id: 2, activo: true },
    ])
    const { data } = await db.from('cursos').select('id').eq('carrera_id', 1)
    expect(data).toEqual([{ id: 1, carrera_id: 1, activo: true }])
  })

  it('eq activo=true excluye inactivos', async () => {
    const db = new FakeSupabase()
    db.seed('profesores', [
      { id: 7, activo: true },
      { id: 8, activo: false },
    ])
    const { data } = await db.from('profesores').select('*').eq('activo', true)
    expect(data).toEqual([{ id: 7, activo: true }])
  })

  it('in filtra por lista de ids', async () => {
    const db = new FakeSupabase()
    db.seed('usuarios', [
      { id: 'u1', nombre: 'Ana' },
      { id: 'u2', nombre: 'Luis' },
      { id: 'u3', nombre: 'Eva' },
    ])
    const { data } = await db.from('usuarios').select('*').in('id', ['u1', 'u3'])
    expect((data as { id: string }[]).map((r) => r.id)).toEqual(['u1', 'u3'])
  })

  it('gte/lte recortan el rango de fechas', async () => {
    const db = new FakeSupabase()
    db.seed('evaluaciones', [
      { id: 1, fecha_creacion: '2025-12-31' },
      { id: 2, fecha_creacion: '2026-03-01' },
      { id: 3, fecha_creacion: '2026-07-01' },
    ])
    const { data } = await db
      .from('evaluaciones')
      .select('*')
      .gte('fecha_creacion', '2026-01-01')
      .lte('fecha_creacion', '2026-06-30')
    expect((data as { id: number }[]).map((r) => r.id)).toEqual([2])
  })

  it('single sin filas → PGRST116 (mismo código que PostgREST)', async () => {
    const db = new FakeSupabase()
    const { data, error } = await db.from('coordinadores').select('*').eq('usuario_id', 'x').single()
    expect(data).toBeNull()
    expect(error?.code).toBe('PGRST116')
  })

  it('fallarTabla responde error en esa tabla', async () => {
    const db = new FakeSupabase()
    db.fail('cursos', { message: 'db' })
    const { data, error } = await db.from('cursos').select('id')
    expect(data).toBeNull()
    expect(error?.message).toBe('db')
  })
})

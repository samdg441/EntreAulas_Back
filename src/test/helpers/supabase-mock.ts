import { vi } from 'vitest'

/** Mock compartido de Supabase Admin `from` (solo lo necesario para los RQ). */
export const fromMock = vi.fn()

export const supabaseAdminMock = {
  from: (...args: unknown[]) => fromMock(...args),
}

export const supabaseModuleMock = {
  SupabaseDB: {
    supabaseAdmin: supabaseAdminMock,
    findUserById: vi.fn(),
    findUserByEmail: vi.fn(),
  },
  supabaseAdmin: supabaseAdminMock,
  default: {},
}

/**
 * Punto de entrada para `vi.mock` de los módulos de configuración.
 *
 * Uso en el archivo de prueba (los `vi.mock` se izan; deben ir antes de importar la app):
 *
 *   vi.mock('../../config/supabase-only', () => import('../helpers/dobles-supabase'))
 *   vi.mock('../../config/supabaseClient', () => import('../helpers/dobles-supabase'))
 *
 * No mockear `middleware/auth` ni `RoleService`: la Fake aplica filtros y
 * `ClasePruebas.autenticarComo` emite un JWT real.
 */
export { supabaseAdmin, SupabaseDB, fakeDb, default } from './fake-supabase'

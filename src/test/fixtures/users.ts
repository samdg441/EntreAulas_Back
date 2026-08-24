/** Fixtures de usuarios para trazabilidad RQ2–RQ5 (ISTQB: datos de prueba estáticos). */

export const profesorUser = {
  id: 'user-profesor',
  email: 'profesor@test.com',
  tipo_usuario: 'profesor',
  roles: ['profesor'],
  permisos: [] as string[],
}

export const coordinadorUser = {
  id: 'user-coordinador',
  email: 'coordinador@test.com',
  tipo_usuario: 'coordinador',
  roles: ['coordinador'],
  permisos: [] as string[],
  coordinador: { carrera_id: 1 },
}

export const estudianteUser = {
  id: 'user-estudiante',
  email: 'estudiante@test.com',
  tipo_usuario: 'estudiante',
  roles: ['estudiante'],
  permisos: [] as string[],
}

export const adminUser = {
  id: 'user-admin',
  email: 'admin@test.com',
  tipo_usuario: 'admin',
  roles: ['admin'],
  permisos: [] as string[],
}

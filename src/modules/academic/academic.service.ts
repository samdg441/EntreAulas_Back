import { AcademicRepository, academicRepository } from './academic.repository'
import { listGruposConProfesorByCareer } from './grupos-con-profesor.service'

export class AcademicService {
  constructor(private readonly repo: AcademicRepository = academicRepository) {}

  listUsersSummary() {
    return this.repo.listUsersSummary()
  }

  updateUser(
    id: string,
    updates: Partial<{
      email: string
      nombre: string
      apellido: string
      tipo_usuario: string
      activo: boolean
    }>
  ) {
    return this.repo.updateUser(id, updates)
  }

  /** Soft-delete: marca usuario como inactivo. */
  deactivateUser(id: string) {
    return this.repo.updateUser(id, { activo: false })
  }

  getAcademicStructure() {
    return this.repo.getAcademicStructure()
  }

  getGruposConProfesorByCareer(carreraId: number) {
    return listGruposConProfesorByCareer(carreraId)
  }

  async getCoursesByCareerForCoordinator(
    careerId: string,
    user: { roles?: string[]; tipo_usuario?: string }
  ) {
    const isCoordinator =
      user.roles?.includes('coordinador') || user.tipo_usuario === 'coordinador'
    if (!isCoordinator) {
      const err = new Error('FORBIDDEN') as Error & { code?: string }
      err.code = 'FORBIDDEN'
      throw err
    }
    return this.repo.getCoursesByCareer(careerId)
  }
}

export const academicService = new AcademicService()

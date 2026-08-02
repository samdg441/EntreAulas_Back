import { AcademicRepository, academicRepository } from './academic.repository'

export class AcademicService {
  constructor(private readonly repo: AcademicRepository = academicRepository) {}

  listUsersSummary() {
    return this.repo.listUsersSummary()
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

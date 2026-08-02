import { describe, it, expect, vi } from 'vitest'
import { AcademicService } from './academic.service'
import type { AcademicRepository } from './academic.repository'

describe('AcademicService', () => {
  it('rechaza cursos por carrera si no es coordinador', async () => {
    const repo = {
      getCoursesByCareer: vi.fn(),
    } as unknown as AcademicRepository
    const service = new AcademicService(repo)

    await expect(
      service.getCoursesByCareerForCoordinator('1', { tipo_usuario: 'estudiante' })
    ).rejects.toMatchObject({ message: 'FORBIDDEN' })

    expect(repo.getCoursesByCareer).not.toHaveBeenCalled()
  })

  it('devuelve cursos si es coordinador', async () => {
    const courses = [{ id: 1, nombre: 'Cálculo' }]
    const repo = {
      getCoursesByCareer: vi.fn().mockResolvedValue(courses),
    } as unknown as AcademicRepository
    const service = new AcademicService(repo)

    const result = await service.getCoursesByCareerForCoordinator('3', {
      roles: ['coordinador'],
    })

    expect(result).toEqual(courses)
    expect(repo.getCoursesByCareer).toHaveBeenCalledWith('3')
  })
})

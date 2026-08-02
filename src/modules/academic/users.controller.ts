import { Response } from 'express'
import { academicService } from './academic.service'

export class UsersController {
  static async listUsers(_req: unknown, res: Response) {
    try {
      const users = await academicService.listUsersSummary()
      res.json({ users })
    } catch (e) {
      console.error('GET /api/users:', e)
      res.status(500).json({ error: 'Error al listar usuarios' })
    }
  }
}

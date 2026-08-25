import { Router } from 'express'
import { PasswordResetController } from './password-reset.controller'

const router = Router()

router.post('/forgot-password', PasswordResetController.forgotPassword)
router.get('/validate-reset-token/:token', PasswordResetController.validateResetToken)
router.post('/reset-password', PasswordResetController.resetPassword)

export default router

import express from 'express'
import { submitReport, getMyReports } from '../controllers/reportController.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

/**
 * POST /api/reports
 * Submit a content report (requires authentication)
 */
router.post('/', authenticateToken, submitReport)

/**
 * GET /api/reports/my-reports
 * Get user's submitted reports (requires authentication)
 */
router.get('/my-reports', authenticateToken, getMyReports)

export default router

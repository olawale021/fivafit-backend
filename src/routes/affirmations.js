/**
 * Affirmations Routes
 */

import express from 'express'
import * as affirmationsController from '../controllers/affirmationsController.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// All routes require authentication
router.use(authenticateToken)

// Get user's affirmation schedule
router.get('/schedule', affirmationsController.getSchedule)

// Update user's affirmation schedule
router.put('/schedule', affirmationsController.updateSchedule)

// Get affirmation history
router.get('/history', affirmationsController.getAffirmationHistory)

// Mark affirmation as opened
router.post('/:id/open', affirmationsController.markAffirmationOpened)

// Get affirmation analytics
router.get('/analytics', affirmationsController.getAnalytics)

// Manual trigger for testing (POST /api/affirmations/trigger-now)
router.post('/trigger-now', affirmationsController.triggerAffirmationNow)

export default router

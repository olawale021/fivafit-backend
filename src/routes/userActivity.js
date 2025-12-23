/**
 * User Activity Routes
 */

import express from 'express'
import * as userActivityController from '../controllers/userActivityController.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// All routes require authentication
router.use(authenticateToken)

// Track app open
router.post('/app-open', userActivityController.trackAppOpen)

// Track workout completion
router.post('/workout-complete', userActivityController.trackWorkoutComplete)

// Get user activity stats
router.get('/stats', userActivityController.getUserActivityStats)

export default router

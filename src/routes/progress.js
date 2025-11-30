import express from 'express'
import { authenticateJWT } from '../middleware/customAuth.js'
import {
  getProgress,
  getAchievements,
  getActivityTimeline
} from '../controllers/progressController.js'

const router = express.Router()

/**
 * GET /api/progress
 * Get comprehensive progress data including:
 * - Stats (scans, workouts, streak)
 * - Achievements
 * - Recent activity
 * - Summary
 */
router.get('/', authenticateJWT, getProgress)

/**
 * GET /api/progress/achievements
 * Get detailed achievement progress with unlock status
 */
router.get('/achievements', authenticateJWT, getAchievements)

/**
 * GET /api/progress/activity
 * Get activity timeline (combines scans and workouts)
 * Query params:
 *   ?limit=20 (default: 20)
 *   &offset=0 (default: 0)
 */
router.get('/activity', authenticateJWT, getActivityTimeline)

export default router

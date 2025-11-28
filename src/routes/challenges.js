import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import {
  getAllChallenges,
  getChallenge,
  create,
  join,
  leave,
  getLeaderboard,
  getProgress,
  getMyChallenges,
  updateProgress,
  deleteChallengeById
} from '../controllers/challengesController.js'

const router = express.Router()

/**
 * GET /api/challenges
 * Get all active challenges (public or group-specific)
 * Query params: groupId (optional), limit (optional)
 */
router.get('/', authenticateToken, getAllChallenges)

/**
 * GET /api/challenges/my
 * Get user's challenges (must be before /:id to avoid conflict)
 */
router.get('/my', authenticateToken, getMyChallenges)

/**
 * POST /api/challenges/progress
 * Update challenge progress
 */
router.post('/progress', authenticateToken, updateProgress)

/**
 * GET /api/challenges/:id
 * Get challenge details by ID
 */
router.get('/:id', authenticateToken, getChallenge)

/**
 * DELETE /api/challenges/:id
 * Delete a challenge (creator only)
 */
router.delete('/:id', authenticateToken, deleteChallengeById)

/**
 * POST /api/challenges
 * Create a new challenge
 */
router.post('/', authenticateToken, create)

/**
 * POST /api/challenges/:id/join
 * Join a challenge
 */
router.post('/:id/join', authenticateToken, join)

/**
 * DELETE /api/challenges/:id/leave
 * Leave a challenge
 */
router.delete('/:id/leave', authenticateToken, leave)

/**
 * GET /api/challenges/:id/leaderboard
 * Get challenge leaderboard
 */
router.get('/:id/leaderboard', authenticateToken, getLeaderboard)

/**
 * GET /api/challenges/:id/progress
 * Get user's progress in a challenge
 */
router.get('/:id/progress', authenticateToken, getProgress)

export default router

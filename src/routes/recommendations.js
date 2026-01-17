import express from 'express'
import { authenticateJWT } from '../middleware/customAuth.js'
import {
  getAIRecommendations,
  clearCache,
  getCacheStats
} from '../controllers/recommendationController.js'

const router = express.Router()

/**
 * GET /api/recommendations/ai
 * Get AI-powered personalized exercise recommendations
 * Query params:
 *   - refresh=true: Force regenerate (bypass cache)
 */
router.get('/ai', authenticateJWT, getAIRecommendations)

/**
 * POST /api/recommendations/clear-cache
 * Clear recommendation cache for current user
 */
router.post('/clear-cache', authenticateJWT, clearCache)

/**
 * GET /api/recommendations/cache-stats
 * Get cache statistics (for debugging)
 */
router.get('/cache-stats', authenticateJWT, getCacheStats)

export default router

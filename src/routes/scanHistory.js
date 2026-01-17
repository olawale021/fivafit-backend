import express from 'express'
import { authenticateJWT } from '../middleware/customAuth.js'
import {
  createScan,
  getHistory,
  getScan,
  deleteScanFromHistory,
  getStats,
  searchScans,
  clearHistory
} from '../controllers/scanHistoryController.js'

const router = express.Router()

/**
 * GET /api/scan-history/stats
 * Get scan statistics for user
 */
router.get('/stats', authenticateJWT, getStats)

/**
 * GET /api/scan-history/search
 * Search user's scan history
 */
router.get('/search', authenticateJWT, searchScans)

/**
 * GET /api/scan-history
 * Get user's scan history with pagination
 */
router.get('/', authenticateJWT, getHistory)

/**
 * POST /api/scan-history
 * Save a new scan to history
 */
router.post('/', authenticateJWT, createScan)

/**
 * GET /api/scan-history/:id
 * Get a specific scan by ID
 */
router.get('/:id', authenticateJWT, getScan)

/**
 * DELETE /api/scan-history/:id
 * Delete a scan from history
 */
router.delete('/:id', authenticateJWT, deleteScanFromHistory)

/**
 * DELETE /api/scan-history
 * Clear all scan history for user
 */
router.delete('/', authenticateJWT, clearHistory)

export default router

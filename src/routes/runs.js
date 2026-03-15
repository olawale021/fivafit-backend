import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { createRun, getRuns, getRun, removeRun, stats, leaderboard } from '../controllers/runsController.js'
import { supabase } from '../config/supabase.js'

const router = express.Router()

// Debug: verify table exists (remove after confirming)
router.get('/debug-table', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase.from('runs').select('id').limit(1)
    res.json({ success: !error, data, error: error ? JSON.stringify(error) : null })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

// Specific routes before parameterized routes
router.get('/stats', authenticateToken, stats)
router.get('/leaderboard', authenticateToken, leaderboard)

// CRUD routes
router.post('/', authenticateToken, createRun)
router.get('/', authenticateToken, getRuns)
router.get('/:id', authenticateToken, getRun)
router.delete('/:id', authenticateToken, removeRun)

export default router

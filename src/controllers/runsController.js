import { saveRun, getRunHistory, getRunById, deleteRun, getRunStats, getLeaderboard } from '../services/runService.js'

/**
 * POST /api/runs - Save a completed run
 */
export const createRun = async (req, res) => {
  try {
    const userId = req.user.id
    const runData = req.body

    // Validate required fields
    const requiredFields = ['started_at', 'duration_seconds', 'distance_meters']
    for (const field of requiredFields) {
      if (runData[field] === undefined || runData[field] === null) {
        return res.status(400).json({
          success: false,
          error: `Missing required field: ${field}`,
        })
      }
    }

    if (runData.distance_meters < 0 || runData.duration_seconds < 0) {
      return res.status(400).json({
        success: false,
        error: 'Distance and duration must be positive values',
      })
    }

    const result = await saveRun(userId, runData)

    res.status(201).json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('❌ Create run error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to save run',
      message: error.message,
    })
  }
}

/**
 * GET /api/runs - Get user's run history
 */
export const getRuns = async (req, res) => {
  try {
    const userId = req.user.id
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20

    const result = await getRunHistory(userId, page, limit)

    res.json({
      success: true,
      data: result.runs,
      pagination: result.pagination,
    })
  } catch (error) {
    console.error('❌ Get runs error:', error?.message || error?.code || error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch runs',
      message: typeof error?.message === 'string' ? error.message : 'Unknown error',
    })
  }
}

/**
 * GET /api/runs/stats - Get aggregate running stats
 */
export const stats = async (req, res) => {
  try {
    const userId = req.user.id
    const runStats = await getRunStats(userId)

    res.json({
      success: true,
      data: runStats,
    })
  } catch (error) {
    console.error('❌ Get run stats error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch run stats',
      message: error.message,
    })
  }
}

/**
 * GET /api/runs/leaderboard - Get running leaderboard
 */
export const leaderboard = async (req, res) => {
  try {
    const userId = req.user.id
    const { metric, period, scope } = req.query

    const data = await getLeaderboard(metric, period, scope, userId)

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('❌ Get leaderboard error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard',
      message: error.message,
    })
  }
}

/**
 * GET /api/runs/:id - Get a single run
 */
export const getRun = async (req, res) => {
  try {
    const userId = req.user.id
    const { id } = req.params

    const run = await getRunById(id, userId)

    res.json({
      success: true,
      data: run,
    })
  } catch (error) {
    console.error('❌ Get run error:', error)
    const statusCode = error.message === 'Run not found' ? 404 : 500
    res.status(statusCode).json({
      success: false,
      error: error.message,
    })
  }
}

/**
 * DELETE /api/runs/:id - Delete a run
 */
export const removeRun = async (req, res) => {
  try {
    const userId = req.user.id
    const { id } = req.params

    await deleteRun(id, userId)

    res.json({
      success: true,
      message: 'Run deleted successfully',
    })
  } catch (error) {
    console.error('❌ Delete run error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete run',
      message: error.message,
    })
  }
}

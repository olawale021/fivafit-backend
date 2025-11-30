import {
  getUserProgress,
  getAchievementProgress,
  getUserActivityTimeline
} from '../services/progressService.js'

/**
 * Progress Controller
 * Handles user progress tracking HTTP requests
 */

/**
 * GET /api/progress
 * Get comprehensive progress data for authenticated user
 */
export async function getProgress(req, res) {
  try {
    const userId = req.user.id

    const progress = await getUserProgress(userId)

    res.json({
      success: true,
      data: progress
    })

    console.log(`✅ Fetched progress for user: ${req.user.email}`)
  } catch (error) {
    console.error('❌ Get progress error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch progress data',
      message: 'Internal server error while fetching progress'
    })
  }
}

/**
 * GET /api/progress/achievements
 * Get detailed achievement progress
 */
export async function getAchievements(req, res) {
  try {
    const userId = req.user.id

    const achievements = await getAchievementProgress(userId)

    res.json({
      success: true,
      data: achievements
    })

    console.log(`✅ Fetched achievements for user: ${req.user.email}`)
  } catch (error) {
    console.error('❌ Get achievements error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch achievements',
      message: 'Internal server error while fetching achievements'
    })
  }
}

/**
 * GET /api/progress/activity
 * Get activity timeline (combines scans and workouts)
 */
export async function getActivityTimeline(req, res) {
  try {
    const userId = req.user.id
    const limit = parseInt(req.query.limit) || 20
    const offset = parseInt(req.query.offset) || 0

    const activities = await getUserActivityTimeline(userId, limit, offset)

    res.json({
      success: true,
      data: activities,
      pagination: {
        limit,
        offset,
        count: activities.length
      }
    })

    console.log(`✅ Fetched ${activities.length} activities for user: ${req.user.email}`)
  } catch (error) {
    console.error('❌ Get activity timeline error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity timeline',
      message: 'Internal server error while fetching activity'
    })
  }
}

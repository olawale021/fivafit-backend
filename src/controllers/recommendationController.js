import {
  generateAIRecommendations,
  clearUserRecommendationCache,
  getRecommendationCacheStats
} from '../services/recommendationService.js'

/**
 * Recommendation Controller
 * Handles AI-powered exercise recommendation requests
 */

/**
 * GET /api/recommendations/ai
 * Get AI-powered personalized exercise recommendations
 * Note: AI recommendations are based on goals, fitness levels, and body focus only
 * Equipment filtering is handled separately in the "Based on Your Equipment" section
 */
export async function getAIRecommendations(req, res) {
  try {
    const user = req.user
    const forceRefresh = req.query.refresh === 'true'

    // Validate user has required profile data
    if (!user.fitness_goal || user.fitness_goal.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Incomplete profile',
        message: 'Please set your fitness goals in your profile to get AI recommendations'
      })
    }

    console.log(`📝 AI Recommendations request from: ${user.email} (refresh: ${forceRefresh})`)

    const recommendations = await generateAIRecommendations(user, forceRefresh)

    res.json({
      success: true,
      data: recommendations
    })

  } catch (error) {
    console.error('❌ Get AI Recommendations Error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to generate recommendations',
      message: 'An error occurred while generating AI recommendations. Please try again.'
    })
  }
}

/**
 * POST /api/recommendations/clear-cache
 * Clear recommendation cache for the current user
 * (Called when user updates their profile)
 */
export async function clearCache(req, res) {
  try {
    const user = req.user

    clearUserRecommendationCache(user.id)

    res.json({
      success: true,
      message: 'Recommendation cache cleared'
    })

    console.log(`🗑️ Cache cleared for user: ${user.email}`)

  } catch (error) {
    console.error('❌ Clear Cache Error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      message: 'An error occurred while clearing the cache'
    })
  }
}

/**
 * GET /api/recommendations/cache-stats
 * Get cache statistics (admin/debug endpoint)
 */
export async function getCacheStats(req, res) {
  try {
    const stats = getRecommendationCacheStats()

    res.json({
      success: true,
      data: stats
    })

  } catch (error) {
    console.error('❌ Get Cache Stats Error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get cache stats'
    })
  }
}

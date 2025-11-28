import {
  joinChallenge,
  leaveChallenge,
  updateChallengeProgress,
  getChallengeLeaderboard,
  getUserChallenges,
  getActiveChallenges,
  createChallenge,
  getChallengeById,
  getUserChallengeProgress,
  deleteChallenge
} from '../services/challengeService.js'

/**
 * Get all active challenges (public or group-specific)
 * GET /api/challenges
 * Query params: groupId (optional), limit (optional)
 */
export const getAllChallenges = async (req, res) => {
  try {
    const { groupId, limit } = req.query
    const challenges = await getActiveChallenges(groupId, limit ? parseInt(limit) : 20)

    res.json({
      success: true,
      data: challenges
    })
  } catch (error) {
    console.error('❌ Get challenges error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch challenges',
      message: error.message
    })
  }
}

/**
 * Get challenge by ID
 * GET /api/challenges/:id
 */
export const getChallenge = async (req, res) => {
  try {
    const { id } = req.params
    const challenge = await getChallengeById(id)

    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: 'Challenge not found'
      })
    }

    res.json({
      success: true,
      data: challenge
    })
  } catch (error) {
    console.error('❌ Get challenge error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch challenge',
      message: error.message
    })
  }
}

/**
 * Create a new challenge
 * POST /api/challenges
 * Body: { name, description, challenge_type, start_date, end_date, goal_value, goal_unit, is_public, group_id, max_participants, badge_name, badge_icon }
 */
export const create = async (req, res) => {
  try {
    const userId = req.user.id
    const challengeData = {
      ...req.body,
      creator_id: userId
    }

    // Validate required fields
    const requiredFields = ['name', 'challenge_type', 'start_date', 'end_date', 'goal_value']
    for (const field of requiredFields) {
      if (!challengeData[field]) {
        return res.status(400).json({
          success: false,
          error: `Missing required field: ${field}`
        })
      }
    }

    // Validate challenge type
    const validTypes = ['workout_streak', 'step_count', 'calorie_burn', 'total_workouts']
    if (!validTypes.includes(challengeData.challenge_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid challenge type'
      })
    }

    // Validate dates
    const startDate = new Date(challengeData.start_date)
    const endDate = new Date(challengeData.end_date)
    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        error: 'End date must be after start date'
      })
    }

    const challenge = await createChallenge(challengeData)

    res.status(201).json({
      success: true,
      data: challenge
    })
  } catch (error) {
    console.error('❌ Create challenge error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to create challenge',
      message: error.message
    })
  }
}

/**
 * Join a challenge
 * POST /api/challenges/:id/join
 */
export const join = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const participant = await joinChallenge(id, userId)

    res.status(201).json({
      success: true,
      data: participant,
      message: 'Successfully joined challenge'
    })
  } catch (error) {
    console.error('❌ Join challenge error:', error)

    // Handle specific error messages
    const statusCode = error.message.includes('not found') ? 404 :
                      error.message.includes('not started') ? 400 :
                      error.message.includes('ended') ? 400 :
                      error.message.includes('full') ? 400 :
                      error.message.includes('Already joined') ? 409 :
                      500

    res.status(statusCode).json({
      success: false,
      error: error.message
    })
  }
}

/**
 * Leave a challenge
 * DELETE /api/challenges/:id/leave
 */
export const leave = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    await leaveChallenge(id, userId)

    res.json({
      success: true,
      message: 'Successfully left challenge'
    })
  } catch (error) {
    console.error('❌ Leave challenge error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to leave challenge',
      message: error.message
    })
  }
}

/**
 * Get challenge leaderboard
 * GET /api/challenges/:id/leaderboard
 */
export const getLeaderboard = async (req, res) => {
  try {
    const { id } = req.params
    const leaderboard = await getChallengeLeaderboard(id)

    res.json({
      success: true,
      data: leaderboard
    })
  } catch (error) {
    console.error('❌ Get leaderboard error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard',
      message: error.message
    })
  }
}

/**
 * Get user's progress in a challenge
 * GET /api/challenges/:id/progress
 */
export const getProgress = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const progress = await getUserChallengeProgress(id, userId)

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Not participating in this challenge'
      })
    }

    res.json({
      success: true,
      data: progress
    })
  } catch (error) {
    console.error('❌ Get progress error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch progress',
      message: error.message
    })
  }
}

/**
 * Get user's challenges
 * GET /api/users/me/challenges
 */
export const getMyChallenges = async (req, res) => {
  try {
    const userId = req.user.id
    const challenges = await getUserChallenges(userId)

    res.json({
      success: true,
      data: challenges
    })
  } catch (error) {
    console.error('❌ Get user challenges error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch challenges',
      message: error.message
    })
  }
}

/**
 * Update challenge progress (typically called after workout completion)
 * POST /api/challenges/progress
 * Body: { participantId, date, value, workoutId }
 */
export const updateProgress = async (req, res) => {
  try {
    const { participantId, date, value, workoutId } = req.body

    if (!participantId || !date || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: participantId, date, value'
      })
    }

    const participant = await updateChallengeProgress(
      participantId,
      date,
      parseInt(value),
      workoutId
    )

    res.json({
      success: true,
      data: participant,
      message: 'Progress updated successfully'
    })
  } catch (error) {
    console.error('❌ Update progress error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update progress',
      message: error.message
    })
  }
}

/**
 * Delete a challenge (creator only)
 * DELETE /api/challenges/:id
 */
export const deleteChallengeById = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    await deleteChallenge(id, userId)

    res.json({
      success: true,
      message: 'Challenge deleted successfully'
    })
  } catch (error) {
    console.error('❌ Delete challenge error:', error)

    const statusCode = error.message.includes('Only the creator') ? 403 : 500

    res.status(statusCode).json({
      success: false,
      error: error.message
    })
  }
}

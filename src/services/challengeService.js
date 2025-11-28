import { supabase } from '../config/supabase.js'

/**
 * Challenge Service
 * Service for managing challenges, participants, and progress tracking
 */

/**
 * Join a challenge
 * @param {string} challengeId - Challenge ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Created participant record
 */
export const joinChallenge = async (challengeId, userId) => {
  try {
    console.log(`🎯 User ${userId} joining challenge ${challengeId}`)

    // Get challenge details
    const { data: challenge, error: challengeError } = await supabase
      .from('challenges')
      .select('*')
      .eq('id', challengeId)
      .single()

    if (challengeError || !challenge) {
      throw new Error('Challenge not found')
    }

    // Check if challenge has ended
    if (new Date(challenge.end_date) < new Date()) {
      throw new Error('Challenge has ended')
    }

    // Check max participants
    if (challenge.max_participants && challenge.participant_count >= challenge.max_participants) {
      throw new Error('Challenge is full')
    }

    // Check if already joined
    const { data: existing } = await supabase
      .from('challenge_participants')
      .select('id')
      .eq('challenge_id', challengeId)
      .eq('user_id', userId)
      .single()

    if (existing) {
      throw new Error('Already joined this challenge')
    }

    // Insert participant
    const { data: participant, error: participantError } = await supabase
      .from('challenge_participants')
      .insert({
        challenge_id: challengeId,
        user_id: userId,
        current_value: 0,
        status: 'active'
      })
      .select()
      .single()

    if (participantError) {
      throw participantError
    }

    // Increment participant count
    await supabase
      .from('challenges')
      .update({ participant_count: challenge.participant_count + 1 })
      .eq('id', challengeId)

    console.log(`✅ User ${userId} joined challenge ${challengeId}`)
    return participant
  } catch (error) {
    console.error('❌ Join challenge error:', error)
    throw error
  }
}

/**
 * Leave a challenge
 * @param {string} challengeId - Challenge ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success status
 */
export const leaveChallenge = async (challengeId, userId) => {
  try {
    console.log(`🚪 User ${userId} leaving challenge ${challengeId}`)

    // Update participant status
    const { error: updateError } = await supabase
      .from('challenge_participants')
      .update({ status: 'left' })
      .eq('challenge_id', challengeId)
      .eq('user_id', userId)
      .eq('status', 'active')

    if (updateError) {
      throw updateError
    }

    // Decrement participant count
    const { data: challenge } = await supabase
      .from('challenges')
      .select('participant_count')
      .eq('id', challengeId)
      .single()

    if (challenge) {
      await supabase
        .from('challenges')
        .update({ participant_count: Math.max(0, challenge.participant_count - 1) })
        .eq('id', challengeId)
    }

    console.log(`✅ User ${userId} left challenge ${challengeId}`)
    return true
  } catch (error) {
    console.error('❌ Leave challenge error:', error)
    throw error
  }
}

/**
 * Update challenge progress for a participant
 * @param {string} participantId - Participant ID
 * @param {Date} progressDate - Date of progress
 * @param {number} progressValue - Progress value
 * @param {string} [workoutId] - Optional workout completion ID
 * @returns {Promise<Object>} Updated participant record
 */
export const updateChallengeProgress = async (participantId, progressDate, progressValue, workoutId = null) => {
  try {
    console.log(`📊 Updating progress for participant ${participantId}`)

    // Get participant and challenge details
    const { data: participant, error: participantError } = await supabase
      .from('challenge_participants')
      .select(`
        *,
        challenge:challenges(*)
      `)
      .eq('id', participantId)
      .single()

    if (participantError || !participant) {
      throw new Error('Participant not found')
    }

    const challenge = participant.challenge

    // Upsert daily progress
    await supabase
      .from('challenge_progress')
      .upsert({
        challenge_participant_id: participantId,
        date: progressDate,
        value: progressValue,
        workout_completion_id: workoutId
      }, {
        onConflict: 'challenge_participant_id,date'
      })

    // Calculate total progress based on challenge type
    let totalProgress = 0

    if (['step_count', 'calorie_burn', 'total_workouts'].includes(challenge.challenge_type)) {
      // Sum all progress for accumulative challenges
      const { data: progressData } = await supabase
        .from('challenge_progress')
        .select('value')
        .eq('challenge_participant_id', participantId)

      totalProgress = progressData?.reduce((sum, p) => sum + p.value, 0) || 0
    } else if (challenge.challenge_type === 'workout_streak') {
      // Count consecutive days for streak challenges
      const { data: progressData } = await supabase
        .from('challenge_progress')
        .select('date, value')
        .eq('challenge_participant_id', participantId)
        .gte('date', new Date(challenge.start_date).toISOString().split('T')[0])
        .gt('value', 0)
        .order('date', { ascending: true })

      if (progressData && progressData.length > 0) {
        // Calculate longest consecutive streak
        let maxStreak = 0
        let currentStreak = 0
        let lastDate = null

        for (const progress of progressData) {
          const currentDate = new Date(progress.date)

          if (!lastDate) {
            currentStreak = 1
          } else {
            const dayDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24))
            if (dayDiff === 1) {
              currentStreak++
            } else {
              currentStreak = 1
            }
          }

          maxStreak = Math.max(maxStreak, currentStreak)
          lastDate = currentDate
        }

        totalProgress = maxStreak
      }
    }

    // Determine if challenge is completed
    const isCompleted = totalProgress >= challenge.goal_value
    const newStatus = isCompleted ? 'completed' : participant.status
    const completedAt = isCompleted && !participant.completed_at ? new Date().toISOString() : participant.completed_at

    // Update participant's current value
    const { data: updatedParticipant, error: updateError } = await supabase
      .from('challenge_participants')
      .update({
        current_value: totalProgress,
        last_updated: new Date().toISOString(),
        status: newStatus,
        completed_at: completedAt
      })
      .eq('id', participantId)
      .select()
      .single()

    if (updateError) {
      throw updateError
    }

    console.log(`✅ Progress updated: ${totalProgress}/${challenge.goal_value}`)
    return updatedParticipant
  } catch (error) {
    console.error('❌ Update challenge progress error:', error)
    throw error
  }
}

/**
 * Get challenge leaderboard
 * @param {string} challengeId - Challenge ID
 * @returns {Promise<Array>} Leaderboard with user details and rankings
 */
export const getChallengeLeaderboard = async (challengeId) => {
  try {
    console.log(`🏆 Fetching leaderboard for challenge ${challengeId}`)

    const { data: leaderboard, error } = await supabase
      .from('challenge_participants')
      .select(`
        id,
        current_value,
        last_updated,
        status,
        user:users (
          id,
          username,
          full_name,
          profile_photo_url
        )
      `)
      .eq('challenge_id', challengeId)
      .in('status', ['active', 'completed'])
      .order('current_value', { ascending: false })
      .order('last_updated', { ascending: true })

    if (error) {
      throw error
    }

    // Add rank to each entry
    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      rank: index + 1,
      user_id: entry.user.id,
      username: entry.user.username,
      full_name: entry.user.full_name,
      avatar_url: entry.user.profile_photo_url,
      current_value: entry.current_value,
      status: entry.status
    }))

    console.log(`✅ Leaderboard fetched: ${rankedLeaderboard.length} participants`)
    return rankedLeaderboard
  } catch (error) {
    console.error('❌ Get leaderboard error:', error)
    throw error
  }
}

/**
 * Get user's active challenges (both created and joined)
 * @param {string} userId - User ID
 * @returns {Promise<Array>} User's active challenges
 */
export const getUserChallenges = async (userId) => {
  try {
    console.log(`📋 Fetching challenges for user ${userId}`)

    // Get challenges where user is a participant
    const { data: participantChallenges, error: participantError } = await supabase
      .from('challenge_participants')
      .select(`
        *,
        challenge:challenges (
          *,
          creator:users!challenges_creator_id_fkey (
            id,
            username,
            full_name,
            profile_photo_url
          )
        )
      `)
      .eq('user_id', userId)
      .in('status', ['active', 'completed'])
      .order('joined_at', { ascending: false })

    if (participantError) {
      throw participantError
    }

    // Get challenges created by user
    const { data: createdChallenges, error: createdError } = await supabase
      .from('challenges')
      .select(`
        *,
        creator:users!challenges_creator_id_fkey (
          id,
          username,
          full_name,
          profile_photo_url
        )
      `)
      .eq('creator_id', userId)
      .order('created_at', { ascending: false })

    if (createdError) {
      throw createdError
    }

    // Get participant records for created challenges
    const createdChallengeIds = createdChallenges.map(c => c.id)
    let createdWithParticipant = []

    if (createdChallengeIds.length > 0) {
      const { data: createdParticipants } = await supabase
        .from('challenge_participants')
        .select('*')
        .eq('user_id', userId)
        .in('challenge_id', createdChallengeIds)

      // Map created challenges to participant format
      createdWithParticipant = createdChallenges.map(challenge => {
        const participant = createdParticipants?.find(p => p.challenge_id === challenge.id)
        return participant ? {
          ...participant,
          challenge
        } : {
          // If not a participant, create a placeholder participant record
          id: `created_${challenge.id}`,
          challenge_id: challenge.id,
          user_id: userId,
          current_value: 0,
          status: 'active',
          joined_at: challenge.created_at,
          challenge,
          is_creator: true
        }
      })
    }

    // Merge and deduplicate (participant challenges take priority)
    const participantIds = new Set(participantChallenges.map(p => p.challenge_id))
    const uniqueCreated = createdWithParticipant.filter(c => !participantIds.has(c.challenge_id))
    const allChallenges = [...participantChallenges, ...uniqueCreated]

    console.log(`✅ Found ${allChallenges.length} challenges (${participantChallenges.length} joined, ${uniqueCreated.length} created only)`)
    return allChallenges
  } catch (error) {
    console.error('❌ Get user challenges error:', error)
    throw error
  }
}

/**
 * Get active/upcoming challenges (public or group-specific)
 * @param {string} [groupId] - Optional group ID to filter group challenges
 * @param {number} [limit] - Limit number of results
 * @returns {Promise<Array>} List of challenges
 */
export const getActiveChallenges = async (groupId = null, limit = 20) => {
  try {
    console.log(`📋 Fetching active challenges ${groupId ? `for group ${groupId}` : '(public)'}`)

    let query = supabase
      .from('challenges')
      .select(`
        *,
        creator:users!challenges_creator_id_fkey (
          id,
          username,
          full_name,
          profile_photo_url
        )
      `)
      .gte('end_date', new Date().toISOString())
      .order('start_date', { ascending: true })
      .limit(limit)

    if (groupId) {
      query = query.eq('group_id', groupId)
    } else {
      query = query.eq('is_public', true).is('group_id', null)
    }

    const { data: challenges, error } = await query

    if (error) {
      throw error
    }

    console.log(`✅ Found ${challenges.length} active challenges`)
    return challenges
  } catch (error) {
    console.error('❌ Get active challenges error:', error)
    throw error
  }
}

/**
 * Create a new challenge
 * @param {Object} challengeData - Challenge data
 * @returns {Promise<Object>} Created challenge
 */
export const createChallenge = async (challengeData) => {
  try {
    console.log(`🎯 Creating new challenge: ${challengeData.name}`)

    const { data: challenge, error } = await supabase
      .from('challenges')
      .insert(challengeData)
      .select()
      .single()

    if (error) {
      throw error
    }

    console.log(`✅ Challenge created: ${challenge.id}`)

    // Auto-join creator to the challenge
    try {
      console.log(`🔄 Auto-joining creator ${challengeData.creator_id} to challenge ${challenge.id}`)
      await joinChallenge(challenge.id, challengeData.creator_id)
      console.log(`✅ Creator auto-joined successfully`)

      // Refresh challenge data to get updated participant_count
      const { data: updatedChallenge } = await supabase
        .from('challenges')
        .select('*')
        .eq('id', challenge.id)
        .single()

      return updatedChallenge || challenge
    } catch (joinError) {
      console.error('⚠️ Failed to auto-join creator:', joinError)
      // Return original challenge if auto-join fails
      return challenge
    }
  } catch (error) {
    console.error('❌ Create challenge error:', error)
    throw error
  }
}

/**
 * Get challenge by ID with full details
 * @param {string} challengeId - Challenge ID
 * @returns {Promise<Object>} Challenge details
 */
export const getChallengeById = async (challengeId) => {
  try {
    const { data: challenge, error } = await supabase
      .from('challenges')
      .select(`
        *,
        creator:users!challenges_creator_id_fkey (
          id,
          username,
          full_name,
          profile_photo_url
        ),
        group:groups (
          id,
          name,
          avatar_url
        )
      `)
      .eq('id', challengeId)
      .single()

    if (error) {
      throw error
    }

    return challenge
  } catch (error) {
    console.error('❌ Get challenge error:', error)
    throw error
  }
}

/**
 * Delete a challenge (creator only)
 * @param {string} challengeId - Challenge ID
 * @param {string} userId - User ID (must be creator)
 * @returns {Promise<boolean>} Success status
 */
export const deleteChallenge = async (challengeId, userId) => {
  try {
    console.log(`🗑️ Deleting challenge ${challengeId}`)

    // Check if user is the creator
    const { data: challenge } = await supabase
      .from('challenges')
      .select('creator_id')
      .eq('id', challengeId)
      .single()

    if (!challenge || challenge.creator_id !== userId) {
      throw new Error('Only the creator can delete this challenge')
    }

    // Delete challenge (cascades to participants and progress)
    const { error } = await supabase
      .from('challenges')
      .delete()
      .eq('id', challengeId)

    if (error) {
      throw error
    }

    console.log(`✅ Challenge ${challengeId} deleted`)
    return true
  } catch (error) {
    console.error('❌ Delete challenge error:', error)
    throw error
  }
}

/**
 * Get user's progress in a specific challenge
 * @param {string} challengeId - Challenge ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Participant with progress data
 */
export const getUserChallengeProgress = async (challengeId, userId) => {
  try {
    const { data: participant, error } = await supabase
      .from('challenge_participants')
      .select(`
        *,
        progress:challenge_progress (
          date,
          value,
          workout_completion_id
        )
      `)
      .eq('challenge_id', challengeId)
      .eq('user_id', userId)
      .single()

    // Handle "not found" error (user not participating)
    if (error && error.code === 'PGRST116') {
      return null
    }

    if (error) {
      throw error
    }

    return participant
  } catch (error) {
    console.error('❌ Get user challenge progress error:', error)
    throw error
  }
}

import { supabase } from '../config/supabase.js'

/**
 * Save a completed run
 * @param {string} userId - User ID
 * @param {Object} runData - Run data
 * @returns {Promise<Object>} Created run record
 */
export const saveRun = async (userId, runData) => {
  try {
    console.log(`🏃 Saving run for user ${userId}`)

    const {
      started_at,
      finished_at,
      duration_seconds,
      distance_meters,
      avg_pace_sec_km,
      best_pace_sec_km,
      calories_burned,
      avg_speed_ms,
      max_speed_ms,
      elevation_gain_m,
      route_polyline,
      splits,
      steps,
      notes,
    } = runData

    const { data: run, error } = await supabase
      .from('runs')
      .insert({
        user_id: userId,
        started_at,
        finished_at,
        duration_seconds,
        distance_meters,
        avg_pace_sec_km,
        best_pace_sec_km,
        calories_burned,
        avg_speed_ms,
        max_speed_ms,
        elevation_gain_m,
        steps,
        route_polyline,
        splits,
        notes,
        status: 'completed',
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    // Check for personal bests
    const personalBests = await checkPersonalBests(userId, run)

    console.log(`✅ Run saved: ${run.id} (${(distance_meters / 1000).toFixed(2)} km)`)
    return { run, personalBests }
  } catch (error) {
    console.error('❌ Save run error:', error)
    throw error
  }
}

/**
 * Get user's run history (paginated)
 * @param {string} userId - User ID
 * @param {number} page - Page number
 * @param {number} limit - Results per page
 * @returns {Promise<Object>} Paginated runs
 */
export const getRunHistory = async (userId, page = 1, limit = 20) => {
  try {
    console.log(`📋 Fetching run history for user ${userId}, page ${page}`)

    const offset = (page - 1) * limit

    const { data: runs, error, count } = await supabase
      .from('runs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('❌ Supabase runs query error:', JSON.stringify(error))
      throw new Error(error.message || error.code || 'Supabase query failed')
    }

    console.log(`✅ Found ${runs.length} runs (total: ${count})`)
    return {
      runs,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    }
  } catch (error) {
    console.error('❌ Get run history error:', error)
    throw error
  }
}

/**
 * Get a single run by ID
 * @param {string} runId - Run ID
 * @param {string} userId - User ID (for authorization)
 * @returns {Promise<Object>} Run details
 */
export const getRunById = async (runId, userId) => {
  try {
    console.log(`🔍 Fetching run ${runId}`)

    const { data: run, error } = await supabase
      .from('runs')
      .select('*')
      .eq('id', runId)
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Run not found')
      }
      throw error
    }

    console.log(`✅ Run fetched: ${runId}`)
    return run
  } catch (error) {
    console.error('❌ Get run error:', error)
    throw error
  }
}

/**
 * Delete a run
 * @param {string} runId - Run ID
 * @param {string} userId - User ID (for authorization)
 */
export const deleteRun = async (runId, userId) => {
  try {
    console.log(`🗑️ Deleting run ${runId}`)

    // Also delete any personal bests referencing this run
    await supabase
      .from('personal_bests')
      .delete()
      .eq('run_id', runId)
      .eq('user_id', userId)

    const { error } = await supabase
      .from('runs')
      .delete()
      .eq('id', runId)
      .eq('user_id', userId)

    if (error) {
      throw error
    }

    console.log(`✅ Run deleted: ${runId}`)
  } catch (error) {
    console.error('❌ Delete run error:', error)
    throw error
  }
}

/**
 * Get aggregate stats for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Aggregate running stats
 */
export const getRunStats = async (userId) => {
  try {
    console.log(`📊 Fetching run stats for user ${userId}`)

    const { data: runs, error } = await supabase
      .from('runs')
      .select('distance_meters, duration_seconds, avg_pace_sec_km, calories_burned, started_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('started_at', { ascending: false })

    if (error) {
      throw error
    }

    if (!runs || runs.length === 0) {
      return {
        total_runs: 0,
        total_distance_meters: 0,
        total_duration_seconds: 0,
        total_calories: 0,
        avg_pace_sec_km: 0,
        longest_run_meters: 0,
        weekly_distance_meters: 0,
        weekly_runs: 0,
      }
    }

    const totalDistance = runs.reduce((sum, r) => sum + (r.distance_meters || 0), 0)
    const totalDuration = runs.reduce((sum, r) => sum + (r.duration_seconds || 0), 0)
    const totalCalories = runs.reduce((sum, r) => sum + (r.calories_burned || 0), 0)
    const longestRun = Math.max(...runs.map(r => r.distance_meters || 0))

    // Average pace (weighted by distance)
    const paceRuns = runs.filter(r => r.avg_pace_sec_km && r.distance_meters)
    let avgPace = 0
    if (paceRuns.length > 0) {
      const totalPaceDistance = paceRuns.reduce((sum, r) => sum + r.distance_meters, 0)
      avgPace = Math.round(
        paceRuns.reduce((sum, r) => sum + r.avg_pace_sec_km * r.distance_meters, 0) / totalPaceDistance
      )
    }

    // Weekly stats
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    const weeklyRuns = runs.filter(r => new Date(r.started_at) >= oneWeekAgo)
    const weeklyDistance = weeklyRuns.reduce((sum, r) => sum + (r.distance_meters || 0), 0)

    // Get personal bests
    const { data: personalBests } = await supabase
      .from('personal_bests')
      .select('*')
      .eq('user_id', userId)
      .order('distance_type', { ascending: true })

    const stats = {
      total_runs: runs.length,
      total_distance_meters: totalDistance,
      total_duration_seconds: totalDuration,
      total_calories: Math.round(totalCalories),
      avg_pace_sec_km: avgPace,
      longest_run_meters: longestRun,
      weekly_distance_meters: weeklyDistance,
      weekly_runs: weeklyRuns.length,
      personal_bests: personalBests || [],
    }

    console.log(`✅ Stats: ${runs.length} runs, ${(totalDistance / 1000).toFixed(1)} km total`)
    return stats
  } catch (error) {
    console.error('❌ Get run stats error:', error)
    throw error
  }
}

/**
 * Check and update personal bests after a run
 * @param {string} userId - User ID
 * @param {Object} run - The completed run
 * @returns {Promise<Array>} Array of new PBs achieved
 */
const checkPersonalBests = async (userId, run) => {
  try {
    const distanceKm = (run.distance_meters || 0) / 1000
    const newPBs = []

    // Standard distances to check (in meters)
    const standardDistances = [
      { type: '400m', meters: 400 },
      { type: '1km', meters: 1000 },
      { type: '5km', meters: 5000 },
      { type: '10km', meters: 10000 },
      { type: 'half_marathon', meters: 21097.5 },
      { type: 'marathon', meters: 42195 },
    ]

    for (const dist of standardDistances) {
      if (run.distance_meters < dist.meters) continue

      // Find fastest time for this distance using splits data
      const timeForDistance = findFastestTimeForDistance(run, dist.meters)
      if (!timeForDistance) continue

      const paceSecKm = Math.round(timeForDistance / (dist.meters / 1000))

      // Check existing PB
      const { data: existingPB } = await supabase
        .from('personal_bests')
        .select('*')
        .eq('user_id', userId)
        .eq('distance_type', dist.type)
        .single()

      if (!existingPB || timeForDistance < existingPB.time_seconds) {
        const pbData = {
          user_id: userId,
          distance_type: dist.type,
          time_seconds: Math.round(timeForDistance),
          pace_sec_km: paceSecKm,
          run_id: run.id,
          achieved_at: run.started_at,
        }

        if (existingPB) {
          await supabase
            .from('personal_bests')
            .update(pbData)
            .eq('id', existingPB.id)

          newPBs.push({
            ...pbData,
            previous_time_seconds: existingPB.time_seconds,
            improvement_seconds: existingPB.time_seconds - Math.round(timeForDistance),
          })
        } else {
          const { data: newPB } = await supabase
            .from('personal_bests')
            .insert(pbData)
            .select()
            .single()

          newPBs.push({ ...newPB, previous_time_seconds: null, improvement_seconds: null })
        }

        console.log(`🏆 New PB for ${dist.type}: ${Math.round(timeForDistance)}s`)
      }
    }

    return newPBs
  } catch (error) {
    console.error('❌ Check personal bests error:', error)
    return []
  }
}

/**
 * Find the fastest time to cover a given distance within a run
 * Uses the route polyline GPS points with timestamps
 * @param {Object} run - Run data with route_polyline
 * @param {number} targetMeters - Target distance in meters
 * @returns {number|null} Time in seconds, or null if not enough data
 */
const findFastestTimeForDistance = (run, targetMeters) => {
  const points = run.route_polyline
  if (!points || !Array.isArray(points) || points.length < 2) {
    // Fallback: if run covers the distance, use proportional time
    if (run.distance_meters >= targetMeters && run.duration_seconds) {
      return (targetMeters / run.distance_meters) * run.duration_seconds
    }
    return null
  }

  // Build cumulative distance array
  const distances = [0]
  const timestamps = [new Date(points[0].timestamp).getTime() / 1000]

  for (let i = 1; i < points.length; i++) {
    const d = haversineDistance(
      points[i - 1].lat, points[i - 1].lng,
      points[i].lat, points[i].lng
    )
    distances.push(distances[i - 1] + d)
    timestamps.push(new Date(points[i].timestamp).getTime() / 1000)
  }

  const totalDistance = distances[distances.length - 1]
  if (totalDistance < targetMeters) return null

  // Sliding window to find fastest segment
  let bestTime = Infinity
  let j = 0

  for (let i = 0; i < points.length; i++) {
    while (j < points.length - 1 && distances[j] - distances[i] < targetMeters) {
      j++
    }

    if (distances[j] - distances[i] >= targetMeters) {
      const segmentTime = timestamps[j] - timestamps[i]
      if (segmentTime > 0 && segmentTime < bestTime) {
        bestTime = segmentTime
      }
    }
  }

  return bestTime === Infinity ? null : bestTime
}

/**
 * Haversine distance between two coordinates
 * @returns {number} Distance in meters
 */
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const toRad = (deg) => deg * Math.PI / 180

/**
 * Get running leaderboard
 * @param {string} metric - 'total_distance' | 'run_count' | 'fastest_pace'
 * @param {string} period - 'weekly' | 'monthly' | 'alltime'
 * @param {string} scope - 'global' | 'friends'
 * @param {string} userId - Current user ID (for friends scope)
 * @returns {Promise<Array>} Leaderboard entries
 */
export const getLeaderboard = async (metric = 'total_distance', period = 'weekly', scope = 'global', userId = null) => {
  try {
    console.log(`🏆 Fetching leaderboard: ${metric}, ${period}, ${scope}`)

    // Build date filter
    let dateFilter = null
    const now = new Date()
    if (period === 'weekly') {
      dateFilter = new Date(now.setDate(now.getDate() - 7)).toISOString()
    } else if (period === 'monthly') {
      dateFilter = new Date(now.setMonth(now.getMonth() - 1)).toISOString()
    }

    // Get user IDs for friends scope
    let friendIds = null
    if (scope === 'friends' && userId) {
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId)

      friendIds = follows ? [...follows.map(f => f.following_id), userId] : [userId]
    }

    // Build query for runs
    let query = supabase
      .from('runs')
      .select('user_id, distance_meters, duration_seconds, avg_pace_sec_km, started_at')
      .eq('status', 'completed')

    if (dateFilter) {
      query = query.gte('started_at', dateFilter)
    }

    if (friendIds) {
      query = query.in('user_id', friendIds)
    }

    const { data: runs, error } = await query

    if (error) throw error
    if (!runs || runs.length === 0) return []

    // Aggregate by user
    const userStats = {}
    for (const run of runs) {
      if (!userStats[run.user_id]) {
        userStats[run.user_id] = {
          user_id: run.user_id,
          total_distance: 0,
          run_count: 0,
          best_pace: Infinity,
          total_duration: 0,
        }
      }
      const u = userStats[run.user_id]
      u.total_distance += run.distance_meters || 0
      u.run_count += 1
      u.total_duration += run.duration_seconds || 0
      if (run.avg_pace_sec_km && run.avg_pace_sec_km < u.best_pace) {
        u.best_pace = run.avg_pace_sec_km
      }
    }

    // Sort by metric
    let sorted = Object.values(userStats)
    if (metric === 'total_distance') {
      sorted.sort((a, b) => b.total_distance - a.total_distance)
    } else if (metric === 'run_count') {
      sorted.sort((a, b) => b.run_count - a.run_count)
    } else if (metric === 'fastest_pace') {
      sorted = sorted.filter(u => u.best_pace < Infinity)
      sorted.sort((a, b) => a.best_pace - b.best_pace)
    }

    // Take top 50
    sorted = sorted.slice(0, 50)

    // Fetch user profiles
    const userIds = sorted.map(u => u.user_id)
    const { data: users } = await supabase
      .from('users')
      .select('id, username, full_name, profile_photo_url')
      .in('id', userIds)

    const userMap = {}
    if (users) {
      users.forEach(u => { userMap[u.id] = u })
    }

    const leaderboard = sorted.map((entry, index) => ({
      rank: index + 1,
      user_id: entry.user_id,
      username: userMap[entry.user_id]?.username || 'Unknown',
      full_name: userMap[entry.user_id]?.full_name || '',
      avatar_url: userMap[entry.user_id]?.profile_photo_url || null,
      total_distance: Math.round(entry.total_distance),
      run_count: entry.run_count,
      best_pace: entry.best_pace === Infinity ? null : entry.best_pace,
      total_duration: entry.total_duration,
    }))

    console.log(`✅ Leaderboard: ${leaderboard.length} entries`)
    return leaderboard
  } catch (error) {
    console.error('❌ Get leaderboard error:', error)
    throw error
  }
}

import { supabase } from '../config/supabase.js'
import { getUserScanStats } from './scanHistoryService.js'
import { getUserWorkoutStats, getWorkoutHistory } from './workoutPlannerService.js'

/**
 * Progress Service
 * Aggregates user progress data from scans, workouts, and calculates achievements
 */

/**
 * Calculate user's current workout streak (consecutive days)
 */
async function calculateWorkoutStreak(userId) {
  try {
    const { data, error } = await supabase
      .from('workout_completions')
      .select('completed_at')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })

    if (error || !data || data.length === 0) {
      return 0
    }

    let streak = 0
    let currentDate = new Date()
    currentDate.setHours(0, 0, 0, 0)

    // Get unique completion dates
    const completionDates = [...new Set(data.map(completion => {
      const date = new Date(completion.completed_at)
      date.setHours(0, 0, 0, 0)
      return date.getTime()
    }))].sort((a, b) => b - a)

    // Check if there's a workout today or yesterday
    const today = currentDate.getTime()
    const yesterday = new Date(currentDate)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayTime = yesterday.getTime()

    if (completionDates[0] !== today && completionDates[0] !== yesterdayTime) {
      return 0 // Streak broken
    }

    // Count consecutive days
    let expectedDate = completionDates[0] === today ? today : yesterdayTime

    for (const date of completionDates) {
      if (date === expectedDate) {
        streak++
        const nextExpected = new Date(expectedDate)
        nextExpected.setDate(nextExpected.getDate() - 1)
        expectedDate = nextExpected.getTime()
      } else {
        break
      }
    }

    return streak
  } catch (error) {
    console.error('Error calculating workout streak:', error)
    return 0
  }
}

/**
 * Calculate achievements based on user stats
 */
function calculateAchievements(scanStats, workoutStats, streak) {
  const totalScans = scanStats?.totalScans || 0
  const totalWorkouts = workoutStats?.total_workouts_completed || 0

  return [
    {
      id: 'first_scan',
      title: 'First Scan',
      description: 'Scanned your first equipment',
      unlocked: totalScans >= 1,
      progress: Math.min(totalScans, 1),
      target: 1,
      icon: 'camera.fill'
    },
    {
      id: 'scan_10',
      title: '10 Scans',
      description: 'Reached 10 equipment scans',
      unlocked: totalScans >= 10,
      progress: Math.min(totalScans, 10),
      target: 10,
      icon: 'scope'
    },
    {
      id: 'scan_50',
      title: '50 Scans',
      description: 'Scanned 50 pieces of equipment',
      unlocked: totalScans >= 50,
      progress: Math.min(totalScans, 50),
      target: 50,
      icon: 'star.fill'
    },
    {
      id: 'first_workout',
      title: 'First Workout',
      description: 'Completed your first workout',
      unlocked: totalWorkouts >= 1,
      progress: Math.min(totalWorkouts, 1),
      target: 1,
      icon: 'figure.strengthtraining.traditional'
    },
    {
      id: 'workout_10',
      title: '10 Workouts',
      description: 'Completed 10 workouts',
      unlocked: totalWorkouts >= 10,
      progress: Math.min(totalWorkouts, 10),
      target: 10,
      icon: 'trophy.fill'
    },
    {
      id: 'week_warrior',
      title: 'Week Warrior',
      description: 'Workout 5 days in a week',
      unlocked: workoutStats?.recent_workouts_7_days >= 5,
      progress: Math.min(workoutStats?.recent_workouts_7_days || 0, 5),
      target: 5,
      icon: 'flame.fill'
    },
    {
      id: 'streak_7',
      title: '7-Day Streak',
      description: 'Maintain a 7-day workout streak',
      unlocked: streak >= 7,
      progress: Math.min(streak, 7),
      target: 7,
      icon: 'bolt.fill'
    },
    {
      id: 'workout_50',
      title: '50 Workouts',
      description: 'Completed 50 workouts',
      unlocked: totalWorkouts >= 50,
      progress: Math.min(totalWorkouts, 50),
      target: 50,
      icon: 'crown.fill'
    }
  ]
}

/**
 * Get comprehensive progress data for user
 */
export async function getUserProgress(userId) {
  try {
    // Fetch all data in parallel
    const [scanStats, workoutStats, recentActivity, streak] = await Promise.all([
      getUserScanStats(userId),
      getUserWorkoutStats(userId),
      getWorkoutHistory(userId, 10, 0),
      calculateWorkoutStreak(userId)
    ])

    // Calculate achievements
    const achievements = calculateAchievements(scanStats, workoutStats, streak)

    // Format stats for display
    const stats = {
      totalScans: {
        label: 'Total Scans',
        value: scanStats?.totalScans || 0,
        icon: 'camera.fill'
      },
      totalWorkouts: {
        label: 'Workouts',
        value: workoutStats?.total_workouts_completed || 0,
        icon: 'figure.strengthtraining.traditional'
      },
      workoutsThisWeek: {
        label: 'This Week',
        value: workoutStats?.recent_workouts_7_days || 0,
        icon: 'calendar'
      },
      currentStreak: {
        label: 'Streak',
        value: streak > 0 ? `${streak} day${streak !== 1 ? 's' : ''}` : '0 days',
        numericValue: streak,
        icon: 'flame.fill'
      }
    }

    // Format recent activity
    const recentActivityFormatted = recentActivity.map(activity => ({
      id: activity.id,
      type: 'workout',
      title: activity.daily_workouts?.workout_name || 'Workout',
      subtitle: activity.daily_workouts?.focus_area || 'Exercise',
      date: activity.completed_at,
      duration: activity.duration_minutes,
      difficulty: activity.difficulty_rating,
      energyLevel: activity.energy_level
    }))

    return {
      stats,
      achievements,
      recentActivity: recentActivityFormatted,
      streak,
      summary: {
        totalScans: scanStats?.totalScans || 0,
        totalWorkouts: workoutStats?.total_workouts_completed || 0,
        totalAchievements: achievements.length,
        unlockedAchievements: achievements.filter(a => a.unlocked).length,
        scansThisWeek: scanStats?.scansThisWeek || 0,
        workoutsThisWeek: workoutStats?.recent_workouts_7_days || 0,
        currentStreak: streak,
        favoriteEquipmentCategory: scanStats?.favoriteCategory || null
      }
    }
  } catch (error) {
    console.error('Error fetching user progress:', error)
    throw error
  }
}

/**
 * Get detailed achievement progress
 */
export async function getAchievementProgress(userId) {
  try {
    const [scanStats, workoutStats, streak] = await Promise.all([
      getUserScanStats(userId),
      getUserWorkoutStats(userId),
      calculateWorkoutStreak(userId)
    ])

    return calculateAchievements(scanStats, workoutStats, streak)
  } catch (error) {
    console.error('Error fetching achievement progress:', error)
    throw error
  }
}

/**
 * Get user activity timeline (combines scans and workouts)
 */
export async function getUserActivityTimeline(userId, limit = 20, offset = 0) {
  try {
    // Fetch recent workouts
    const { data: workouts, error: workoutError } = await supabase
      .from('workout_completions')
      .select(`
        *,
        daily_workouts(workout_name, focus_area)
      `)
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .range(offset, offset + Math.floor(limit / 2))

    if (workoutError) throw workoutError

    // Fetch recent scans
    const { data: scans, error: scanError } = await supabase
      .from('scan_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + Math.floor(limit / 2))

    if (scanError) throw scanError

    // Combine and format activities
    const activities = []

    // Add workouts
    workouts?.forEach(workout => {
      activities.push({
        id: `workout-${workout.id}`,
        type: 'workout',
        title: workout.daily_workouts?.workout_name || 'Workout Completed',
        subtitle: workout.daily_workouts?.focus_area || 'Exercise',
        timestamp: workout.completed_at,
        details: {
          duration: workout.duration_minutes,
          difficulty: workout.difficulty_rating,
          energyLevel: workout.energy_level,
          notes: workout.notes
        }
      })
    })

    // Add scans
    scans?.forEach(scan => {
      activities.push({
        id: `scan-${scan.id}`,
        type: 'scan',
        title: 'Equipment Scanned',
        subtitle: scan.equipment_name,
        timestamp: scan.created_at,
        details: {
          category: scan.equipment_category,
          cached: scan.was_cached
        }
      })
    })

    // Sort by timestamp descending
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    return activities.slice(0, limit)
  } catch (error) {
    console.error('Error fetching activity timeline:', error)
    throw error
  }
}

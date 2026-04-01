import { supabase } from '../config/supabase.js'
import { getUserScanStats } from './scanHistoryService.js'
import { getUserWorkoutStats, getWorkoutHistory } from './workoutPlannerService.js'
import { getRunHistory } from './runService.js'

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
 * Get nutrition stats for a user (last 7 and 30 days)
 */
async function getNutritionStats(userId) {
  try {
    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(now.getDate() - 7)
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(now.getDate() - 30)

    const { data, error } = await supabase
      .from('food_logs')
      .select('id, calories, protein, carbs, fat, created_at')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })

    if (error || !data) return { totalMeals: 0, mealsThisWeek: 0, avgCalories: 0, totalCalories30d: 0 }

    const mealsThisWeek = data.filter(m => new Date(m.created_at) >= sevenDaysAgo).length
    const totalCalories = data.reduce((sum, m) => sum + (m.calories || 0), 0)
    const avgCalories = data.length > 0 ? Math.round(totalCalories / Math.min(data.length, 30)) : 0

    return {
      totalMeals: data.length,
      mealsThisWeek,
      avgCalories,
      totalCalories30d: Math.round(totalCalories),
    }
  } catch (error) {
    console.error('Error getting nutrition stats:', error)
    return { totalMeals: 0, mealsThisWeek: 0, avgCalories: 0, totalCalories30d: 0 }
  }
}

/**
 * Get running stats for a user
 */
async function getRunStats(userId) {
  try {
    const { data, error } = await supabase
      .from('runs')
      .select('id, distance_meters, duration_seconds, average_pace, calories_burned, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error || !data) return { totalRuns: 0, totalDistance: 0, totalDuration: 0, totalCaloriesBurned: 0, bestPace: null }

    const totalDistance = data.reduce((sum, r) => sum + (Number(r.distance_meters) || 0), 0)
    const totalDuration = data.reduce((sum, r) => sum + (Number(r.duration_seconds) || 0), 0)
    const totalCaloriesBurned = data.reduce((sum, r) => sum + (Number(r.calories_burned) || 0), 0)
    const paces = data.filter(r => r.average_pace && Number(r.average_pace) > 0).map(r => Number(r.average_pace))
    const bestPace = paces.length > 0 ? Math.min(...paces) : null
    const distanceKm = totalDistance > 0 ? Math.round(totalDistance / 100) / 10 : 0

    return {
      totalRuns: data.length,
      totalDistance: Math.round(totalDistance) || 0,
      totalDistanceKm: distanceKm,
      totalDuration: Math.round(totalDuration),
      totalCaloriesBurned: Math.round(totalCaloriesBurned),
      bestPace,
    }
  } catch (error) {
    console.error('Error getting run stats:', error)
    return { totalRuns: 0, totalDistance: 0, totalDistanceKm: 0, totalDuration: 0, totalCaloriesBurned: 0, bestPace: null }
  }
}

/**
 * Get comprehensive progress data for user
 */
export async function getUserProgress(userId) {
  try {
    // Fetch all data in parallel — including nutrition and runs
    const [scanStats, workoutStats, recentActivity, streak, nutritionStats, runStats] = await Promise.all([
      getUserScanStats(userId),
      getUserWorkoutStats(userId),
      getWorkoutHistory(userId, 10, 0),
      calculateWorkoutStreak(userId),
      getNutritionStats(userId),
      getRunStats(userId),
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

    // Nutrition stats for display
    const nutritionDisplay = {
      totalMeals: {
        label: 'Meals Logged',
        value: nutritionStats.totalMeals,
        icon: 'fork.knife'
      },
      mealsThisWeek: {
        label: 'This Week',
        value: nutritionStats.mealsThisWeek,
        icon: 'calendar'
      },
      avgCalories: {
        label: 'Avg Calories',
        value: nutritionStats.avgCalories,
        icon: 'flame.fill'
      }
    }

    // Run stats for display
    const runDisplay = {
      totalRuns: {
        label: 'Total Runs',
        value: runStats.totalRuns,
        icon: 'figure.run'
      },
      totalDistance: {
        label: 'Distance',
        value: `${runStats.totalDistanceKm || 0} km`,
        icon: 'map.fill'
      },
      totalCaloriesBurned: {
        label: 'Calories Burned',
        value: runStats.totalCaloriesBurned,
        icon: 'flame.fill'
      },
      bestPace: {
        label: 'Best Pace',
        value: runStats.bestPace ? `${Math.floor(runStats.bestPace / 60)}:${String(Math.round(runStats.bestPace % 60)).padStart(2, '0')} /km` : '--',
        icon: 'bolt.fill'
      }
    }

    // Add nutrition and run achievements
    const allAchievements = [
      ...achievements,
      {
        id: 'first_meal',
        title: 'First Meal Logged',
        description: 'Logged your first meal',
        unlocked: nutritionStats.totalMeals >= 1,
        progress: Math.min(nutritionStats.totalMeals, 1),
        target: 1,
        icon: 'fork.knife'
      },
      {
        id: 'meal_50',
        title: '50 Meals',
        description: 'Logged 50 meals',
        unlocked: nutritionStats.totalMeals >= 50,
        progress: Math.min(nutritionStats.totalMeals, 50),
        target: 50,
        icon: 'fork.knife'
      },
      {
        id: 'first_run',
        title: 'First Run',
        description: 'Completed your first run',
        unlocked: runStats.totalRuns >= 1,
        progress: Math.min(runStats.totalRuns, 1),
        target: 1,
        icon: 'figure.run'
      },
      {
        id: 'run_10k',
        title: '10K Total',
        description: 'Ran a total of 10 km',
        unlocked: runStats.totalDistanceKm >= 10,
        progress: Math.min(Math.round(runStats.totalDistanceKm), 10),
        target: 10,
        icon: 'map.fill'
      },
      {
        id: 'run_50k',
        title: '50K Total',
        description: 'Ran a total of 50 km',
        unlocked: runStats.totalDistanceKm >= 50,
        progress: Math.min(Math.round(runStats.totalDistanceKm), 50),
        target: 50,
        icon: 'trophy.fill'
      },
    ]

    return {
      stats,
      nutritionStats: nutritionDisplay,
      runStats: runDisplay,
      achievements: allAchievements,
      recentActivity: recentActivityFormatted,
      streak,
      summary: {
        totalScans: scanStats?.totalScans || 0,
        totalWorkouts: workoutStats?.total_workouts_completed || 0,
        totalMeals: nutritionStats.totalMeals,
        totalRuns: runStats.totalRuns,
        totalDistanceKm: runStats.totalDistanceKm,
        totalAchievements: allAchievements.length,
        unlockedAchievements: allAchievements.filter(a => a.unlocked).length,
        scansThisWeek: scanStats?.scansThisWeek || 0,
        workoutsThisWeek: workoutStats?.recent_workouts_7_days || 0,
        mealsThisWeek: nutritionStats.mealsThisWeek,
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

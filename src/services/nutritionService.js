import { supabase } from '../config/supabase.js'

/**
 * Nutrition Service
 * Handles CRUD operations for food logs
 */

/**
 * Create a new food log entry
 * @param {string} userId - User ID
 * @param {object} logData - Food log data
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export async function createFoodLog(userId, logData) {
  try {
    const { data, error } = await supabase
      .from('food_logs')
      .insert({
        user_id: userId,
        food_name: logData.food_name,
        calories: logData.calories || 0,
        protein_g: logData.protein_g || 0,
        carbs_g: logData.carbs_g || 0,
        fat_g: logData.fat_g || 0,
        fiber_g: logData.fiber_g || 0,
        sugar_g: logData.sugar_g || 0,
        serving_size: logData.serving_size || null,
        servings: logData.servings || 1,
        meal_type: logData.meal_type || 'snack',
        image_url: logData.image_url || null,
        ai_identified: logData.ai_identified || false,
        ai_raw_response: logData.ai_raw_response || null,
        logged_at: logData.logged_at || new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating food log:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in createFoodLog:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get food logs for a specific date
 * @param {string} userId - User ID
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {{ success: boolean, data?: Array, error?: string }}
 */
export async function getFoodLogsByDate(userId, date) {
  try {
    // Build date range for the full day
    const startOfDay = `${date}T00:00:00.000Z`
    const endOfDay = `${date}T23:59:59.999Z`

    const { data, error } = await supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_at', startOfDay)
      .lte('logged_at', endOfDay)
      .order('logged_at', { ascending: true })

    if (error) {
      console.error('Error fetching food logs:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error in getFoodLogsByDate:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get daily nutrition summary (totals + calorie goal)
 * @param {string} userId - User ID
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export async function getDailyNutritionSummary(userId, date) {
  try {
    // Get food logs for the day
    const logsResult = await getFoodLogsByDate(userId, date)
    if (!logsResult.success) {
      return logsResult
    }

    const logs = logsResult.data

    // Calculate totals
    const totals = logs.reduce((acc, log) => {
      const servings = log.servings || 1
      acc.calories += Math.round((log.calories || 0) * servings)
      acc.protein_g += parseFloat(((log.protein_g || 0) * servings).toFixed(1))
      acc.carbs_g += parseFloat(((log.carbs_g || 0) * servings).toFixed(1))
      acc.fat_g += parseFloat(((log.fat_g || 0) * servings).toFixed(1))
      acc.fiber_g += parseFloat(((log.fiber_g || 0) * servings).toFixed(1))
      acc.sugar_g += parseFloat(((log.sugar_g || 0) * servings).toFixed(1))
      return acc
    }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 })

    // Get user's calorie and macro goals
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('daily_calorie_goal, macro_protein_pct, macro_carbs_pct, macro_fat_pct, daily_sugar_goal')
      .eq('id', userId)
      .single()

    const dailyCalorieGoal = userData?.daily_calorie_goal || 2000
    const macroProteinPct = userData?.macro_protein_pct ?? 30
    const macroCarbsPct = userData?.macro_carbs_pct ?? 40
    const macroFatPct = userData?.macro_fat_pct ?? 30
    const dailySugarGoal = userData?.daily_sugar_goal ?? 50

    return {
      success: true,
      data: {
        date,
        totals,
        daily_calorie_goal: dailyCalorieGoal,
        macro_protein_pct: macroProteinPct,
        macro_carbs_pct: macroCarbsPct,
        macro_fat_pct: macroFatPct,
        daily_sugar_goal: dailySugarGoal,
        calories_remaining: dailyCalorieGoal - totals.calories,
        meal_count: logs.length
      }
    }
  } catch (error) {
    console.error('Error in getDailyNutritionSummary:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get a single food log by ID (for cleanup before deletion)
 */
export async function getFoodLogById(logId, userId) {
  try {
    const { data, error } = await supabase
      .from('food_logs')
      .select('id, image_url')
      .eq('id', logId)
      .eq('user_id', userId)
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Update a food log entry
 * @param {string} logId - Food log ID
 * @param {string} userId - User ID (for authorization)
 * @param {object} updates - Fields to update
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export async function updateFoodLog(logId, userId, updates) {
  try {
    // Only allow updating specific fields
    const allowedFields = [
      'food_name', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g',
      'serving_size', 'servings', 'meal_type', 'logged_at'
    ]

    const sanitizedUpdates = {}
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        sanitizedUpdates[key] = updates[key]
      }
    }

    const { data, error } = await supabase
      .from('food_logs')
      .update(sanitizedUpdates)
      .eq('id', logId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('Error updating food log:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in updateFoodLog:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Delete a food log entry
 * @param {string} logId - Food log ID
 * @param {string} userId - User ID (for authorization)
 * @returns {{ success: boolean, error?: string }}
 */
export async function deleteFoodLog(logId, userId) {
  try {
    const { error } = await supabase
      .from('food_logs')
      .delete()
      .eq('id', logId)
      .eq('user_id', userId)

    if (error) {
      console.error('Error deleting food log:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Error in deleteFoodLog:', error)
    return { success: false, error: error.message }
  }
}

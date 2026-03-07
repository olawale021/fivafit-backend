import { supabase } from '../config/supabase.js'

/**
 * Create a meal favorite
 */
export async function createFavorite(userId, data) {
  try {
    // Calculate totals from items
    const items = data.items || []
    const totals = items.reduce((acc, item) => {
      const s = item.servings || 1
      acc.total_calories += Math.round((item.calories || 0) * s)
      acc.total_protein_g += parseFloat(((item.protein_g || 0) * s).toFixed(1))
      acc.total_carbs_g += parseFloat(((item.carbs_g || 0) * s).toFixed(1))
      acc.total_fat_g += parseFloat(((item.fat_g || 0) * s).toFixed(1))
      acc.total_fiber_g += parseFloat(((item.fiber_g || 0) * s).toFixed(1))
      acc.total_sugar_g += parseFloat(((item.sugar_g || 0) * s).toFixed(1))
      return acc
    }, { total_calories: 0, total_protein_g: 0, total_carbs_g: 0, total_fat_g: 0, total_fiber_g: 0, total_sugar_g: 0 })

    const { data: result, error } = await supabase
      .from('meal_favorites')
      .insert({
        user_id: userId,
        name: data.name,
        is_recipe: data.is_recipe || items.length > 1,
        meal_type: data.meal_type || 'snack',
        items,
        ...totals,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating favorite:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: result }
  } catch (error) {
    console.error('Error in createFavorite:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get all favorites for a user, ordered by most used
 */
export async function getFavorites(userId) {
  try {
    const { data, error } = await supabase
      .from('meal_favorites')
      .select('*')
      .eq('user_id', userId)
      .order('use_count', { ascending: false })
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Error fetching favorites:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error in getFavorites:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Increment use_count when a favorite is logged
 */
export async function incrementUseCount(favoriteId, userId) {
  try {
    const { error } = await supabase.rpc('increment_favorite_use_count', {
      fav_id: favoriteId,
      uid: userId,
    })

    // Fallback if RPC doesn't exist: manual update
    if (error) {
      await supabase
        .from('meal_favorites')
        .update({
          use_count: supabase.rpc ? undefined : 0, // will be overwritten below
          updated_at: new Date().toISOString(),
        })
        .eq('id', favoriteId)
        .eq('user_id', userId)

      // Do a select + update to increment
      const { data: fav } = await supabase
        .from('meal_favorites')
        .select('use_count')
        .eq('id', favoriteId)
        .eq('user_id', userId)
        .single()

      if (fav) {
        await supabase
          .from('meal_favorites')
          .update({ use_count: (fav.use_count || 0) + 1, updated_at: new Date().toISOString() })
          .eq('id', favoriteId)
          .eq('user_id', userId)
      }
    }
  } catch (error) {
    console.error('Error incrementing use count:', error)
  }
}

/**
 * Delete a favorite
 */
export async function deleteFavorite(favoriteId, userId) {
  try {
    const { error } = await supabase
      .from('meal_favorites')
      .delete()
      .eq('id', favoriteId)
      .eq('user_id', userId)

    if (error) {
      console.error('Error deleting favorite:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Error in deleteFavorite:', error)
    return { success: false, error: error.message }
  }
}

import { supabase } from '../config/supabase.js'

/**
 * Get all saved recipes for a user, newest first
 */
export async function getSavedRecipes(userId) {
  try {
    const { data, error } = await supabase
      .from('saved_recipes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching saved recipes:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error('Error in getSavedRecipes:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Save a recipe (idempotent upsert on user_id + recipe_id).
 * Only the Edamam-license-allowed fields are stored: recipe id/uri, label,
 * image URL, and four per-serving macros.
 */
export async function saveRecipe(userId, payload) {
  try {
    const round1 = (v) => parseFloat((parseFloat(v) || 0).toFixed(1))
    const row = {
      user_id: userId,
      recipe_id: payload.recipe_id,
      recipe_uri: payload.recipe_uri,
      label: payload.label,
      image_url: payload.image_url || null,
      calories: Math.round(parseFloat(payload.calories) || 0),
      protein_g: round1(payload.protein_g),
      fat_g: round1(payload.fat_g),
      carbs_g: round1(payload.carbs_g),
    }

    const { data, error } = await supabase
      .from('saved_recipes')
      .upsert(row, { onConflict: 'user_id,recipe_id' })
      .select()
      .single()

    if (error) {
      console.error('Error saving recipe:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error in saveRecipe:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Remove a saved recipe by its Edamam recipe_id
 */
export async function unsaveRecipe(userId, recipeId) {
  try {
    const { error } = await supabase
      .from('saved_recipes')
      .delete()
      .eq('user_id', userId)
      .eq('recipe_id', recipeId)

    if (error) {
      console.error('Error unsaving recipe:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Error in unsaveRecipe:', error)
    return { success: false, error: error.message }
  }
}

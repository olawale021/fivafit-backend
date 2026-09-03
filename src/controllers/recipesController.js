import * as edamamService from '../services/edamamService.js'
import * as savedRecipesService from '../services/savedRecipesService.js'

function sendServiceError(res, error) {
  if (error === 'not_configured') {
    return res.status(503).json({ error: 'not_configured', message: 'Recipe service not configured' })
  }
  if (error === 'not_found') {
    return res.status(404).json({ error: 'not_found', message: 'Recipe not found' })
  }
  if (error === 'rate_limited') {
    res.set('Retry-After', '30')
    return res.status(429).json({ error: 'rate_limited', message: 'Recipe service is busy, try again shortly' })
  }
  return res.status(502).json({ error: 'upstream', message: 'Recipe provider error' })
}

/**
 * GET /api/recipes/shelves?maxCalories=620
 */
export const getShelves = async (req, res) => {
  try {
    const { maxCalories, proteinLeft, goals, cuisines, health, ingredients } = req.query
    const result = await edamamService.getShelves({ maxCalories, proteinLeft, goals, cuisines, health, ingredients })
    if (!result.success) return sendServiceError(res, result.error)
    return res.json({ success: true, data: result.data })
  } catch (error) {
    console.error('[Recipes] Error in getShelves:', error)
    return res.status(500).json({ error: 'server_error', message: 'Internal server error' })
  }
}

/**
 * GET /api/recipes/search?q=&diet=&health=&cuisineType=&mealType=&dishType=&caloriesMin=&caloriesMax=&time=&cont=
 */
export const search = async (req, res) => {
  try {
    const { q, diet, health, cuisineType, mealType, dishType, caloriesMin, caloriesMax, time, cont } = req.query

    const params = {
      q,
      diet,
      health: typeof health === 'string' && health.includes(',') ? health.split(',') : health,
      cuisineType:
        typeof cuisineType === 'string' && cuisineType.includes(',') ? cuisineType.split(',') : cuisineType,
      mealType,
      // Multiple dish types arrive comma-joined from the client
      dishType: typeof dishType === 'string' && dishType.includes(',') ? dishType.split(',') : dishType,
      time,
      cont,
    }
    const min = parseInt(caloriesMin, 10)
    const max = parseInt(caloriesMax, 10)
    if (!isNaN(min) || !isNaN(max)) {
      params.calories = `${isNaN(min) ? 0 : min}-${isNaN(max) ? 5000 : max}`
    }

    const result = await edamamService.searchRecipes(params)
    if (!result.success) return sendServiceError(res, result.error)
    return res.json({ success: true, data: result.data })
  } catch (error) {
    console.error('[Recipes] Error in search:', error)
    return res.status(500).json({ error: 'server_error', message: 'Internal server error' })
  }
}

/**
 * GET /api/recipes/:id
 */
export const getById = async (req, res) => {
  try {
    const result = await edamamService.getRecipeById(req.params.id)
    if (!result.success) return sendServiceError(res, result.error)
    return res.json({ success: true, data: result.data })
  } catch (error) {
    console.error('[Recipes] Error in getById:', error)
    return res.status(500).json({ error: 'server_error', message: 'Internal server error' })
  }
}

/**
 * GET /api/recipes/saved
 */
export const getSaved = async (req, res) => {
  try {
    const result = await savedRecipesService.getSavedRecipes(req.user.id)
    if (!result.success) {
      return res.status(500).json({ error: 'server_error', message: result.error })
    }
    return res.json({ success: true, data: result.data })
  } catch (error) {
    console.error('[Recipes] Error in getSaved:', error)
    return res.status(500).json({ error: 'server_error', message: 'Internal server error' })
  }
}

/**
 * POST /api/recipes/saved
 * Body: { recipe_id, recipe_uri, label, image_url?, calories, protein_g, fat_g, carbs_g }
 */
export const save = async (req, res) => {
  try {
    const { recipe_id, recipe_uri, label } = req.body || {}
    if (!recipe_id || !recipe_uri || !label) {
      return res.status(400).json({ error: 'invalid_request', message: 'recipe_id, recipe_uri and label are required' })
    }

    const result = await savedRecipesService.saveRecipe(req.user.id, req.body)
    if (!result.success) {
      return res.status(500).json({ error: 'server_error', message: result.error })
    }
    return res.json({ success: true, data: result.data })
  } catch (error) {
    console.error('[Recipes] Error in save:', error)
    return res.status(500).json({ error: 'server_error', message: 'Internal server error' })
  }
}

/**
 * DELETE /api/recipes/saved/:recipeId
 */
export const unsave = async (req, res) => {
  try {
    const result = await savedRecipesService.unsaveRecipe(req.user.id, req.params.recipeId)
    if (!result.success) {
      return res.status(500).json({ error: 'server_error', message: result.error })
    }
    return res.json({ success: true })
  } catch (error) {
    console.error('[Recipes] Error in unsave:', error)
    return res.status(500).json({ error: 'server_error', message: 'Internal server error' })
  }
}

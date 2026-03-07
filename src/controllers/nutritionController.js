import fs from 'fs'
import { analyzeFoodPhoto, analyzeFoodText } from '../services/nutritionAiService.js'
import { uploadFoodImage, deleteFoodImage } from '../services/storageService.js'
import {
  createFoodLog,
  getFoodLogsByDate,
  getDailyNutritionSummary,
  updateFoodLog,
  deleteFoodLog,
  getFoodLogById,
} from '../services/nutritionService.js'

/**
 * Nutrition Controller
 * Handles food logging and nutrition analysis requests
 */

/**
 * POST /api/nutrition/analyze-photo
 * Upload food photo → OpenAI identifies food → Perplexity gets nutrition
 */
export async function analyzePhoto(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No image provided',
        message: 'Please upload a photo of your food'
      })
    }

    const user = req.user
    console.log(`🍽️ Analyzing food photo for user: ${user.email}`)

    // Read the uploaded file
    const imagePath = req.file.path
    const imageData = fs.readFileSync(imagePath)
    const mimeType = req.file.mimetype || 'image/jpeg'

    // Upload to storage (for diary display later)
    let imageUrl = null
    if (user?.id) {
      imageUrl = await uploadFoodImage(imageData, user.id, mimeType)
    }

    // Clean up local file
    fs.unlinkSync(imagePath)

    // OpenAI analyzes image via base64 (no URL loading issues)
    const result = await analyzeFoodPhoto(imageData, mimeType)

    if (!result.is_food) {
      return res.status(400).json({
        error: 'Not food',
        message: result.error || 'No food detected in the image. Please try again with a food photo.'
      })
    }

    res.json({
      success: true,
      data: {
        items: result.items,
        meal_description: result.meal_description,
        image_url: imageUrl,
        ai_raw: result.ai_raw
      }
    })
  } catch (error) {
    console.error('❌ Food photo analysis error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to analyze food photo'
    })
  }
}

/**
 * POST /api/nutrition/analyze-text
 * Text/voice description → Perplexity nutrition lookup
 */
export async function analyzeText(req, res) {
  try {
    const { text } = req.body

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: 'No text provided',
        message: 'Please provide a food description'
      })
    }

    const user = req.user
    console.log(`📝 Analyzing food text for user: ${user.email}: "${text}"`)

    const result = await analyzeFoodText(text.trim())

    if (!result.items || result.items.length === 0) {
      return res.status(400).json({
        error: 'No food found',
        message: result.error || 'Could not identify food items from the description. Please try again.'
      })
    }

    res.json({
      success: true,
      data: {
        items: result.items,
        original_text: result.original_text,
        ai_raw: result.ai_raw
      }
    })
  } catch (error) {
    console.error('❌ Food text analysis error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to analyze food description'
    })
  }
}

/**
 * POST /api/nutrition/log
 * Log food entry (from AI analysis or manual)
 */
export async function logFood(req, res) {
  try {
    const user = req.user
    const { items, meal_type, image_url, ai_raw } = req.body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'No food items',
        message: 'Please provide at least one food item to log'
      })
    }

    const results = []
    for (const item of items) {
      const logData = {
        food_name: item.food_name || item.name,
        calories: item.calories || 0,
        protein_g: item.protein_g || 0,
        carbs_g: item.carbs_g || 0,
        fat_g: item.fat_g || 0,
        fiber_g: item.fiber_g || 0,
        sugar_g: item.sugar_g || 0,
        serving_size: item.serving_size || null,
        servings: item.servings || 1,
        meal_type: item.meal_type || meal_type || 'snack',
        image_url: image_url || null,
        ai_identified: !!ai_raw,
        ai_raw_response: ai_raw || null,
        logged_at: item.logged_at || new Date().toISOString()
      }

      const result = await createFoodLog(user.id, logData)
      if (result.success) {
        results.push(result.data)
      } else {
        console.error(`❌ Failed to log food item "${logData.food_name}":`, result.error)
      }
    }

    if (results.length === 0) {
      return res.status(500).json({
        error: 'Failed to log',
        message: 'Failed to save food entries'
      })
    }

    console.log(`✅ Logged ${results.length} food items for user ${user.id}`)
    res.json({
      success: true,
      data: results
    })
  } catch (error) {
    console.error('❌ Food logging error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to log food'
    })
  }
}

/**
 * GET /api/nutrition/daily/:date
 * Get food logs for a specific date
 */
export async function getDailyLogs(req, res) {
  try {
    const user = req.user
    const { date } = req.params

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'Invalid date',
        message: 'Please provide a date in YYYY-MM-DD format'
      })
    }

    const result = await getFoodLogsByDate(user.id, date)

    if (!result.success) {
      return res.status(500).json({
        error: 'Server error',
        message: result.error
      })
    }

    res.json({
      success: true,
      data: result.data
    })
  } catch (error) {
    console.error('❌ Get daily logs error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to fetch food logs'
    })
  }
}

/**
 * GET /api/nutrition/summary/:date
 * Get daily nutrition summary with totals + calorie goal
 */
export async function getDailySummary(req, res) {
  try {
    const user = req.user
    const { date } = req.params

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: 'Invalid date',
        message: 'Please provide a date in YYYY-MM-DD format'
      })
    }

    const result = await getDailyNutritionSummary(user.id, date)

    if (!result.success) {
      return res.status(500).json({
        error: 'Server error',
        message: result.error
      })
    }

    res.json({
      success: true,
      data: result.data
    })
  } catch (error) {
    console.error('❌ Get daily summary error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to fetch nutrition summary'
    })
  }
}

/**
 * PUT /api/nutrition/log/:id
 * Update a food log entry
 */
export async function updateLog(req, res) {
  try {
    const user = req.user
    const { id } = req.params

    const result = await updateFoodLog(id, user.id, req.body)

    if (!result.success) {
      return res.status(500).json({
        error: 'Server error',
        message: result.error
      })
    }

    res.json({
      success: true,
      data: result.data
    })
  } catch (error) {
    console.error('❌ Update food log error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to update food log'
    })
  }
}

/**
 * DELETE /api/nutrition/log/:id
 * Delete a food log entry
 */
export async function deleteLog(req, res) {
  try {
    const user = req.user
    const { id } = req.params

    // Get the log first to check for image_url
    const logResult = await getFoodLogById(id, user.id)
    const imageUrl = logResult?.data?.image_url

    const result = await deleteFoodLog(id, user.id)

    if (!result.success) {
      return res.status(500).json({
        error: 'Server error',
        message: result.error
      })
    }

    // Clean up food image from storage in background
    if (imageUrl) {
      deleteFoodImage(imageUrl).catch(err =>
        console.error('Failed to clean up food image:', err)
      )
    }

    res.json({
      success: true,
      message: 'Food log deleted'
    })
  } catch (error) {
    console.error('❌ Delete food log error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to delete food log'
    })
  }
}

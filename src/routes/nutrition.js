import express from 'express'
import multer from 'multer'
import { authenticateJWT } from '../middleware/customAuth.js'
import { requirePremium } from '../middleware/premiumAuth.js'
import {
  analyzePhoto,
  analyzeText,
  logFood,
  getDailyLogs,
  getDailySummary,
  updateLog,
  deleteLog
} from '../controllers/nutritionController.js'
import {
  createFavorite,
  getFavorites,
  deleteFavorite,
  incrementUseCount,
} from '../services/mealFavoritesService.js'
import { lookupBarcode } from '../services/barcodeService.js'

const router = express.Router()

// Configure Multer for food image uploads
const upload = multer({ dest: 'uploads/' })

/**
 * POST /api/nutrition/analyze-photo
 * Upload food photo → Gemini + Perplexity analysis
 */
router.post('/analyze-photo', authenticateJWT, requirePremium, upload.single('image'), analyzePhoto)

/**
 * POST /api/nutrition/analyze-text
 * Text/voice description → Perplexity nutrition lookup
 */
router.post('/analyze-text', authenticateJWT, requirePremium, analyzeText)

/**
 * POST /api/nutrition/log
 * Log food entry (from AI or manual)
 */
router.post('/log', authenticateJWT, logFood)

/**
 * GET /api/nutrition/daily/:date
 * Get food logs for a date (YYYY-MM-DD)
 */
router.get('/daily/:date', authenticateJWT, getDailyLogs)

/**
 * GET /api/nutrition/summary/:date
 * Daily totals + calorie goal
 */
router.get('/summary/:date', authenticateJWT, getDailySummary)

/**
 * PUT /api/nutrition/log/:id
 * Update a food log
 */
router.put('/log/:id', authenticateJWT, updateLog)

/**
 * DELETE /api/nutrition/log/:id
 * Delete a food log
 */
router.delete('/log/:id', authenticateJWT, deleteLog)

// ---- Barcode Scanning ----

/**
 * GET /api/nutrition/barcode/:code
 * Look up product nutrition by barcode (UPC/EAN)
 */
router.get('/barcode/:code', authenticateJWT, requirePremium, async (req, res) => {
  try {
    const { code } = req.params
    if (!code || code.length < 4) {
      return res.status(400).json({ error: 'Invalid barcode', message: 'Please provide a valid barcode' })
    }

    const result = await lookupBarcode(code)

    if (!result.success) {
      return res.status(404).json({
        error: 'Not found',
        message: result.error || 'Product not found for this barcode. Try scanning again or log manually.'
      })
    }

    console.log(`[Barcode] ${result.source === 'cache' ? 'Cache hit' : 'API fetch'} for ${code}: ${result.data.product_name}`)

    res.json({
      success: true,
      data: result.data,
      source: result.source,
    })
  } catch (error) {
    console.error('Barcode lookup error:', error)
    res.status(500).json({ error: 'Server error', message: 'Failed to look up barcode' })
  }
})

// ---- Meal Favorites / Recipes ----

/**
 * GET /api/nutrition/favorites
 * Get user's saved meals and recipes
 */
router.get('/favorites', authenticateJWT, async (req, res) => {
  try {
    const result = await getFavorites(req.user.id)
    if (!result.success) return res.status(500).json({ error: 'Server error', message: result.error })
    res.json({ success: true, data: result.data })
  } catch (error) {
    res.status(500).json({ error: 'Server error', message: 'Failed to fetch favorites' })
  }
})

/**
 * POST /api/nutrition/favorites
 * Save a meal as favorite / create a recipe
 */
router.post('/favorites', authenticateJWT, async (req, res) => {
  try {
    const { name, items, meal_type, is_recipe } = req.body
    if (!name || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid data', message: 'Name and items are required' })
    }
    const result = await createFavorite(req.user.id, { name, items, meal_type, is_recipe })
    if (!result.success) return res.status(500).json({ error: 'Server error', message: result.error })
    res.json({ success: true, data: result.data })
  } catch (error) {
    res.status(500).json({ error: 'Server error', message: 'Failed to create favorite' })
  }
})

/**
 * POST /api/nutrition/favorites/:id/use
 * Increment use count when a favorite is logged
 */
router.post('/favorites/:id/use', authenticateJWT, async (req, res) => {
  try {
    await incrementUseCount(req.params.id, req.user.id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Server error', message: 'Failed to update favorite' })
  }
})

/**
 * DELETE /api/nutrition/favorites/:id
 * Delete a favorite
 */
router.delete('/favorites/:id', authenticateJWT, async (req, res) => {
  try {
    const result = await deleteFavorite(req.params.id, req.user.id)
    if (!result.success) return res.status(500).json({ error: 'Server error', message: result.error })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Server error', message: 'Failed to delete favorite' })
  }
})

export default router

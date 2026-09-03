import express from 'express'
import { authenticateJWT } from '../middleware/customAuth.js'
import {
  getShelves,
  search,
  getById,
  getSaved,
  save,
  unsave,
} from '../controllers/recipesController.js'

const router = express.Router()

// NOTE: keep the named routes above the /:id param route

/**
 * GET /api/recipes/shelves
 * Curated recipe shelves (optionally budget-aware via ?maxCalories=)
 */
router.get('/shelves', authenticateJWT, getShelves)

/**
 * GET /api/recipes/search
 * Filtered recipe search proxied to Edamam
 */
router.get('/search', authenticateJWT, search)

/**
 * GET /api/recipes/saved
 * User's saved recipes
 */
router.get('/saved', authenticateJWT, getSaved)

/**
 * POST /api/recipes/saved
 * Save a recipe (idempotent)
 */
router.post('/saved', authenticateJWT, save)

/**
 * DELETE /api/recipes/saved/:recipeId
 * Remove a saved recipe
 */
router.delete('/saved/:recipeId', authenticateJWT, unsave)

/**
 * GET /api/recipes/:id
 * Recipe detail by Edamam id
 */
router.get('/:id', authenticateJWT, getById)

export default router

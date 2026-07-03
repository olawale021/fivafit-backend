import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import {
  listCatalog,
  listByCategory,
  getDetail,
  listCompleters,
  myProgress,
} from '../controllers/challengeCatalogController.js'

const router = express.Router()

// Specific routes before parameterized routes
router.get('/me/progress', authenticateToken, myProgress)
router.get('/category/:category', authenticateToken, listByCategory)

router.get('/', authenticateToken, listCatalog)
router.get('/:id/completers', authenticateToken, listCompleters)
router.get('/:id', authenticateToken, getDetail)

export default router

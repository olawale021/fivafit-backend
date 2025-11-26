import express from 'express'
import multer from 'multer'
import { authenticateJWT } from '../middleware/customAuth.js'
import { identifyEquipment, identifyEquipmentQuick } from '../controllers/equipmentController.js'

const router = express.Router()

// Configure Multer for file upload
const upload = multer({ dest: 'uploads/' })

/**
 * POST /api/ai/identify-quick
 * Quick equipment identification - only returns name (fast, cheap)
 * Used to check if equipment exists in database before doing full analysis
 */
router.post('/identify-quick', authenticateJWT, upload.single('image'), identifyEquipmentQuick)

/**
 * POST /api/ai/identify
 * Full equipment identification with workout generation (slow, detailed)
 * Only used when equipment is not found in database
 */
router.post('/identify', authenticateJWT, upload.single('image'), identifyEquipment)

export default router

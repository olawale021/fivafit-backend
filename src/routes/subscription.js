import express from 'express'
import { authenticateJWT } from '../middleware/customAuth.js'
import {
  getSubscriptionStatus,
  syncSubscription,
  handleWebhook,
} from '../controllers/subscriptionController.js'

const router = express.Router()

/**
 * GET /api/subscription/status
 * Get current user's subscription status
 */
router.get('/status', authenticateJWT, getSubscriptionStatus)

/**
 * POST /api/subscription/sync
 * Sync subscription data from mobile app after RevenueCat purchase
 */
router.post('/sync', authenticateJWT, syncSubscription)

/**
 * POST /api/subscription/webhook
 * RevenueCat webhook — no JWT auth, validates its own secret
 */
router.post('/webhook', handleWebhook)

export default router

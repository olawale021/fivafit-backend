import { isUserPremium } from '../services/subscriptionService.js'

/**
 * Middleware to require an active premium subscription
 * Must be used after authenticateJWT (needs req.user)
 */
export const requirePremium = async (req, res, next) => {
  try {
    const isPremium = await isUserPremium(req.user.id)

    if (!isPremium) {
      return res.status(403).json({ error: 'premium_required' })
    }

    next()
  } catch (error) {
    console.error('Error in requirePremium middleware:', error)
    return res.status(500).json({ error: 'Server error', message: 'Failed to verify subscription' })
  }
}

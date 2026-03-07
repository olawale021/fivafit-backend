import {
  getSubscriptionByUserId,
  getSubscriptionByRevenueCatId,
  upsertSubscription,
  isUserPremium,
} from '../services/subscriptionService.js'

/**
 * GET /api/subscription/status
 * Returns the user's subscription status
 */
export async function getSubscriptionStatus(req, res) {
  try {
    const user = req.user
    const result = await getSubscriptionByUserId(user.id)

    if (!result.success) {
      return res.status(500).json({ error: 'Server error', message: result.error })
    }

    const subscription = result.data
    res.json({
      success: true,
      data: {
        isPremium: subscription?.status === 'active',
        status: subscription?.status || 'free',
        plan_type: subscription?.plan_type || null,
        current_period_end: subscription?.current_period_end || null,
        will_renew: subscription?.will_renew || false,
      },
    })
  } catch (error) {
    console.error('Error in getSubscriptionStatus:', error)
    res.status(500).json({ error: 'Server error', message: 'Failed to fetch subscription status' })
  }
}

/**
 * POST /api/subscription/sync
 * Mobile app syncs subscription after purchase via RevenueCat
 */
export async function syncSubscription(req, res) {
  try {
    const user = req.user
    const {
      revenuecat_customer_id,
      plan_type,
      status,
      product_identifier,
      current_period_start,
      current_period_end,
      original_purchase_date,
      will_renew,
      store,
      environment,
    } = req.body

    const result = await upsertSubscription(user.id, {
      revenuecat_customer_id,
      plan_type,
      status: status || 'active',
      product_identifier,
      current_period_start,
      current_period_end,
      original_purchase_date,
      will_renew,
      store,
      environment,
    })

    if (!result.success) {
      return res.status(500).json({ error: 'Server error', message: result.error })
    }

    console.log(`✅ Subscription synced for user ${user.id}: ${status || 'active'}`)
    res.json({ success: true, data: result.data })
  } catch (error) {
    console.error('Error in syncSubscription:', error)
    res.status(500).json({ error: 'Server error', message: 'Failed to sync subscription' })
  }
}

/**
 * POST /api/subscription/webhook
 * RevenueCat webhook — no JWT auth, validates Authorization header against secret
 */
export async function handleWebhook(req, res) {
  try {
    // Validate webhook secret
    const authHeader = req.headers.authorization
    const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET

    if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
      console.error('Webhook auth failed')
      return res.status(200).json({ success: false })
    }

    const event = req.body.event

    if (!event) {
      console.error('No event in webhook body')
      return res.status(200).json({ success: false })
    }

    const eventType = event.type
    const appUserId = event.app_user_id
    const productId = event.product_id
    const store = event.store === 'APP_STORE' ? 'app_store' : 'play_store'
    const environment = event.environment === 'SANDBOX' ? 'sandbox' : 'production'
    const expirationDate = event.expiration_at_ms
      ? new Date(event.expiration_at_ms).toISOString()
      : null
    const purchaseDate = event.purchased_at_ms
      ? new Date(event.purchased_at_ms).toISOString()
      : null
    const originalPurchaseDate = event.original_purchased_at_ms
      ? new Date(event.original_purchased_at_ms).toISOString()
      : null

    console.log(`📦 RevenueCat webhook: ${eventType} for user ${appUserId}`)

    // Map event type to subscription status
    let status
    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
      case 'PRODUCT_CHANGE':
        status = 'active'
        break
      case 'CANCELLATION':
        status = 'cancelled'
        break
      case 'EXPIRATION':
        status = 'expired'
        break
      case 'BILLING_ISSUE_DETECTED':
        status = 'billing_issue'
        break
      default:
        console.log(`Unhandled webhook event type: ${eventType}`)
        return res.status(200).json({ success: true })
    }

    // Determine plan type from product ID
    let planType = null
    if (productId) {
      if (productId.includes('monthly')) planType = 'monthly'
      else if (productId.includes('yearly') || productId.includes('annual')) planType = 'yearly'
    }

    // Try to find user by app_user_id (our user ID) or by RC customer ID
    let userId = appUserId

    // First check if appUserId looks like a UUID (our user ID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(appUserId)) {
      // Try to find by RevenueCat customer ID
      const rcResult = await getSubscriptionByRevenueCatId(appUserId)
      if (rcResult.success && rcResult.data) {
        userId = rcResult.data.user_id
      } else {
        console.error(`Cannot find user for RC customer ID: ${appUserId}`)
        return res.status(200).json({ success: true })
      }
    }

    await upsertSubscription(userId, {
      revenuecat_customer_id: appUserId !== userId ? appUserId : null,
      plan_type: planType,
      status,
      product_identifier: productId,
      current_period_start: purchaseDate,
      current_period_end: expirationDate,
      original_purchase_date: originalPurchaseDate,
      will_renew: eventType !== 'CANCELLATION' && eventType !== 'EXPIRATION',
      store,
      environment,
    })

    console.log(`✅ Webhook processed: ${eventType} → status=${status} for user ${userId}`)
    res.status(200).json({ success: true })
  } catch (error) {
    console.error('Error in handleWebhook:', error)
    // Always return 200 to prevent RevenueCat from retrying
    res.status(200).json({ success: false })
  }
}

import { supabase } from '../config/supabase.js'

/**
 * Get subscription by user ID
 */
export async function getSubscriptionByUserId(userId) {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching subscription:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data || null }
  } catch (error) {
    console.error('Error in getSubscriptionByUserId:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get subscription by RevenueCat customer ID
 */
export async function getSubscriptionByRevenueCatId(rcId) {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('revenuecat_customer_id', rcId)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching subscription by RC ID:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data || null }
  } catch (error) {
    console.error('Error in getSubscriptionByRevenueCatId:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Upsert subscription (insert or update on conflict user_id)
 */
export async function upsertSubscription(userId, data) {
  try {
    const { data: result, error } = await supabase
      .from('subscriptions')
      .upsert(
        {
          user_id: userId,
          revenuecat_customer_id: data.revenuecat_customer_id || null,
          plan_type: data.plan_type || null,
          status: data.status || 'free',
          entitlement: data.entitlement || 'Stepmode Premium',
          product_identifier: data.product_identifier || null,
          current_period_start: data.current_period_start || null,
          current_period_end: data.current_period_end || null,
          original_purchase_date: data.original_purchase_date || null,
          will_renew: data.will_renew ?? false,
          store: data.store || null,
          environment: data.environment || 'production',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single()

    if (error) {
      console.error('Error upserting subscription:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: result }
  } catch (error) {
    console.error('Error in upsertSubscription:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Check if user has an active premium subscription
 */
export async function isUserPremium(userId) {
  try {
    const result = await getSubscriptionByUserId(userId)
    if (!result.success || !result.data) return false
    return result.data.status === 'active'
  } catch (error) {
    console.error('Error in isUserPremium:', error)
    return false
  }
}

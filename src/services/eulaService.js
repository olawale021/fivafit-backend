import { supabase } from '../config/supabase.js'

/**
 * EULA Service
 * Handles EULA/Terms acceptance tracking
 */

const CURRENT_EULA_VERSION = process.env.EULA_VERSION || '1.0'

/**
 * Get the current EULA version
 */
export function getCurrentEulaVersion() {
  return CURRENT_EULA_VERSION
}

/**
 * Check if user has accepted the current EULA version
 */
export async function hasUserAcceptedEula(userId) {
  const { data, error } = await supabase
    .from('user_eula_acceptances')
    .select('id, eula_version, accepted_at')
    .eq('user_id', userId)
    .eq('eula_version', CURRENT_EULA_VERSION)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('Error checking EULA acceptance:', error)
  }

  return {
    hasAccepted: !!data,
    acceptedVersion: data?.eula_version || null,
    acceptedAt: data?.accepted_at || null,
    currentVersion: CURRENT_EULA_VERSION
  }
}

/**
 * Record user's acceptance of EULA
 */
export async function acceptEula(userId, version, ipAddress = null, deviceInfo = null) {
  const eulaVersion = version || CURRENT_EULA_VERSION

  // Insert acceptance record
  const { data: acceptance, error: acceptanceError } = await supabase
    .from('user_eula_acceptances')
    .upsert({
      user_id: userId,
      eula_version: eulaVersion,
      ip_address: ipAddress,
      device_info: deviceInfo,
      accepted_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,eula_version'
    })
    .select()
    .single()

  if (acceptanceError) {
    console.error('Error recording EULA acceptance:', acceptanceError)
    throw new Error('EULA_ACCEPTANCE_FAILED')
  }

  // Update user record with EULA info
  const { error: userError } = await supabase
    .from('users')
    .update({
      eula_accepted_at: new Date().toISOString(),
      eula_version: eulaVersion
    })
    .eq('id', userId)

  if (userError) {
    console.error('Error updating user EULA status:', userError)
    // Don't fail - the acceptance record is already saved
  }

  return {
    success: true,
    acceptedVersion: eulaVersion,
    acceptedAt: acceptance.accepted_at
  }
}

/**
 * Get user's EULA acceptance history
 */
export async function getUserEulaHistory(userId) {
  const { data, error } = await supabase
    .from('user_eula_acceptances')
    .select('eula_version, accepted_at')
    .eq('user_id', userId)
    .order('accepted_at', { ascending: false })

  if (error) {
    console.error('Error fetching EULA history:', error)
    return []
  }

  return data || []
}

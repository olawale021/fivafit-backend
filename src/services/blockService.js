import { supabase } from '../config/supabase.js'

/**
 * Block Service
 * Handles user blocking functionality
 */

/**
 * Block a user
 */
export async function blockUser(blockerId, blockedId) {
  if (blockerId === blockedId) {
    throw new Error('CANNOT_BLOCK_SELF')
  }

  // Check if already blocked
  const { data: existing } = await supabase
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
    .single()

  if (existing) {
    throw new Error('ALREADY_BLOCKED')
  }

  // Create block record
  const { data, error } = await supabase
    .from('user_blocks')
    .insert({
      blocker_id: blockerId,
      blocked_id: blockedId
    })
    .select()
    .single()

  if (error) {
    console.error('Error blocking user:', error)
    throw new Error('BLOCK_FAILED')
  }

  // Also unfollow each other if following
  await supabase
    .from('user_follows')
    .delete()
    .or(`and(follower_id.eq.${blockerId},following_id.eq.${blockedId}),and(follower_id.eq.${blockedId},following_id.eq.${blockerId})`)

  return { success: true, blocked: true }
}

/**
 * Unblock a user
 */
export async function unblockUser(blockerId, blockedId) {
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)

  if (error) {
    console.error('Error unblocking user:', error)
    throw new Error('UNBLOCK_FAILED')
  }

  return { success: true, blocked: false }
}

/**
 * Get list of blocked user IDs for a user
 */
export async function getBlockedUserIds(userId) {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', userId)

  if (error) {
    console.error('Error getting blocked users:', error)
    return []
  }

  return data?.map(b => b.blocked_id) || []
}

/**
 * Get list of user IDs who have blocked this user
 */
export async function getBlockedByUserIds(userId) {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocker_id')
    .eq('blocked_id', userId)

  if (error) {
    console.error('Error getting blocked-by users:', error)
    return []
  }

  return data?.map(b => b.blocker_id) || []
}

/**
 * Get all user IDs to exclude from content (blocked + blocked by)
 */
export async function getExcludedUserIds(userId) {
  const [blocked, blockedBy] = await Promise.all([
    getBlockedUserIds(userId),
    getBlockedByUserIds(userId)
  ])

  // Return unique user IDs
  return [...new Set([...blocked, ...blockedBy])]
}

/**
 * Check if a user is blocked
 */
export async function isUserBlocked(blockerId, blockedId) {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('Error checking block status:', error)
  }

  return !!data
}

/**
 * Get block relationship between two users
 */
export async function getBlockStatus(userId, targetId) {
  const [isBlocked, isBlockedBy] = await Promise.all([
    isUserBlocked(userId, targetId),
    isUserBlocked(targetId, userId)
  ])

  return {
    isBlocked,    // current user has blocked target
    isBlockedBy,  // target has blocked current user
    hasBlock: isBlocked || isBlockedBy  // any block exists
  }
}

/**
 * Get list of blocked users with profile info
 */
export async function getBlockedUsers(userId) {
  const { data, error } = await supabase
    .from('user_blocks')
    .select(`
      id,
      created_at,
      blocked:blocked_id(
        id,
        username,
        full_name,
        profile_photo_url
      )
    `)
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error getting blocked users:', error)
    throw new Error('FETCH_BLOCKED_FAILED')
  }

  return data?.map(b => ({
    id: b.id,
    blockedAt: b.created_at,
    user: b.blocked
  })) || []
}

import crypto from 'crypto'
import { supabase } from '../config/supabase.js'

/**
 * Group Service
 * Service for managing groups, members, and group interactions
 */

const VALID_CATEGORIES = ['general', 'steps', 'running', 'workouts', 'nutrition']

const generateInviteCode = () =>
  crypto.randomBytes(4).toString('hex').toUpperCase()

/**
 * Create a new group
 * @param {Object} groupData - Group data
 * @param {string} creatorId - Creator user ID
 * @returns {Promise<Object>} Created group with creator as admin member
 */
export const createGroup = async (groupData, creatorId) => {
  try {
    console.log(`👥 Creating new group: ${groupData.name}`)

    const category = VALID_CATEGORIES.includes(groupData.category)
      ? groupData.category
      : 'general'

    // Generate a unique invite_code. Collisions are extremely unlikely on 32 bits;
    // retry up to a few times just in case.
    let group = null
    let groupError = null
    for (let attempt = 0; attempt < 5 && !group; attempt++) {
      const inviteCode = generateInviteCode()
      const insertRes = await supabase
        .from('groups')
        .insert({
          ...groupData,
          category,
          invite_code: inviteCode,
          creator_id: creatorId,
          member_count: 1,
        })
        .select()
        .single()
      if (!insertRes.error) {
        group = insertRes.data
        break
      }
      // 23505 = unique violation — collide on invite_code, retry
      if (insertRes.error.code === '23505' && /invite_code/.test(insertRes.error.message || '')) {
        continue
      }
      groupError = insertRes.error
      break
    }

    if (!group) {
      throw groupError || new Error('Failed to create group after retries')
    }

    // Add creator as admin member
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({
        group_id: group.id,
        user_id: creatorId,
        role: 'admin',
        status: 'active'
      })

    if (memberError) {
      // Rollback group creation
      await supabase.from('groups').delete().eq('id', group.id)
      throw memberError
    }

    console.log(`✅ Group created: ${group.id}`)
    return group
  } catch (error) {
    console.error('❌ Create group error:', error)
    throw error
  }
}

/**
 * Get group by ID with full details
 * @param {string} groupId - Group ID
 * @param {string} [userId] - Optional user ID to include membership status
 * @returns {Promise<Object>} Group details
 */
export const getGroupById = async (groupId, userId = null) => {
  try {
    const { data: group, error } = await supabase
      .from('groups')
      .select(`
        *,
        creator:users!groups_creator_id_fkey (
          id,
          username,
          full_name,
          profile_photo_url
        )
      `)
      .eq('id', groupId)
      .single()

    if (error) {
      throw error
    }

    // If userId provided, get user's membership status
    if (userId) {
      const { data: membership } = await supabase
        .from('group_members')
        .select('role, status')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .single()

      group.user_membership = membership || null
    }

    return group
  } catch (error) {
    console.error('❌ Get group error:', error)
    throw error
  }
}

/**
 * Get user's groups
 * @param {string} userId - User ID
 * @param {string} [status] - Filter by membership status (default: 'active')
 * @returns {Promise<Array>} User's groups
 */
export const getUserGroups = async (userId, status = 'active') => {
  try {
    console.log(`📋 Fetching groups for user ${userId}`)

    const { data: memberships, error } = await supabase
      .from('group_members')
      .select(`
        role,
        status,
        joined_at,
        group:groups (
          *,
          creator:users!groups_creator_id_fkey (
            id,
            username,
            full_name,
            profile_photo_url
          )
        )
      `)
      .eq('user_id', userId)
      .eq('status', status)
      .order('joined_at', { ascending: false })

    if (error) {
      throw error
    }

    const groups = memberships.map(m => ({
      ...m.group,
      user_role: m.role,
      user_status: m.status,
      joined_at: m.joined_at
    }))

    console.log(`✅ Found ${groups.length} groups`)
    return groups
  } catch (error) {
    console.error('❌ Get user groups error:', error)
    throw error
  }
}

/**
 * Invite user to group
 * @param {string} groupId - Group ID
 * @param {string} userId - User ID to invite
 * @param {string} inviterId - User ID of inviter
 * @returns {Promise<Object>} Created membership record
 */
export const inviteToGroup = async (groupId, userId, inviterId) => {
  try {
    console.log(`✉️ Inviting user ${userId} to group ${groupId}`)

    // Check if inviter has permission (admin or moderator)
    const { data: inviterMembership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', inviterId)
      .single()

    if (!inviterMembership || !['admin', 'moderator'].includes(inviterMembership.role)) {
      throw new Error('No permission to invite members')
    }

    // Check if user is already a member or invited
    const { data: existing } = await supabase
      .from('group_members')
      .select('id, status')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single()

    if (existing) {
      if (existing.status === 'active') {
        throw new Error('User is already a member')
      } else if (existing.status === 'invited') {
        throw new Error('User is already invited')
      }
    }

    // Create invitation
    const { data: membership, error } = await supabase
      .from('group_members')
      .insert({
        group_id: groupId,
        user_id: userId,
        role: 'member',
        status: 'invited',
        invited_by: inviterId
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    console.log(`✅ Invitation sent to user ${userId}`)
    return membership
  } catch (error) {
    console.error('❌ Invite to group error:', error)
    throw error
  }
}

/**
 * Join or request to join a group
 * @param {string} groupId - Group ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Created or updated membership record
 */
export const joinGroup = async (groupId, userId) => {
  try {
    console.log(`🚪 User ${userId} joining group ${groupId}`)

    // Get group details
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('join_type, member_count')
      .eq('id', groupId)
      .single()

    if (groupError || !group) {
      throw new Error('Group not found')
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from('group_members')
      .select('id, status')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single()

    if (existing) {
      if (existing.status === 'active') {
        throw new Error('Already a member of this group')
      } else if (existing.status === 'invited') {
        // Accept invitation
        const { data: membership, error } = await supabase
          .from('group_members')
          .update({ status: 'active', joined_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single()

        if (error) throw error

        // Increment member count
        await supabase
          .from('groups')
          .update({ member_count: group.member_count + 1 })
          .eq('id', groupId)

        console.log(`✅ User ${userId} accepted invitation to group ${groupId}`)
        return membership
      } else if (existing.status === 'requested') {
        throw new Error('Join request already pending')
      }
    }

    // Determine status based on join type
    const status = group.join_type === 'open' ? 'active' : 'requested'

    // Create membership
    const { data: membership, error } = await supabase
      .from('group_members')
      .insert({
        group_id: groupId,
        user_id: userId,
        role: 'member',
        status
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    // If open group, increment member count
    if (status === 'active') {
      await supabase
        .from('groups')
        .update({ member_count: group.member_count + 1 })
        .eq('id', groupId)
    }

    console.log(`✅ User ${userId} ${status === 'active' ? 'joined' : 'requested to join'} group ${groupId}`)
    return membership
  } catch (error) {
    console.error('❌ Join group error:', error)
    throw error
  }
}

/**
 * Leave a group
 * @param {string} groupId - Group ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success status
 */
export const leaveGroup = async (groupId, userId) => {
  try {
    console.log(`🚪 User ${userId} leaving group ${groupId}`)

    // Check if user is the creator
    const { data: group } = await supabase
      .from('groups')
      .select('creator_id, member_count')
      .eq('id', groupId)
      .single()

    if (group && group.creator_id === userId) {
      throw new Error('Group creator cannot leave. Transfer ownership or delete the group.')
    }

    // Update membership status
    const { error } = await supabase
      .from('group_members')
      .update({ status: 'left' })
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .eq('status', 'active')

    if (error) {
      throw error
    }

    // Decrement member count
    if (group) {
      await supabase
        .from('groups')
        .update({ member_count: Math.max(0, group.member_count - 1) })
        .eq('id', groupId)
    }

    console.log(`✅ User ${userId} left group ${groupId}`)
    return true
  } catch (error) {
    console.error('❌ Leave group error:', error)
    throw error
  }
}

/**
 * Remove member from group (admin only)
 * @param {string} groupId - Group ID
 * @param {string} memberId - Member user ID to remove
 * @param {string} adminId - Admin user ID performing the action
 * @returns {Promise<boolean>} Success status
 */
export const removeMember = async (groupId, memberId, adminId) => {
  try {
    console.log(`🚫 Admin ${adminId} removing member ${memberId} from group ${groupId}`)

    // Check if admin has permission
    const { data: adminMembership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', adminId)
      .single()

    if (!adminMembership || adminMembership.role !== 'admin') {
      throw new Error('Only admins can remove members')
    }

    // Cannot remove self
    if (adminId === memberId) {
      throw new Error('Cannot remove yourself')
    }

    // Update membership status
    const { error } = await supabase
      .from('group_members')
      .update({ status: 'removed' })
      .eq('group_id', groupId)
      .eq('user_id', memberId)
      .eq('status', 'active')

    if (error) {
      throw error
    }

    // Decrement member count
    const { data: group } = await supabase
      .from('groups')
      .select('member_count')
      .eq('id', groupId)
      .single()

    if (group) {
      await supabase
        .from('groups')
        .update({ member_count: Math.max(0, group.member_count - 1) })
        .eq('id', groupId)
    }

    console.log(`✅ Member ${memberId} removed from group ${groupId}`)
    return true
  } catch (error) {
    console.error('❌ Remove member error:', error)
    throw error
  }
}

/**
 * Get group members
 * @param {string} groupId - Group ID
 * @param {string} [status] - Filter by status (default: 'active')
 * @returns {Promise<Array>} Group members with user details
 */
export const getGroupMembers = async (groupId, status = 'active') => {
  try {
    console.log(`👥 Fetching members for group ${groupId}`)

    const { data: members, error } = await supabase
      .from('group_members')
      .select(`
        id,
        role,
        status,
        joined_at,
        user:users!group_members_user_id_fkey (
          id,
          username,
          full_name,
          profile_photo_url
        )
      `)
      .eq('group_id', groupId)
      .eq('status', status)
      .order('joined_at', { ascending: true })

    if (error) {
      throw error
    }

    console.log(`✅ Found ${members.length} members`)
    return members
  } catch (error) {
    console.error('❌ Get group members error:', error)
    throw error
  }
}

/**
 * Update group details
 * @param {string} groupId - Group ID
 * @param {Object} updates - Group updates
 * @param {string} userId - User ID performing the update
 * @returns {Promise<Object>} Updated group
 */
export const updateGroup = async (groupId, updates, userId) => {
  try {
    console.log(`✏️ Updating group ${groupId}`)

    // Check if user has permission (admin only)
    const { data: membership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single()

    if (!membership || membership.role !== 'admin') {
      throw new Error('Only admins can update group details')
    }

    // Update group
    const { data: group, error } = await supabase
      .from('groups')
      .update(updates)
      .eq('id', groupId)
      .select()
      .single()

    if (error) {
      throw error
    }

    console.log(`✅ Group ${groupId} updated`)
    return group
  } catch (error) {
    console.error('❌ Update group error:', error)
    throw error
  }
}

/**
 * Delete group (admin only)
 * @param {string} groupId - Group ID
 * @param {string} userId - User ID performing the deletion
 * @returns {Promise<boolean>} Success status
 */
export const deleteGroup = async (groupId, userId) => {
  try {
    console.log(`🗑️ Deleting group ${groupId}`)

    // Check if user is the creator
    const { data: group } = await supabase
      .from('groups')
      .select('creator_id')
      .eq('id', groupId)
      .single()

    if (!group || group.creator_id !== userId) {
      throw new Error('Only the creator can delete the group')
    }

    // Delete group (cascades to members and challenges)
    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', groupId)

    if (error) {
      throw error
    }

    console.log(`✅ Group ${groupId} deleted`)
    return true
  } catch (error) {
    console.error('❌ Delete group error:', error)
    throw error
  }
}

/**
 * Approve join request (admin/moderator only)
 * @param {string} groupId - Group ID
 * @param {string} requesterId - User ID who requested to join
 * @param {string} approverId - Admin/moderator user ID approving the request
 * @returns {Promise<Object>} Updated membership
 */
export const approveJoinRequest = async (groupId, requesterId, approverId) => {
  try {
    console.log(`✅ Approving join request for user ${requesterId}`)

    // Check if approver has permission
    const { data: approverMembership } = await supabase
      .from('group_members')
      .select('role')
      .eq('group_id', groupId)
      .eq('user_id', approverId)
      .single()

    if (!approverMembership || !['admin', 'moderator'].includes(approverMembership.role)) {
      throw new Error('No permission to approve join requests')
    }

    // Update membership status
    const { data: membership, error } = await supabase
      .from('group_members')
      .update({ status: 'active', joined_at: new Date().toISOString() })
      .eq('group_id', groupId)
      .eq('user_id', requesterId)
      .eq('status', 'requested')
      .select()
      .single()

    if (error) {
      throw error
    }

    // Increment member count
    const { data: group } = await supabase
      .from('groups')
      .select('member_count')
      .eq('id', groupId)
      .single()

    if (group) {
      await supabase
        .from('groups')
        .update({ member_count: group.member_count + 1 })
        .eq('id', groupId)
    }

    console.log(`✅ Join request approved for user ${requesterId}`)
    return membership
  } catch (error) {
    console.error('❌ Approve join request error:', error)
    throw error
  }
}

// =============================================================================
// Browse / discovery
// =============================================================================

/**
 * List public groups for the Browse screen, optionally filtered by category.
 * Cursor-paginated on member_count (DESC) then id (for stable tie-break).
 */
export const listPublicGroups = async ({ category = null, cursor = null, limit = 20 } = {}) => {
  let query = supabase
    .from('groups')
    .select(`
      id, name, description, avatar_url, privacy, join_type, category,
      member_count, post_count, created_at,
      creator:users!groups_creator_id_fkey (id, username, full_name, profile_photo_url)
    `)
    .eq('privacy', 'public')
    .order('member_count', { ascending: false })
    .order('id', { ascending: true })
    .limit(limit + 1)

  if (category && VALID_CATEGORIES.includes(category)) {
    query = query.eq('category', category)
  }

  if (cursor) {
    // Cursor is a base64 of `${member_count}|${id}` for stable paging
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8')
      const [mcStr, lastId] = decoded.split('|')
      const mc = Number(mcStr)
      if (Number.isFinite(mc) && lastId) {
        // (member_count, id) < (mc, lastId)
        // express as: member_count < mc OR (member_count = mc AND id > lastId)
        query = query.or(`member_count.lt.${mc},and(member_count.eq.${mc},id.gt.${lastId})`)
      }
    } catch {}
  }

  const { data, error } = await query
  if (error) throw error

  const rows = data || []
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  let nextCursor = null
  if (hasMore && slice.length > 0) {
    const last = slice[slice.length - 1]
    nextCursor = Buffer.from(`${last.member_count}|${last.id}`).toString('base64')
  }

  return { groups: slice, nextCursor }
}

/**
 * Look up a group by its invite_code. Returns null if not found.
 * Does NOT enforce membership — used by the join landing screen.
 */
export const getGroupByInviteCode = async (code) => {
  if (!code) return null
  const upper = String(code).toUpperCase().trim()
  const { data, error } = await supabase
    .from('groups')
    .select(`
      id, name, description, avatar_url, privacy, join_type, category,
      member_count, post_count, invite_code, created_at,
      creator:users!groups_creator_id_fkey (id, username, full_name, profile_photo_url)
    `)
    .eq('invite_code', upper)
    .maybeSingle()
  if (error) {
    console.error('❌ getGroupByInviteCode:', error)
    return null
  }
  return data
}

/**
 * Join (or request to join) a group via invite_code. Delegates to joinGroup
 * once the group id is resolved.
 */
export const joinByInviteCode = async (code, userId) => {
  const group = await getGroupByInviteCode(code)
  if (!group) {
    throw new Error('Invite code not found')
  }
  return await joinGroup(group.id, userId)
}

// =============================================================================
// Category-aware feed
// =============================================================================

const normalizeAuthor = (u) =>
  u
    ? {
        id: u.id,
        username: u.username,
        full_name: u.full_name,
        profile_photo_url: u.profile_photo_url,
      }
    : null

const queryDailyStepsFeed = async (memberIds, cursor, limit) => {
  let query = supabase
    .from('daily_steps')
    .select('id, date, step_count, user_id, user:users (id, username, full_name, profile_photo_url)')
    .in('user_id', memberIds)
    .order('date', { ascending: false })
    .limit(limit + 1)
  if (cursor) query = query.lt('date', cursor)
  const { data, error } = await query
  if (error) throw error
  const rows = data || []
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  return {
    items: slice.map((r) => ({
      type: 'steps',
      id: r.id,
      timestamp: r.date,
      step_count: r.step_count,
      author: normalizeAuthor(r.user),
    })),
    nextCursor: hasMore ? slice[slice.length - 1].date : null,
  }
}

const queryRunsFeed = async (memberIds, cursor, limit) => {
  let query = supabase
    .from('runs')
    .select(
      'id, started_at, distance_meters, duration_seconds, activity_type, calories_burned, user_id, ' +
        'user:users (id, username, full_name, profile_photo_url)'
    )
    .in('user_id', memberIds)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(limit + 1)
  if (cursor) query = query.lt('started_at', cursor)
  const { data, error } = await query
  if (error) throw error
  const rows = data || []
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  return {
    items: slice.map((r) => ({
      type: 'run',
      id: r.id,
      timestamp: r.started_at,
      distance_meters: r.distance_meters,
      duration_seconds: r.duration_seconds,
      activity_type: r.activity_type || 'run',
      calories_burned: r.calories_burned,
      author: normalizeAuthor(r.user),
    })),
    nextCursor: hasMore ? slice[slice.length - 1].started_at : null,
  }
}

const queryWorkoutCompletionsFeed = async (memberIds, cursor, limit) => {
  let query = supabase
    .from('workout_completions')
    .select(
      'id, completed_at, duration_minutes, difficulty_rating, user_id, ' +
        'daily_workouts(workout_name, focus_area), ' +
        'user:users (id, username, full_name, profile_photo_url)'
    )
    .in('user_id', memberIds)
    .order('completed_at', { ascending: false })
    .limit(limit + 1)
  if (cursor) query = query.lt('completed_at', cursor)
  const { data, error } = await query
  if (error) throw error
  const rows = data || []
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  return {
    items: slice.map((r) => ({
      type: 'workout',
      id: r.id,
      timestamp: r.completed_at,
      duration_minutes: r.duration_minutes,
      workout_name: r.daily_workouts?.workout_name || 'Workout',
      focus_area: r.daily_workouts?.focus_area || null,
      author: normalizeAuthor(r.user),
    })),
    nextCursor: hasMore ? slice[slice.length - 1].completed_at : null,
  }
}

const queryFoodLogsFeed = async (memberIds, cursor, limit) => {
  let query = supabase
    .from('food_logs')
    .select(
      'id, logged_at, food_name, calories, meal_type, image_url, user_id, ' +
        'user:users (id, username, full_name, profile_photo_url)'
    )
    .in('user_id', memberIds)
    .order('logged_at', { ascending: false })
    .limit(limit + 1)
  if (cursor) query = query.lt('logged_at', cursor)
  const { data, error } = await query
  if (error) throw error
  const rows = data || []
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  return {
    items: slice.map((r) => ({
      type: 'food',
      id: r.id,
      timestamp: r.logged_at,
      food_name: r.food_name,
      calories: r.calories,
      meal_type: r.meal_type,
      image_url: r.image_url,
      author: normalizeAuthor(r.user),
    })),
    nextCursor: hasMore ? slice[slice.length - 1].logged_at : null,
  }
}

const queryPostsFeed = async (memberIds, cursor, limit) => {
  let query = supabase
    .from('posts')
    .select(
      `id, user_id, caption, image_urls, image_url, stats, visibility, created_at,
       user:users (id, username, full_name, profile_photo_url),
       workout_completion:workout_completions (id, duration_minutes)`
    )
    .in('user_id', memberIds)
    .order('created_at', { ascending: false })
    .limit(limit + 1)
  if (cursor) query = query.lt('created_at', cursor)
  const { data, error } = await query
  if (error) throw error
  const rows = data || []
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  return {
    items: slice.map((p) => ({
      type: 'post',
      id: p.id,
      timestamp: p.created_at,
      caption: p.caption,
      image_urls: p.image_urls || (p.image_url ? [p.image_url] : []),
      stats: p.stats,
      workout_completion: p.workout_completion || null,
      author: normalizeAuthor(p.user),
    })),
    nextCursor: hasMore ? slice[slice.length - 1].created_at : null,
  }
}

/**
 * Category-aware group feed. Returns { items, nextCursor } where each item
 * has a `type` discriminator and a normalized `author` block.
 */
export const getGroupFeed = async (groupId, { cursor = null, limit = 20 } = {}) => {
  // Resolve group + member ids
  const { data: group, error: groupErr } = await supabase
    .from('groups')
    .select('id, category')
    .eq('id', groupId)
    .single()
  if (groupErr || !group) {
    return { items: [], nextCursor: null }
  }

  const members = await getGroupMembers(groupId, 'active')
  const memberIds = members.map((m) => m.user.id)
  if (memberIds.length === 0) return { items: [], nextCursor: null }

  const cappedLimit = Math.min(parseInt(limit) || 20, 50)

  switch (group.category) {
    case 'steps':
      return queryDailyStepsFeed(memberIds, cursor, cappedLimit)
    case 'running':
      return queryRunsFeed(memberIds, cursor, cappedLimit)
    case 'workouts':
      return queryWorkoutCompletionsFeed(memberIds, cursor, cappedLimit)
    case 'nutrition':
      return queryFoodLogsFeed(memberIds, cursor, cappedLimit)
    default:
      return queryPostsFeed(memberIds, cursor, cappedLimit)
  }
}

// =============================================================================
// Leaderboard
// =============================================================================

/**
 * Calendar-aligned period cutoffs (all in UTC).
 *   today → 00:00 UTC of the current calendar day
 *   week  → Monday 00:00 UTC of the current ISO week
 *   month → 1st of the current calendar month, 00:00 UTC
 *   all   → null (no cutoff)
 */
const startOfDayUtc = (date = new Date()) => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

const startOfIsoWeekUtc = (date = new Date()) => {
  const d = startOfDayUtc(date)
  const dow = d.getUTCDay() // Sun=0, Mon=1, ..., Sat=6
  const diff = (dow + 6) % 7 // days since Monday
  d.setUTCDate(d.getUTCDate() - diff)
  return d
}

const startOfMonthUtc = (date = new Date()) => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

// Cutoff for timestamp columns (started_at, completed_at, logged_at)
const periodToCutoff = (period) => {
  if (period === 'all') return null
  if (period === 'month') return startOfMonthUtc().toISOString()
  if (period === 'today') return startOfDayUtc().toISOString()
  return startOfIsoWeekUtc().toISOString()
}

// Cutoff for the daily_steps.date column (YYYY-MM-DD)
const periodToDateCutoff = (period) => {
  if (period === 'all') return null
  if (period === 'month') return startOfMonthUtc().toISOString().slice(0, 10)
  if (period === 'today') return startOfDayUtc().toISOString().slice(0, 10)
  return startOfIsoWeekUtc().toISOString().slice(0, 10)
}

const aggregateStepsLeaderboard = async (memberIds, period) => {
  let query = supabase
    .from('daily_steps')
    .select('user_id, step_count, date')
    .in('user_id', memberIds)
  const cutoff = periodToDateCutoff(period)
  if (cutoff) query = query.gte('date', cutoff)
  const { data, error } = await query
  if (error) throw error
  const sums = {}
  for (const r of data || []) {
    sums[r.user_id] = (sums[r.user_id] || 0) + (r.step_count || 0)
  }
  return sums
}

const aggregateRunningLeaderboard = async (memberIds, period) => {
  let query = supabase
    .from('runs')
    .select('user_id, distance_meters, started_at, activity_type, status')
    .in('user_id', memberIds)
    .eq('status', 'completed')
  const cutoff = periodToCutoff(period)
  if (cutoff) query = query.gte('started_at', cutoff)
  const { data, error } = await query
  if (error) throw error
  const sums = {}
  for (const r of data || []) {
    if ((r.activity_type || 'run') !== 'run') continue
    sums[r.user_id] = (sums[r.user_id] || 0) + (r.distance_meters || 0)
  }
  return sums
}

const aggregateWorkoutsLeaderboard = async (memberIds, period) => {
  let query = supabase
    .from('workout_completions')
    .select('user_id, completed_at')
    .in('user_id', memberIds)
  const cutoff = periodToCutoff(period)
  if (cutoff) query = query.gte('completed_at', cutoff)
  const { data, error } = await query
  if (error) throw error
  const counts = {}
  for (const r of data || []) {
    counts[r.user_id] = (counts[r.user_id] || 0) + 1
  }
  return counts
}

const aggregateNutritionLeaderboard = async (memberIds, period) => {
  let query = supabase
    .from('food_logs')
    .select('user_id, logged_at')
    .in('user_id', memberIds)
  const cutoff = periodToCutoff(period)
  if (cutoff) query = query.gte('logged_at', cutoff)
  const { data, error } = await query
  if (error) throw error
  // Days-with-log per user — more meaningful than raw log count
  const dayMap = {}
  for (const r of data || []) {
    if (!dayMap[r.user_id]) dayMap[r.user_id] = new Set()
    dayMap[r.user_id].add(String(r.logged_at).slice(0, 10))
  }
  const counts = {}
  for (const [uid, daySet] of Object.entries(dayMap)) {
    counts[uid] = daySet.size
  }
  return counts
}

/**
 * Category-aware leaderboard. Returns up to 50 ranked members.
 * Period: 'week' | 'month' | 'all' (default 'week').
 */
export const getGroupLeaderboard = async (groupId, { period = 'week' } = {}) => {
  const { data: group, error: groupErr } = await supabase
    .from('groups')
    .select('id, category')
    .eq('id', groupId)
    .single()
  if (groupErr || !group) {
    return { entries: [], metric: null, period }
  }

  const members = await getGroupMembers(groupId, 'active')
  const memberIds = members.map((m) => m.user.id)
  if (memberIds.length === 0) {
    return { entries: [], metric: null, period }
  }

  let aggregate
  let metric
  switch (group.category) {
    case 'steps':
      aggregate = await aggregateStepsLeaderboard(memberIds, period)
      metric = 'steps'
      break
    case 'running':
      aggregate = await aggregateRunningLeaderboard(memberIds, period)
      metric = 'distance_meters'
      break
    case 'workouts':
      aggregate = await aggregateWorkoutsLeaderboard(memberIds, period)
      metric = 'workouts'
      break
    case 'nutrition':
      aggregate = await aggregateNutritionLeaderboard(memberIds, period)
      metric = 'days_logged'
      break
    default:
      // No leaderboard for general groups — return zero entries with a marker
      return { entries: [], metric: null, period }
  }

  // Build entries; include all members so zero-activity users still appear
  const memberById = new Map()
  for (const m of members) memberById.set(m.user.id, m.user)

  const entries = []
  for (const userId of memberIds) {
    const value = aggregate[userId] || 0
    const u = memberById.get(userId)
    entries.push({
      user_id: userId,
      username: u?.username || 'Unknown',
      full_name: u?.full_name || '',
      avatar_url: u?.profile_photo_url || null,
      value,
    })
  }

  entries.sort((a, b) => b.value - a.value)
  const top = entries.slice(0, 50).map((e, i) => ({ rank: i + 1, ...e }))

  return { entries: top, metric, period }
}

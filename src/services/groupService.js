import { supabase } from '../config/supabase.js'

/**
 * Group Service
 * Service for managing groups, members, and group interactions
 */

/**
 * Create a new group
 * @param {Object} groupData - Group data
 * @param {string} creatorId - Creator user ID
 * @returns {Promise<Object>} Created group with creator as admin member
 */
export const createGroup = async (groupData, creatorId) => {
  try {
    console.log(`👥 Creating new group: ${groupData.name}`)

    // Create group
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert({
        ...groupData,
        creator_id: creatorId,
        member_count: 1
      })
      .select()
      .single()

    if (groupError) {
      throw groupError
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
        user:users (
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

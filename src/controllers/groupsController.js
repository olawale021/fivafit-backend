import {
  createGroup,
  getGroupById,
  getUserGroups,
  inviteToGroup,
  joinGroup,
  leaveGroup,
  removeMember,
  getGroupMembers,
  updateGroup,
  deleteGroup,
  approveJoinRequest
} from '../services/groupService.js'
import { supabase } from '../config/supabase.js'

/**
 * Get user's groups
 * GET /api/groups
 * Query params: status (optional, default: 'active')
 */
export const getMyGroups = async (req, res) => {
  try {
    const userId = req.user.id
    const { status } = req.query

    const groups = await getUserGroups(userId, status || 'active')

    res.json({
      success: true,
      data: groups
    })
  } catch (error) {
    console.error('❌ Get groups error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch groups',
      message: error.message
    })
  }
}

/**
 * Get group by ID
 * GET /api/groups/:id
 */
export const getGroup = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const group = await getGroupById(id, userId)

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found'
      })
    }

    res.json({
      success: true,
      data: group
    })
  } catch (error) {
    console.error('❌ Get group error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch group',
      message: error.message
    })
  }
}

/**
 * Create a new group
 * POST /api/groups
 * Body: { name, description, avatar_url, privacy, join_type }
 */
export const create = async (req, res) => {
  try {
    const userId = req.user.id
    const { name, description, avatar_url, privacy, join_type } = req.body

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Group name is required'
      })
    }

    // Validate privacy
    if (privacy && !['private', 'public'].includes(privacy)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid privacy setting'
      })
    }

    // Validate join_type
    if (join_type && !['invite', 'request', 'open'].includes(join_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid join type'
      })
    }

    const groupData = {
      name,
      description: description || null,
      avatar_url: avatar_url || null,
      privacy: privacy || 'private',
      join_type: join_type || 'invite'
    }

    const group = await createGroup(groupData, userId)

    res.status(201).json({
      success: true,
      data: group,
      message: 'Group created successfully'
    })
  } catch (error) {
    console.error('❌ Create group error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to create group',
      message: error.message
    })
  }
}

/**
 * Update group details
 * PUT /api/groups/:id
 * Body: { name, description, avatar_url, privacy, join_type }
 */
export const update = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id
    const updates = req.body

    // Validate privacy
    if (updates.privacy && !['private', 'public'].includes(updates.privacy)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid privacy setting'
      })
    }

    // Validate join_type
    if (updates.join_type && !['invite', 'request', 'open'].includes(updates.join_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid join type'
      })
    }

    const group = await updateGroup(id, updates, userId)

    res.json({
      success: true,
      data: group,
      message: 'Group updated successfully'
    })
  } catch (error) {
    console.error('❌ Update group error:', error)

    const statusCode = error.message.includes('permission') ? 403 : 500

    res.status(statusCode).json({
      success: false,
      error: error.message
    })
  }
}

/**
 * Delete group
 * DELETE /api/groups/:id
 */
export const deleteGroupById = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    await deleteGroup(id, userId)

    res.json({
      success: true,
      message: 'Group deleted successfully'
    })
  } catch (error) {
    console.error('❌ Delete group error:', error)

    const statusCode = error.message.includes('creator') ? 403 : 500

    res.status(statusCode).json({
      success: false,
      error: error.message
    })
  }
}

/**
 * Invite user to group
 * POST /api/groups/:id/invite
 * Body: { userId }
 */
export const invite = async (req, res) => {
  try {
    const { id } = req.params
    const inviterId = req.user.id
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      })
    }

    const membership = await inviteToGroup(id, userId, inviterId)

    res.status(201).json({
      success: true,
      data: membership,
      message: 'Invitation sent successfully'
    })
  } catch (error) {
    console.error('❌ Invite user error:', error)

    const statusCode = error.message.includes('permission') ? 403 :
                      error.message.includes('already') ? 409 :
                      500

    res.status(statusCode).json({
      success: false,
      error: error.message
    })
  }
}

/**
 * Join or request to join group
 * POST /api/groups/:id/join
 */
export const join = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const membership = await joinGroup(id, userId)

    const message = membership.status === 'active' ?
                   'Successfully joined group' :
                   'Join request sent successfully'

    res.status(201).json({
      success: true,
      data: membership,
      message
    })
  } catch (error) {
    console.error('❌ Join group error:', error)

    const statusCode = error.message.includes('not found') ? 404 :
                      error.message.includes('already') ? 409 :
                      500

    res.status(statusCode).json({
      success: false,
      error: error.message
    })
  }
}

/**
 * Leave group
 * DELETE /api/groups/:id/leave
 */
export const leave = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    await leaveGroup(id, userId)

    res.json({
      success: true,
      message: 'Successfully left group'
    })
  } catch (error) {
    console.error('❌ Leave group error:', error)

    const statusCode = error.message.includes('creator') ? 403 : 500

    res.status(statusCode).json({
      success: false,
      error: error.message
    })
  }
}

/**
 * Remove member from group (admin only)
 * DELETE /api/groups/:id/members/:userId
 */
export const removeMemberFromGroup = async (req, res) => {
  try {
    const { id, userId } = req.params
    const adminId = req.user.id

    await removeMember(id, userId, adminId)

    res.json({
      success: true,
      message: 'Member removed successfully'
    })
  } catch (error) {
    console.error('❌ Remove member error:', error)

    const statusCode = error.message.includes('permission') || error.message.includes('Only admins') ? 403 :
                      error.message.includes('Cannot remove') ? 400 :
                      500

    res.status(statusCode).json({
      success: false,
      error: error.message
    })
  }
}

/**
 * Get group members
 * GET /api/groups/:id/members
 * Query params: status (optional, default: 'active')
 */
export const getMembers = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.query

    const members = await getGroupMembers(id, status || 'active')

    res.json({
      success: true,
      data: members
    })
  } catch (error) {
    console.error('❌ Get members error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch members',
      message: error.message
    })
  }
}

/**
 * Get group feed (posts from group members)
 * GET /api/groups/:id/feed
 * Query params: limit, cursor
 */
export const getGroupFeed = async (req, res) => {
  try {
    const { id } = req.params
    const { limit = 20, cursor } = req.query

    // Get group member IDs
    const members = await getGroupMembers(id, 'active')
    const memberIds = members.map(m => m.user.id)

    if (memberIds.length === 0) {
      return res.json({
        success: true,
        data: {
          posts: [],
          nextCursor: null
        }
      })
    }

    // Fetch posts from group members
    let query = supabase
      .from('posts')
      .select(`
        *,
        user:users (
          id,
          username,
          full_name,
          profile_photo_url
        ),
        workout_completion:workout_completions (
          id,
          duration_minutes,
          calories_burned,
          difficulty
        ),
        like_count,
        comment_count,
        save_count
      `)
      .in('user_id', memberIds)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit) + 1)

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: posts, error } = await query

    if (error) {
      throw error
    }

    // Check if there are more posts
    const hasMore = posts.length > parseInt(limit)
    const postsToReturn = hasMore ? posts.slice(0, parseInt(limit)) : posts
    const nextCursor = hasMore ? postsToReturn[postsToReturn.length - 1].created_at : null

    res.json({
      success: true,
      data: {
        posts: postsToReturn,
        nextCursor
      }
    })
  } catch (error) {
    console.error('❌ Get group feed error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch group feed',
      message: error.message
    })
  }
}

/**
 * Get group challenges
 * GET /api/groups/:id/challenges
 */
export const getGroupChallenges = async (req, res) => {
  try {
    const { id } = req.params

    const { data: challenges, error } = await supabase
      .from('challenges')
      .select(`
        *,
        creator:users!challenges_creator_id_fkey (
          id,
          username,
          full_name,
          profile_photo_url
        )
      `)
      .eq('group_id', id)
      .gte('end_date', new Date().toISOString())
      .order('start_date', { ascending: true })

    if (error) {
      throw error
    }

    res.json({
      success: true,
      data: challenges
    })
  } catch (error) {
    console.error('❌ Get group challenges error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch group challenges',
      message: error.message
    })
  }
}

/**
 * Approve join request (admin/moderator only)
 * POST /api/groups/:id/approve/:userId
 */
export const approveJoin = async (req, res) => {
  try {
    const { id, userId } = req.params
    const approverId = req.user.id

    const membership = await approveJoinRequest(id, userId, approverId)

    res.json({
      success: true,
      data: membership,
      message: 'Join request approved successfully'
    })
  } catch (error) {
    console.error('❌ Approve join error:', error)

    const statusCode = error.message.includes('permission') ? 403 : 500

    res.status(statusCode).json({
      success: false,
      error: error.message
    })
  }
}

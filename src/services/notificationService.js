import { supabase } from '../config/supabase.js'

/**
 * Notification Service
 * Centralized service for creating and managing notifications
 */

/**
 * Create a notification and increment unread count
 * @param {Object} params - Notification parameters
 * @param {string} params.userId - Recipient user ID
 * @param {string} params.actorId - User who performed the action
 * @param {string} params.type - Notification type: 'like', 'comment', 'reply', 'follow'
 * @param {string} [params.postId] - Post ID (for like, comment notifications)
 * @param {string} [params.commentId] - Comment ID (for reply notifications)
 * @returns {Promise<Object>} Created notification or null if error
 */
export const createNotification = async ({ userId, actorId, type, postId, commentId }) => {
  try {
    // Don't create notification if user is performing action on their own content
    if (userId === actorId) {
      console.log(`⏭️ Skipping notification - user ${actorId} performed action on own content`)
      return null
    }

    console.log(`📬 Creating ${type} notification for user ${userId} from actor ${actorId}`)

    // Create notification
    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        actor_id: actorId,
        type,
        post_id: postId || null,
        comment_id: commentId || null
      })
      .select()
      .single()

    if (notificationError) {
      console.error('❌ Failed to create notification:', notificationError)
      throw notificationError
    }

    // Increment unread count
    await supabase.rpc('increment_unread_notifications', {
      user_id_param: userId
    })

    console.log(`✅ Notification created successfully: ${notification.id}`)
    return notification
  } catch (error) {
    console.error('❌ Create notification error:', error)
    // Don't throw - notifications shouldn't break the main flow
    return null
  }
}

/**
 * Create a like notification
 * @param {string} postOwnerId - Post owner user ID
 * @param {string} likerId - User who liked the post
 * @param {string} postId - Post ID
 * @returns {Promise<Object>} Created notification or null
 */
export const createLikeNotification = async (postOwnerId, likerId, postId) => {
  return createNotification({
    userId: postOwnerId,
    actorId: likerId,
    type: 'like',
    postId
  })
}

/**
 * Create a comment notification
 * @param {string} postOwnerId - Post owner user ID
 * @param {string} commenterId - User who commented
 * @param {string} postId - Post ID
 * @param {string} commentId - Comment ID
 * @returns {Promise<Object>} Created notification or null
 */
export const createCommentNotification = async (postOwnerId, commenterId, postId, commentId) => {
  return createNotification({
    userId: postOwnerId,
    actorId: commenterId,
    type: 'comment',
    postId,
    commentId
  })
}

/**
 * Create a reply notification
 * @param {string} parentCommentOwnerId - Parent comment owner user ID
 * @param {string} replierId - User who replied
 * @param {string} postId - Post ID
 * @param {string} replyId - Reply comment ID
 * @returns {Promise<Object>} Created notification or null
 */
export const createReplyNotification = async (parentCommentOwnerId, replierId, postId, replyId) => {
  return createNotification({
    userId: parentCommentOwnerId,
    actorId: replierId,
    type: 'reply',
    postId,
    commentId: replyId
  })
}

/**
 * Create a follow notification
 * @param {string} followedUserId - User who was followed
 * @param {string} followerId - User who followed
 * @returns {Promise<Object>} Created notification or null
 */
export const createFollowNotification = async (followedUserId, followerId) => {
  return createNotification({
    userId: followedUserId,
    actorId: followerId,
    type: 'follow'
  })
}

/**
 * Mark multiple notifications as read
 * @param {string[]} notificationIds - Array of notification IDs
 * @param {string} userId - User ID (for verification)
 * @returns {Promise<boolean>} Success status
 */
export const markNotificationsAsRead = async (notificationIds, userId) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .in('id', notificationIds)
      .eq('user_id', userId)

    if (error) throw error

    // Decrement unread count for each notification
    for (let i = 0; i < notificationIds.length; i++) {
      await supabase.rpc('decrement_unread_notifications', {
        user_id_param: userId
      })
    }

    return true
  } catch (error) {
    console.error('❌ Mark notifications as read error:', error)
    return false
  }
}

/**
 * Delete notifications related to an action (e.g., when unliking a post)
 * @param {Object} params - Delete parameters
 * @param {string} params.actorId - User who performed the original action
 * @param {string} params.type - Notification type
 * @param {string} [params.postId] - Post ID
 * @param {string} [params.commentId] - Comment ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteNotification = async ({ actorId, type, postId, commentId }) => {
  try {
    console.log(`🗑️ Deleting ${type} notification from actor ${actorId}`)

    let query = supabase
      .from('notifications')
      .delete()
      .eq('actor_id', actorId)
      .eq('type', type)

    if (postId) {
      query = query.eq('post_id', postId)
    }

    if (commentId) {
      query = query.eq('comment_id', commentId)
    }

    // Get notifications before deleting to decrement unread count
    const { data: notifications } = await supabase
      .from('notifications')
      .select('user_id, is_read')
      .eq('actor_id', actorId)
      .eq('type', type)
      .eq('post_id', postId || null)

    const { error } = await query

    if (error) throw error

    // Decrement unread count for unread notifications
    if (notifications && notifications.length > 0) {
      for (const notification of notifications) {
        if (!notification.is_read) {
          await supabase.rpc('decrement_unread_notifications', {
            user_id_param: notification.user_id
          })
        }
      }
    }

    console.log(`✅ Notification deleted successfully`)
    return true
  } catch (error) {
    console.error('❌ Delete notification error:', error)
    return false
  }
}

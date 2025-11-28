import { supabase } from '../config/supabase.js'

/**
 * Get notifications for the current user
 * GET /api/notifications?limit=20&cursor=timestamp
 */
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id
    const { limit = 20, cursor } = req.query

    console.log(`📬 Fetching notifications for user ${userId}`)

    let query = supabase
      .from('notifications')
      .select(`
        *,
        actor:users!notifications_actor_id_fkey (
          id,
          username,
          full_name,
          profile_photo_url
        ),
        post:posts (
          id,
          workout_name,
          image_urls
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit))

    // Cursor-based pagination
    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: notifications, error } = await query

    if (error) {
      console.error('❌ Get notifications error:', error)
      throw error
    }

    console.log(`✅ Found ${notifications.length} notifications`)

    res.json({
      success: true,
      data: {
        notifications,
        nextCursor: notifications.length === parseInt(limit)
          ? notifications[notifications.length - 1].created_at
          : null
      }
    })
  } catch (error) {
    console.error('❌ Get notifications error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      message: error.message
    })
  }
}

/**
 * Get unread notifications count
 * GET /api/notifications/unread-count
 */
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id

    const { data: user, error } = await supabase
      .from('users')
      .select('unread_notifications_count')
      .eq('id', userId)
      .single()

    if (error) throw error

    res.json({
      success: true,
      data: {
        count: user?.unread_notifications_count || 0
      }
    })
  } catch (error) {
    console.error('❌ Get unread count error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get unread count',
      message: error.message
    })
  }
}

/**
 * Mark notification as read
 * PUT /api/notifications/:notificationId/read
 */
export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params
    const userId = req.user.id

    console.log(`✅ Marking notification ${notificationId} as read for user ${userId}`)

    // Get the notification to verify ownership
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('id, user_id, is_read')
      .eq('id', notificationId)
      .single()

    if (fetchError || !notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      })
    }

    // Verify ownership
    if (notification.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to modify this notification'
      })
    }

    // If already read, just return success
    if (notification.is_read) {
      return res.json({
        success: true,
        message: 'Notification already marked as read'
      })
    }

    // Mark as read
    const { error: updateError } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', notificationId)

    if (updateError) throw updateError

    // Decrement unread count
    await supabase.rpc('decrement_unread_notifications', {
      user_id_param: userId
    })

    res.json({
      success: true,
      message: 'Notification marked as read'
    })
  } catch (error) {
    console.error('❌ Mark as read error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read',
      message: error.message
    })
  }
}

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id

    console.log(`✅ Marking all notifications as read for user ${userId}`)

    // Update all unread notifications
    const { error: updateError } = await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (updateError) throw updateError

    // Reset unread count to 0
    await supabase.rpc('reset_unread_notifications', {
      user_id_param: userId
    })

    res.json({
      success: true,
      message: 'All notifications marked as read'
    })
  } catch (error) {
    console.error('❌ Mark all as read error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
      message: error.message
    })
  }
}

import { supabase } from '../config/supabase.js'
import {
  updatePushToken,
  removePushToken,
  getNotificationPreferences,
  updateNotificationPreferences,
  sendPushNotification
} from '../services/pushNotificationService.js'

/**
 * Get notifications for the current user
 * GET /api/notifications?limit=20&cursor=timestamp&category=social|workout
 */
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id
    const { limit = 20, cursor, category } = req.query

    console.log(`📬 Fetching notifications for user ${userId}${category ? ` (category: ${category})` : ''}`)

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

    // Filter by category
    if (category && (category === 'social' || category === 'workout')) {
      query = query.eq('notification_category', category)
    }

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
 * GET /api/notifications/unread-count?category=social|workout
 */
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id
    const { category } = req.query

    // If category is specified, count from notifications table
    if (category && (category === 'social' || category === 'workout')) {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
        .eq('notification_category', category)

      if (error) throw error

      return res.json({
        success: true,
        data: {
          count: count || 0
        }
      })
    }

    // No category - return total from user table (faster)
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

// ============================================================================
// PUSH NOTIFICATION ENDPOINTS
// ============================================================================

/**
 * Register or update user's push notification token
 * POST /api/notifications/register-push-token
 */
export const registerPushToken = async (req, res) => {
  try {
    const { pushToken, deviceInfo } = req.body
    const userId = req.user.id

    if (!pushToken) {
      return res.status(400).json({
        success: false,
        error: 'Push token is required'
      })
    }

    console.log(`📱 Registering push token for user ${userId}`)

    const success = await updatePushToken(userId, pushToken, deviceInfo || {})

    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to register push token'
      })
    }

    res.json({
      success: true,
      message: 'Push token registered successfully'
    })
  } catch (error) {
    console.error('❌ Register push token error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to register push token',
      message: error.message
    })
  }
}

/**
 * Unregister user's push notification token (for logout)
 * POST /api/notifications/unregister-push-token
 */
export const unregisterPushToken = async (req, res) => {
  try {
    const { pushToken } = req.body
    const userId = req.user.id

    if (!pushToken) {
      return res.status(400).json({
        success: false,
        error: 'Push token is required'
      })
    }

    console.log(`🚪 Unregistering push token for user ${userId}`)

    const success = await removePushToken(userId, pushToken)

    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to unregister push token'
      })
    }

    res.json({
      success: true,
      message: 'Push token unregistered successfully'
    })
  } catch (error) {
    console.error('❌ Unregister push token error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to unregister push token',
      message: error.message
    })
  }
}

/**
 * Get user's notification preferences
 * GET /api/notifications/preferences
 */
export const getPreferences = async (req, res) => {
  try {
    const userId = req.user.id

    console.log(`⚙️  Fetching notification preferences for user ${userId}`)

    const preferences = await getNotificationPreferences(userId)

    if (!preferences) {
      return res.status(404).json({
        success: false,
        error: 'Notification preferences not found'
      })
    }

    res.json({
      success: true,
      data: preferences
    })
  } catch (error) {
    console.error('❌ Get preferences error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get notification preferences',
      message: error.message
    })
  }
}

/**
 * Update user's notification preferences
 * PUT /api/notifications/preferences
 */
export const updatePreferences = async (req, res) => {
  try {
    const userId = req.user.id
    const updates = req.body

    console.log(`⚙️  Updating notification preferences for user ${userId}`)

    const updatedPreferences = await updateNotificationPreferences(userId, updates)

    if (!updatedPreferences) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update notification preferences'
      })
    }

    res.json({
      success: true,
      data: updatedPreferences,
      message: 'Notification preferences updated successfully'
    })
  } catch (error) {
    console.error('❌ Update preferences error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update notification preferences',
      message: error.message
    })
  }
}

/**
 * Send a test push notification
 * POST /api/notifications/test-push
 */
export const sendTestPushNotification = async (req, res) => {
  try {
    const userId = req.user.id

    console.log(`🧪 Sending test push notification to user ${userId}`)

    const result = await sendPushNotification(userId, {
      title: 'Test Notification 🧪',
      body: 'This is a test push notification from your backend!',
      data: {
        type: 'test',
        timestamp: new Date().toISOString()
      },
      channelId: 'workout-notifications'
    })

    if (!result) {
      return res.status(500).json({
        success: false,
        error: 'Failed to send test push notification. Check if you have a valid push token registered.'
      })
    }

    res.json({
      success: true,
      message: 'Test push notification sent successfully',
      data: {
        ticket: result
      }
    })
  } catch (error) {
    console.error('❌ Send test push notification error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to send test push notification',
      message: error.message
    })
  }
}

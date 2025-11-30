import { supabase } from '../config/supabase.js'
import { sendPushNotification } from './pushNotificationService.js'

/**
 * Notification Service
 * Centralized service for creating and managing notifications
 * Supports both social notifications (like, comment, reply, follow)
 * and workout notifications (reminders, achievements, reports)
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

    // Get actor information for push notification
    const { data: actor } = await supabase
      .from('users')
      .select('username, full_name')
      .eq('id', actorId)
      .single()

    const actorName = actor?.username || actor?.full_name || 'Someone'

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

    // Send push notification
    const pushNotificationData = getPushNotificationData(type, actorName, postId, commentId)
    if (pushNotificationData) {
      const pushResult = await sendPushNotification(userId, pushNotificationData)

      // Mark push as sent if successful
      if (pushResult) {
        await supabase
          .from('notifications')
          .update({
            push_sent: true,
            push_sent_at: new Date().toISOString()
          })
          .eq('id', notification.id)
      }
    }

    console.log(`✅ Notification created successfully: ${notification.id}`)
    return notification
  } catch (error) {
    console.error('❌ Create notification error:', error)
    // Don't throw - notifications shouldn't break the main flow
    return null
  }
}

/**
 * Get push notification title and body based on type
 * @param {string} type - Notification type
 * @param {string} actorName - Actor's username or name
 * @param {string} postId - Post ID
 * @param {string} commentId - Comment ID
 * @returns {Object} Push notification data
 */
const getPushNotificationData = (type, actorName, postId, commentId) => {
  switch (type) {
    case 'like':
      return {
        title: '❤️ New Like',
        body: `${actorName} liked your workout post`,
        data: {
          type: 'like',
          postId,
          screen: 'post-detail'
        },
        channelId: 'social-notifications'
      }

    case 'comment':
      return {
        title: '💬 New Comment',
        body: `${actorName} commented on your post`,
        data: {
          type: 'comment',
          postId,
          commentId,
          screen: 'post-detail'
        },
        channelId: 'social-notifications'
      }

    case 'reply':
      return {
        title: '↩️ New Reply',
        body: `${actorName} replied to your comment`,
        data: {
          type: 'reply',
          postId,
          commentId,
          screen: 'post-detail'
        },
        channelId: 'social-notifications'
      }

    case 'follow':
      return {
        title: '👤 New Follower',
        body: `${actorName} started following you`,
        data: {
          type: 'follow',
          screen: 'profile'
        },
        channelId: 'social-notifications'
      }

    default:
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

// ============================================================================
// WORKOUT NOTIFICATION FUNCTIONS
// ============================================================================

/**
 * Create workout reminder notification
 * @param {string} userId - User ID
 * @param {Object} workoutData - Workout data
 * @param {string} reminderType - 'daily', 'upcoming', 'missed', or 'rest'
 * @returns {Promise<Object|null>} Created notification
 */
export const createWorkoutReminderNotification = async (userId, workoutData, reminderType = 'daily') => {
  try {
    const types = {
      daily: 'workout_reminder_daily',
      upcoming: 'workout_reminder_upcoming',
      missed: 'workout_reminder_missed',
      rest: 'workout_reminder_rest'
    }

    const titles = {
      daily: 'Time to crush it!',
      upcoming: 'Get ready!',
      missed: 'You still have time!',
      rest: 'Rest Day'
    }

    const bodies = {
      daily: `${workoutData.workout_name} is scheduled for today`,
      upcoming: `${workoutData.workout_name} starts in 1 hour`,
      missed: `Complete today's workout before midnight`,
      rest: `Today is your rest day. Recovery is progress too!`
    }

    console.log(`📬 Creating ${reminderType} workout reminder for user ${userId}`)

    // Create in-app notification
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        actor_id: null,
        type: types[reminderType],
        notification_category: 'workout',
        metadata: {
          workout_id: workoutData.id,
          workout_name: workoutData.workout_name,
          scheduled_date: workoutData.scheduled_date,
          estimated_duration: workoutData.estimated_duration_minutes || 45
        }
      })
      .select()
      .single()

    if (error) throw error

    // Send push notification
    await sendPushNotification(userId, {
      title: titles[reminderType],
      body: bodies[reminderType],
      data: {
        type: types[reminderType],
        workoutId: workoutData.id,
        screen: 'workout-detail',
        notificationId: notification.id
      },
      channelId: 'workout-notifications'
    })

    // Mark push as sent
    await supabase
      .from('notifications')
      .update({ push_sent: true, push_sent_at: new Date().toISOString() })
      .eq('id', notification.id)

    // Increment unread count
    await supabase.rpc('increment_unread_notifications', {
      user_id_param: userId
    })

    console.log(`✅ Workout reminder notification created: ${notification.id}`)
    return notification

  } catch (error) {
    console.error('❌ Create workout reminder notification error:', error)
    return null
  }
}

/**
 * Create workout completed notification
 * @param {string} userId - User ID
 * @param {Object} completionData - Workout completion data
 * @returns {Promise<Object|null>} Created notification
 */
export const createWorkoutCompletedNotification = async (userId, completionData) => {
  try {
    console.log(`📬 Creating workout completed notification for user ${userId}`)

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        actor_id: null,
        type: 'workout_completed',
        notification_category: 'workout',
        metadata: {
          workout_name: completionData.workout_name,
          duration_minutes: completionData.duration_minutes,
          calories_burned: completionData.calories_burned || 0,
          difficulty_rating: completionData.difficulty_rating,
          completion_id: completionData.id
        }
      })
      .select()
      .single()

    if (error) throw error

    // Send push notification
    const caloriesText = completionData.calories_burned
      ? ` - ${completionData.calories_burned} cal burned 🔥`
      : ''

    await sendPushNotification(userId, {
      title: 'Amazing work! 🎉',
      body: `${completionData.workout_name} completed in ${completionData.duration_minutes} min${caloriesText}`,
      data: {
        type: 'workout_completed',
        completionId: completionData.id,
        screen: 'workout-summary',
        notificationId: notification.id
      },
      channelId: 'workout-notifications'
    })

    await supabase
      .from('notifications')
      .update({ push_sent: true, push_sent_at: new Date().toISOString() })
      .eq('id', notification.id)

    await supabase.rpc('increment_unread_notifications', {
      user_id_param: userId
    })

    console.log(`✅ Workout completed notification created: ${notification.id}`)
    return notification

  } catch (error) {
    console.error('❌ Create workout completed notification error:', error)
    return null
  }
}

/**
 * Create weekly goal achieved notification
 * @param {string} userId - User ID
 * @param {Object} weekData - Week summary data
 * @returns {Promise<Object|null>} Created notification
 */
export const createWeeklyGoalNotification = async (userId, weekData) => {
  try {
    console.log(`📬 Creating weekly goal notification for user ${userId}`)

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        actor_id: null,
        type: 'weekly_goal_achieved',
        notification_category: 'workout',
        metadata: {
          workouts_completed: weekData.workouts_completed,
          weekly_goal: weekData.weekly_goal,
          week_start: weekData.week_start,
          week_end: weekData.week_end,
          total_minutes: weekData.total_minutes,
          total_calories: weekData.total_calories
        }
      })
      .select()
      .single()

    if (error) throw error

    await sendPushNotification(userId, {
      title: 'Weekly Goal Crushed! 🏆',
      body: `${weekData.workouts_completed}/${weekData.weekly_goal} workouts completed this week`,
      data: {
        type: 'weekly_goal_achieved',
        screen: 'weekly-summary',
        notificationId: notification.id
      },
      channelId: 'workout-notifications'
    })

    await supabase
      .from('notifications')
      .update({ push_sent: true, push_sent_at: new Date().toISOString() })
      .eq('id', notification.id)

    await supabase.rpc('increment_unread_notifications', {
      user_id_param: userId
    })

    console.log(`✅ Weekly goal notification created: ${notification.id}`)
    return notification

  } catch (error) {
    console.error('❌ Create weekly goal notification error:', error)
    return null
  }
}

/**
 * Create monthly milestone notification
 * @param {string} userId - User ID
 * @param {Object} monthData - Month summary data
 * @returns {Promise<Object|null>} Created notification
 */
export const createMonthlyMilestoneNotification = async (userId, monthData) => {
  try {
    console.log(`📬 Creating monthly milestone notification for user ${userId}`)

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        actor_id: null,
        type: 'monthly_milestone',
        notification_category: 'workout',
        metadata: {
          workouts_count: monthData.workouts_count,
          month: monthData.month,
          total_minutes: monthData.total_minutes,
          total_calories: monthData.total_calories
        }
      })
      .select()
      .single()

    if (error) throw error

    await sendPushNotification(userId, {
      title: 'Monthly Milestone! 🚀',
      body: `${monthData.workouts_count} workouts completed in ${monthData.month}`,
      data: {
        type: 'monthly_milestone',
        screen: 'monthly-summary',
        notificationId: notification.id
      },
      channelId: 'workout-notifications'
    })

    await supabase
      .from('notifications')
      .update({ push_sent: true, push_sent_at: new Date().toISOString() })
      .eq('id', notification.id)

    await supabase.rpc('increment_unread_notifications', {
      user_id_param: userId
    })

    console.log(`✅ Monthly milestone notification created: ${notification.id}`)
    return notification

  } catch (error) {
    console.error('❌ Create monthly milestone notification error:', error)
    return null
  }
}

/**
 * Create plan generated notification
 * @param {string} userId - User ID
 * @param {Object} planData - Workout plan data
 * @returns {Promise<Object|null>} Created notification
 */
export const createPlanGeneratedNotification = async (userId, planData) => {
  try {
    console.log(`📬 Creating plan generated notification for user ${userId}`)

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        actor_id: null,
        type: 'plan_generated',
        notification_category: 'workout',
        metadata: {
          plan_id: planData.id,
          plan_name: planData.plan_name,
          duration_weeks: planData.duration_weeks,
          workouts_count: planData.workouts_count
        }
      })
      .select()
      .single()

    if (error) throw error

    await sendPushNotification(userId, {
      title: 'New Plan Ready! 📋',
      body: `Your ${planData.plan_name} plan is ready to start`,
      data: {
        type: 'plan_generated',
        planId: planData.id,
        screen: 'plan-detail',
        notificationId: notification.id
      },
      channelId: 'workout-notifications'
    })

    await supabase
      .from('notifications')
      .update({ push_sent: true, push_sent_at: new Date().toISOString() })
      .eq('id', notification.id)

    await supabase.rpc('increment_unread_notifications', {
      user_id_param: userId
    })

    console.log(`✅ Plan generated notification created: ${notification.id}`)
    return notification

  } catch (error) {
    console.error('❌ Create plan generated notification error:', error)
    return null
  }
}

/**
 * Create weekly report notification
 * @param {string} userId - User ID
 * @param {Object} reportData - Week report data
 * @returns {Promise<Object|null>} Created notification
 */
export const createWeeklyReportNotification = async (userId, reportData) => {
  try {
    console.log(`📬 Creating weekly report notification for user ${userId}`)

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        actor_id: null,
        type: 'weekly_report',
        notification_category: 'workout',
        metadata: {
          workouts_completed: reportData.workouts_completed,
          total_minutes: reportData.total_minutes,
          total_calories: reportData.total_calories,
          avg_difficulty: reportData.avg_difficulty,
          most_common_time: reportData.most_common_time
        }
      })
      .select()
      .single()

    if (error) throw error

    await sendPushNotification(userId, {
      title: 'Your Weekly Summary 📊',
      body: `${reportData.workouts_completed} workouts, ${reportData.total_minutes} min active time this week`,
      data: {
        type: 'weekly_report',
        screen: 'weekly-report',
        notificationId: notification.id
      },
      channelId: 'workout-notifications'
    })

    await supabase
      .from('notifications')
      .update({ push_sent: true, push_sent_at: new Date().toISOString() })
      .eq('id', notification.id)

    await supabase.rpc('increment_unread_notifications', {
      user_id_param: userId
    })

    console.log(`✅ Weekly report notification created: ${notification.id}`)
    return notification

  } catch (error) {
    console.error('❌ Create weekly report notification error:', error)
    return null
  }
}

/**
 * Create inactive alert notification
 * @param {string} userId - User ID
 * @param {Object} inactiveData - Inactivity data
 * @returns {Promise<Object|null>} Created notification
 */
export const createInactiveAlertNotification = async (userId, inactiveData) => {
  try {
    console.log(`📬 Creating inactive alert notification for user ${userId}`)

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        actor_id: null,
        type: 'inactive_alert',
        notification_category: 'workout',
        metadata: {
          days_inactive: inactiveData.days_inactive,
          last_workout_date: inactiveData.last_workout_date,
          last_workout_name: inactiveData.last_workout_name
        }
      })
      .select()
      .single()

    if (error) throw error

    await sendPushNotification(userId, {
      title: 'We miss you! 😊',
      body: `It's been ${inactiveData.days_inactive} days since your last workout`,
      data: {
        type: 'inactive_alert',
        screen: 'workout-planner',
        notificationId: notification.id
      },
      channelId: 'workout-notifications'
    })

    await supabase
      .from('notifications')
      .update({ push_sent: true, push_sent_at: new Date().toISOString() })
      .eq('id', notification.id)

    await supabase.rpc('increment_unread_notifications', {
      user_id_param: userId
    })

    console.log(`✅ Inactive alert notification created: ${notification.id}`)
    return notification

  } catch (error) {
    console.error('❌ Create inactive alert notification error:', error)
    return null
  }
}

/**
 * Create recovery reminder notification
 * @param {string} userId - User ID
 * @param {Object} recoveryData - Recovery data
 * @returns {Promise<Object|null>} Created notification
 */
export const createRecoveryReminderNotification = async (userId, recoveryData) => {
  try {
    console.log(`📬 Creating recovery reminder notification for user ${userId}`)

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        actor_id: null,
        type: 'recovery_reminder',
        notification_category: 'workout',
        metadata: {
          consecutive_days: recoveryData.consecutive_days,
          workouts_this_week: recoveryData.workouts_this_week,
          total_minutes_this_week: recoveryData.total_minutes_this_week
        }
      })
      .select()
      .single()

    if (error) throw error

    await sendPushNotification(userId, {
      title: 'Time to Recover 🛌',
      body: `You've worked out ${recoveryData.consecutive_days} days straight. Consider a rest day!`,
      data: {
        type: 'recovery_reminder',
        screen: 'home',
        notificationId: notification.id
      },
      channelId: 'workout-notifications'
    })

    await supabase
      .from('notifications')
      .update({ push_sent: true, push_sent_at: new Date().toISOString() })
      .eq('id', notification.id)

    await supabase.rpc('increment_unread_notifications', {
      user_id_param: userId
    })

    console.log(`✅ Recovery reminder notification created: ${notification.id}`)
    return notification

  } catch (error) {
    console.error('❌ Create recovery reminder notification error:', error)
    return null
  }
}

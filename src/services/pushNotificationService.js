import { Expo } from 'expo-server-sdk';
import { supabase } from '../config/supabase.js';

// Create Expo SDK client
const expo = new Expo();

/**
 * Send push notification to a user
 * @param {string} userId - User ID
 * @param {Object} notificationData - Notification payload
 * @param {string} notificationData.title - Notification title
 * @param {string} notificationData.body - Notification body
 * @param {Object} [notificationData.data] - Additional data to include
 * @param {string} [notificationData.channelId] - Android notification channel (default: 'workout-notifications')
 * @returns {Promise<Object|null>} Push ticket or null if failed
 */
export const sendPushNotification = async (userId, notificationData) => {
  try {
    // Get user's push token and preferences
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('push_token, push_notifications_enabled')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error(`❌ Error fetching user ${userId}:`, userError);
      return null;
    }

    if (!user?.push_token) {
      console.log(`⏭️  No push token for user ${userId}`);
      return null;
    }

    if (!user.push_notifications_enabled) {
      console.log(`⏭️  Push notifications disabled for user ${userId}`);
      return null;
    }

    // Validate Expo push token format
    if (!Expo.isExpoPushToken(user.push_token)) {
      console.error(`❌ Invalid Expo push token for user ${userId}: ${user.push_token}`);
      // Remove invalid token
      await supabase
        .from('users')
        .update({ push_token: null })
        .eq('id', userId);
      return null;
    }

    // Check quiet hours (if enabled)
    const inQuietHours = await checkQuietHours(userId);
    if (inQuietHours) {
      console.log(`🔕 User ${userId} is in quiet hours - skipping push notification`);
      return null;
    }

    // Prepare push message
    const message = {
      to: user.push_token,
      sound: 'default',
      title: notificationData.title,
      body: notificationData.body,
      data: notificationData.data || {},
      badge: 1,
      priority: 'high',
      channelId: notificationData.channelId || 'default', // Android notification channel
    };

    console.log(`📤 Sending push notification to user ${userId}: ${notificationData.title}`);

    // Send push notification
    const tickets = await expo.sendPushNotificationsAsync([message]);
    const ticket = tickets[0];

    console.log(`✅ Push notification sent:`, ticket);

    // Check for errors in ticket
    if (ticket.status === 'error') {
      console.error(`❌ Error in push ticket:`, ticket.message);

      // If token is invalid, remove it
      if (ticket.details?.error === 'DeviceNotRegistered') {
        console.log(`🗑️  Removing invalid token for user ${userId}`);
        await supabase
          .from('users')
          .update({ push_token: null })
          .eq('id', userId);
      }
    }

    return ticket;

  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    return null;
  }
};

/**
 * Send push notifications to multiple users
 * @param {Array<{userId: string, notification: Object}>} notifications - Array of user IDs and notifications
 * @returns {Promise<Array>} Array of push tickets
 */
export const sendBatchPushNotifications = async (notifications) => {
  try {
    const messages = [];
    const userIds = [];

    // Prepare messages for all users
    for (const { userId, notification } of notifications) {
      const { data: user } = await supabase
        .from('users')
        .select('push_token, push_notifications_enabled')
        .eq('id', userId)
        .single();

      if (!user?.push_token || !user.push_notifications_enabled) {
        continue;
      }

      if (!Expo.isExpoPushToken(user.push_token)) {
        continue;
      }

      const inQuietHours = await checkQuietHours(userId);
      if (inQuietHours) {
        continue;
      }

      messages.push({
        to: user.push_token,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        badge: 1,
        priority: 'high',
        channelId: 'workout-notifications',
      });

      userIds.push(userId);
    }

    if (messages.length === 0) {
      console.log('⏭️  No valid push tokens found for batch notification');
      return [];
    }

    console.log(`📤 Sending ${messages.length} push notifications in batch`);

    // Split messages into chunks of 100 (Expo's recommended batch size)
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
      const chunkTickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...chunkTickets);
    }

    console.log(`✅ Batch push notifications sent: ${tickets.length} tickets`);
    return tickets;

  } catch (error) {
    console.error('❌ Error sending batch push notifications:', error);
    return [];
  }
};

/**
 * Update user's push token
 * @param {string} userId - User ID
 * @param {string} pushToken - Expo push token
 * @returns {Promise<boolean>} Success status
 */
export const updatePushToken = async (userId, pushToken) => {
  try {
    // Validate token format
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`❌ Invalid Expo push token format: ${pushToken}`);
      return false;
    }

    const { error } = await supabase
      .from('users')
      .update({
        push_token: pushToken,
        push_token_updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      console.error(`❌ Error updating push token for user ${userId}:`, error);
      return false;
    }

    console.log(`✅ Push token updated for user ${userId}`);
    return true;

  } catch (error) {
    console.error('❌ Error updating push token:', error);
    return false;
  }
};

/**
 * Remove user's push token
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success status
 */
export const removePushToken = async (userId) => {
  try {
    const { error } = await supabase
      .from('users')
      .update({
        push_token: null,
        push_token_updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      console.error(`❌ Error removing push token for user ${userId}:`, error);
      return false;
    }

    console.log(`✅ Push token removed for user ${userId}`);
    return true;

  } catch (error) {
    console.error('❌ Error removing push token:', error);
    return false;
  }
};

/**
 * Enable/disable push notifications for user
 * @param {string} userId - User ID
 * @param {boolean} enabled - Whether to enable push notifications
 * @returns {Promise<boolean>} Success status
 */
export const setPushNotificationsEnabled = async (userId, enabled) => {
  try {
    const { error } = await supabase
      .from('users')
      .update({ push_notifications_enabled: enabled })
      .eq('id', userId);

    if (error) {
      console.error(`❌ Error updating push notifications enabled for user ${userId}:`, error);
      return false;
    }

    console.log(`✅ Push notifications ${enabled ? 'enabled' : 'disabled'} for user ${userId}`);
    return true;

  } catch (error) {
    console.error('❌ Error updating push notifications enabled:', error);
    return false;
  }
};

/**
 * Check if current time is in user's quiet hours
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if in quiet hours
 */
export const checkQuietHours = async (userId) => {
  try {
    const { data: prefs, error } = await supabase
      .from('notification_preferences')
      .select('quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
      .eq('user_id', userId)
      .single();

    if (error || !prefs) {
      return false;
    }

    if (!prefs.quiet_hours_enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = now.toTimeString().substring(0, 5); // HH:MM format

    const start = prefs.quiet_hours_start.substring(0, 5);
    const end = prefs.quiet_hours_end.substring(0, 5);

    // Handle cases where quiet hours span midnight (e.g., 22:00 to 07:00)
    if (start < end) {
      // Normal case: start is before end (e.g., 14:00 to 18:00)
      return currentTime >= start && currentTime < end;
    } else {
      // Spans midnight: start is after end (e.g., 22:00 to 07:00)
      return currentTime >= start || currentTime < end;
    }

  } catch (error) {
    console.error('❌ Error checking quiet hours:', error);
    return false;
  }
};

/**
 * Get notification preferences for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Notification preferences
 */
export const getNotificationPreferences = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error(`❌ Error fetching notification preferences for user ${userId}:`, error);
      return null;
    }

    return data;

  } catch (error) {
    console.error('❌ Error getting notification preferences:', error);
    return null;
  }
};

/**
 * Update notification preferences for a user
 * @param {string} userId - User ID
 * @param {Object} updates - Preference updates
 * @returns {Promise<Object|null>} Updated preferences
 */
export const updateNotificationPreferences = async (userId, updates) => {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error(`❌ Error updating notification preferences for user ${userId}:`, error);
      return null;
    }

    console.log(`✅ Notification preferences updated for user ${userId}`);
    return data;

  } catch (error) {
    console.error('❌ Error updating notification preferences:', error);
    return null;
  }
};

export default {
  sendPushNotification,
  sendBatchPushNotifications,
  updatePushToken,
  removePushToken,
  setPushNotificationsEnabled,
  checkQuietHours,
  getNotificationPreferences,
  updateNotificationPreferences
};

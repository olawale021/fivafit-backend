import { Expo } from 'expo-server-sdk';
import { supabase } from '../config/supabase.js';

// Create Expo SDK client (access token required for EAS-built apps)
const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
});

/**
 * Send push notification to a user (supports multiple devices)
 * @param {string} userId - User ID
 * @param {Object} notificationData - Notification payload
 * @param {string} notificationData.title - Notification title
 * @param {string} notificationData.body - Notification body
 * @param {Object} [notificationData.data] - Additional data to include
 * @param {string} [notificationData.channelId] - Android notification channel (default: 'workout-notifications')
 * @returns {Promise<Array>} Array of push tickets
 */
export const sendPushNotification = async (userId, notificationData) => {
  try {
    // Check if push notifications are enabled for user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('push_notifications_enabled')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error(`❌ Error fetching user ${userId}:`, userError);
      return [];
    }

    if (!user?.push_notifications_enabled) {
      console.log(`⏭️  Push notifications disabled for user ${userId}`);
      return [];
    }

    // Check quiet hours (if enabled)
    const inQuietHours = await checkQuietHours(userId);
    if (inQuietHours) {
      console.log(`🔕 User ${userId} is in quiet hours - skipping push notification`);
      return [];
    }

    // Get all active push tokens for this user (multiple devices)
    const { data: pushTokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('id, token, platform, device_name')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (tokensError) {
      console.error(`❌ Error fetching push tokens for user ${userId}:`, tokensError);
      return [];
    }

    if (!pushTokens || pushTokens.length === 0) {
      console.log(`⏭️  No active push tokens for user ${userId}`);
      return [];
    }

    console.log(`📤 Sending push notification to user ${userId} on ${pushTokens.length} device(s): ${notificationData.title}`);

    // Prepare messages for all devices
    const messages = [];
    const tokenIds = [];

    for (const tokenData of pushTokens) {
      // Validate Expo push token format
      if (!Expo.isExpoPushToken(tokenData.token)) {
        console.error(`❌ Invalid Expo push token: ${tokenData.token}`);
        // Mark as inactive
        await supabase
          .from('push_tokens')
          .update({ is_active: false })
          .eq('id', tokenData.id);
        continue;
      }

      messages.push({
        to: tokenData.token,
        sound: 'default',
        title: notificationData.title,
        body: notificationData.body,
        data: notificationData.data || {},
        badge: 1,
        priority: 'high',
        channelId: notificationData.channelId || 'default',
      });

      tokenIds.push(tokenData.id);
    }

    if (messages.length === 0) {
      console.log(`⏭️  No valid push tokens for user ${userId}`);
      return [];
    }

    // Send push notifications
    // Send each device in its OWN request. Expo rejects a whole request that
    // mixes tokens from different Expo projects ("All push notification messages
    // in the same request must be for the same project"), which would fail every
    // device at once. Isolating each send means one stale/cross-project token
    // can't block delivery to the user's valid device(s).
    const tickets = [];
    const receiptToTokenId = new Map();

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const tokenId = tokenIds[i];

      try {
        const [ticket] = await expo.sendPushNotificationsAsync([message]);
        tickets.push(ticket);

        if (ticket.status === 'ok') {
          console.log(`📋 Push ticket OK for user ${userId}, receipt: ${ticket.id}`);
          if (ticket.id) receiptToTokenId.set(ticket.id, tokenId);
          await supabase
            .from('push_tokens')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', tokenId);
        } else if (ticket.status === 'error') {
          console.error(`❌ Error in push ticket for user ${userId}:`, ticket.message, ticket.details);

          // If token is invalid, mark as inactive
          if (ticket.details?.error === 'DeviceNotRegistered') {
            console.log(`🗑️  Marking token as inactive: ${tokenId}`);
            await supabase
              .from('push_tokens')
              .update({ is_active: false })
              .eq('id', tokenId);
          }
        }
      } catch (sendErr) {
        // A single device failing (e.g. project mismatch) must not block the rest
        console.error(`❌ Failed to send to token ${tokenId} for user ${userId}:`, sendErr.message);
      }
    }

    console.log(`✅ Push notifications processed for ${messages.length} device(s)`);

    // Check receipts after a delay to catch delivery failures (e.g. the device
    // unregistered from APNs/FCM) and prune the dead token.
    const receiptIds = [...receiptToTokenId.keys()];
    if (receiptIds.length > 0) {
      setTimeout(async () => {
        try {
          const receiptChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
          for (const chunk of receiptChunks) {
            const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
            for (const [receiptId, receipt] of Object.entries(receipts)) {
              if (receipt.status === 'ok') {
                console.log(`✅ Receipt ${receiptId}: delivered successfully`);
              } else if (receipt.status === 'error') {
                console.error(`❌ Receipt ${receiptId}: ${receipt.message} (${receipt.details?.error})`);
                // If DeviceNotRegistered, deactivate the token that produced this receipt
                if (receipt.details?.error === 'DeviceNotRegistered') {
                  const badTokenId = receiptToTokenId.get(receiptId);
                  if (badTokenId) {
                    console.log(`🗑️  Deactivating token ${badTokenId} (DeviceNotRegistered per receipt)`);
                    await supabase
                      .from('push_tokens')
                      .update({ is_active: false })
                      .eq('id', badTokenId);
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error('❌ Error checking push receipts:', err);
        }
      }, 30000); // Check receipts after 30 seconds
    }

    return tickets;

  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    return [];
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

    // Prepare messages for all users using push_tokens table
    for (const { userId, notification } of notifications) {
      // Check if push notifications are enabled
      const { data: user } = await supabase
        .from('users')
        .select('push_notifications_enabled')
        .eq('id', userId)
        .single();

      if (!user?.push_notifications_enabled) {
        continue;
      }

      const inQuietHours = await checkQuietHours(userId);
      if (inQuietHours) {
        continue;
      }

      // Get all active tokens for this user (multi-device)
      const { data: pushTokens, error: tokensError } = await supabase
        .from('push_tokens')
        .select('token')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (tokensError || !pushTokens || pushTokens.length === 0) {
        continue;
      }

      for (const tokenData of pushTokens) {
        if (!Expo.isExpoPushToken(tokenData.token)) {
          continue;
        }

        messages.push({
          to: tokenData.token,
          sound: 'default',
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
          badge: 1,
          priority: 'high',
          channelId: notification.channelId || 'default',
        });
      }
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
 * Update user's push token (add new device or update existing)
 * @param {string} userId - User ID
 * @param {string} pushToken - Expo push token
 * @param {Object} deviceInfo - Optional device information
 * @param {string} deviceInfo.platform - 'ios', 'android', 'web'
 * @param {string} deviceInfo.deviceName - Device name/model
 * @param {string} deviceInfo.deviceId - Unique device identifier
 * @returns {Promise<boolean>} Success status
 */
export const updatePushToken = async (userId, pushToken, deviceInfo = {}) => {
  try {
    // Validate token format
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`❌ Invalid Expo push token format: ${pushToken}`);
      return false;
    }

    // IMPORTANT: Remove this token from any OTHER users first
    // This prevents duplicate notifications when switching accounts on the same device
    const { data: existingTokens, error: checkError } = await supabase
      .from('push_tokens')
      .select('id, user_id')
      .eq('token', pushToken)
      .neq('user_id', userId);

    if (checkError) {
      console.error(`❌ Error checking existing push tokens:`, checkError);
    } else if (existingTokens && existingTokens.length > 0) {
      console.log(`🔄 Removing push token from ${existingTokens.length} other user(s)`);

      // Delete tokens from other users
      const tokenIds = existingTokens.map(t => t.id);
      const { error: removeError } = await supabase
        .from('push_tokens')
        .delete()
        .in('id', tokenIds);

      if (removeError) {
        console.error(`❌ Error removing push token from other users:`, removeError);
      } else {
        console.log(`✅ Push token removed from other users`);
      }
    }

    // Deactivate this user's OTHER tokens on the SAME physical device. A rebuild
    // or reinstall rotates the Expo token (and can move it to a different Expo
    // project); leaving the old one active accumulates stale tokens and — across
    // projects — breaks batched sends. Only dedupe when we can identify the
    // device, so genuinely separate devices keep their own tokens.
    if (deviceInfo.deviceId) {
      const { error: dedupError } = await supabase
        .from('push_tokens')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('device_id', deviceInfo.deviceId)
        .neq('token', pushToken);

      if (dedupError) {
        console.error(`❌ Error deactivating old tokens for device:`, dedupError);
      }
    }

    // Check if this token already exists for this user
    const { data: existingToken } = await supabase
      .from('push_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('token', pushToken)
      .single();

    if (existingToken) {
      // Token already exists - just mark it as active and update device info
      const { error: updateError } = await supabase
        .from('push_tokens')
        .update({
          is_active: true,
          platform: deviceInfo.platform || null,
          device_name: deviceInfo.deviceName || null,
          device_id: deviceInfo.deviceId || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingToken.id);

      if (updateError) {
        console.error(`❌ Error updating existing push token:`, updateError);
        return false;
      }

      console.log(`✅ Push token reactivated for user ${userId}`);
    } else {
      // Insert new token
      const { error: insertError } = await supabase
        .from('push_tokens')
        .insert({
          user_id: userId,
          token: pushToken,
          platform: deviceInfo.platform || null,
          device_name: deviceInfo.deviceName || null,
          device_id: deviceInfo.deviceId || null,
          is_active: true
        });

      if (insertError) {
        console.error(`❌ Error inserting push token:`, insertError);
        return false;
      }

      console.log(`✅ New push token added for user ${userId}`);
    }

    return true;

  } catch (error) {
    console.error('❌ Error updating push token:', error);
    return false;
  }
};

/**
 * Remove user's push token (specific token or all tokens)
 * @param {string} userId - User ID
 * @param {string} [pushToken] - Optional: specific token to remove. If not provided, removes all tokens.
 * @returns {Promise<boolean>} Success status
 */
export const removePushToken = async (userId, pushToken = null) => {
  try {
    let query = supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId);

    // If specific token provided, only remove that one
    if (pushToken) {
      query = query.eq('token', pushToken);
    }

    const { error } = await query;

    if (error) {
      console.error(`❌ Error removing push token for user ${userId}:`, error);
      return false;
    }

    if (pushToken) {
      console.log(`✅ Specific push token removed for user ${userId}`);
    } else {
      console.log(`✅ All push tokens removed for user ${userId}`);
    }

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
      .select('quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone')
      .eq('user_id', userId)
      .single();

    if (error || !prefs) {
      return false;
    }

    if (!prefs.quiet_hours_enabled) {
      return false;
    }

    // Quiet-hours values are stored in the user's LOCAL time, so compare against
    // the current time in the user's timezone — not the server clock (UTC on
    // Render), which would evaluate quiet hours for every non-UTC user.
    const tz = prefs.timezone || 'UTC';
    const fmt = (zone) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date());
    let currentTime;
    try {
      currentTime = fmt(tz);
    } catch {
      currentTime = fmt('UTC'); // invalid timezone string → fall back to UTC
    }
    if (currentTime.startsWith('24')) currentTime = '00' + currentTime.slice(2); // midnight guard

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

/**
 * Send a silent/background push notification to wake the app
 * This is used to trigger background HealthKit sync for Live Activities
 * @param {string} userId - User ID
 * @param {Object} data - Data payload for the silent push
 * @returns {Promise<Array>} Array of push tickets
 */
export const sendSilentPushNotification = async (userId, data = {}) => {
  try {
    // Get all active push tokens for this user
    const { data: pushTokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('id, token, platform')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (tokensError) {
      console.error(`❌ Error fetching push tokens for user ${userId}:`, tokensError);
      return [];
    }

    if (!pushTokens || pushTokens.length === 0) {
      console.log(`⏭️  No active push tokens for user ${userId}`);
      return [];
    }

    console.log(`📤 Sending silent push to user ${userId} on ${pushTokens.length} device(s)`);

    // Prepare silent push messages
    const messages = [];
    const tokenIds = [];

    for (const tokenData of pushTokens) {
      // Validate Expo push token format
      if (!Expo.isExpoPushToken(tokenData.token)) {
        console.error(`❌ Invalid Expo push token: ${tokenData.token}`);
        continue;
      }

      // Silent push: no title, body, or sound - only data with _contentAvailable
      messages.push({
        to: tokenData.token,
        data: {
          ...data,
          _contentAvailable: true, // iOS silent push flag
          type: 'silent_step_sync',
        },
        priority: 'high',
        // iOS: content-available for background fetch
        _contentAvailable: true,
      });

      tokenIds.push(tokenData.id);
    }

    if (messages.length === 0) {
      console.log(`⏭️  No valid push tokens for user ${userId}`);
      return [];
    }

    // Send silent push notifications
    const tickets = await expo.sendPushNotificationsAsync(messages);

    console.log(`✅ Silent push sent to ${tickets.length} device(s)`);

    // Handle errors
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const tokenId = tokenIds[i];

      if (ticket.status === 'error') {
        console.error(`❌ Error in silent push ticket:`, ticket.message);

        if (ticket.details?.error === 'DeviceNotRegistered') {
          console.log(`🗑️  Marking token as inactive: ${tokenId}`);
          await supabase
            .from('push_tokens')
            .update({ is_active: false })
            .eq('id', tokenId);
        }
      }
    }

    return tickets;

  } catch (error) {
    console.error('❌ Error sending silent push notification:', error);
    return [];
  }
};

export default {
  sendPushNotification,
  sendBatchPushNotifications,
  sendSilentPushNotification,
  updatePushToken,
  removePushToken,
  setPushNotificationsEnabled,
  checkQuietHours,
  getNotificationPreferences,
  updateNotificationPreferences
};

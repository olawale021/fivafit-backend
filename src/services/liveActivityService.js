/**
 * Live Activity Push Notification Service
 *
 * Handles ActivityKit push notifications for iOS Live Activities (Dynamic Island/Lock Screen widgets)
 * Uses Apple's APNs HTTP/2 API directly
 */

import http2 from 'http2';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

// APNs Configuration
const APNS_HOST_PRODUCTION = 'api.push.apple.com';
const APNS_HOST_SANDBOX = 'api.sandbox.push.apple.com';

// These should be set in environment variables
const TEAM_ID = process.env.APPLE_TEAM_ID;
const KEY_ID = process.env.APPLE_KEY_ID;
const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.stepmode.app';

// APNs Auth Key (P8 file contents)
// In production, load from file or secret manager
const AUTH_KEY = process.env.APPLE_AUTH_KEY;

// Use production APNs for EAS builds (they use production certs even for dev builds)
// Set APNS_USE_SANDBOX=true in .env to force sandbox mode for simulator testing
const APNS_HOST = process.env.APNS_USE_SANDBOX === 'true' ? APNS_HOST_SANDBOX : APNS_HOST_PRODUCTION;

console.log('[LiveActivity] APNs host:', APNS_HOST);
console.log('[LiveActivity] Team ID:', TEAM_ID ? 'set' : 'NOT SET');
console.log('[LiveActivity] Key ID:', KEY_ID ? 'set' : 'NOT SET');
console.log('[LiveActivity] Auth Key:', AUTH_KEY ? 'set (length: ' + AUTH_KEY.length + ')' : 'NOT SET');

/**
 * Generate JWT for APNs authentication
 */
function generateAPNsToken() {
  if (!TEAM_ID || !KEY_ID || !AUTH_KEY) {
    throw new Error('APNs configuration missing. Set APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_AUTH_KEY');
  }

  const token = jwt.sign(
    {
      iss: TEAM_ID,
      iat: Math.floor(Date.now() / 1000),
    },
    AUTH_KEY,
    {
      algorithm: 'ES256',
      keyid: KEY_ID,
    }
  );

  return token;
}

/**
 * Send push notification to update Live Activity
 * @param {string} pushToken - The Live Activity push token
 * @param {object} contentState - The new content state for the widget
 */
export async function sendLiveActivityUpdate(pushToken, contentState) {
  return new Promise((resolve, reject) => {
    try {
      const token = generateAPNsToken();

      const client = http2.connect(`https://${APNS_HOST}`);

      client.on('error', (err) => {
        console.error('[LiveActivity] HTTP/2 connection error:', err);
        reject(err);
      });

      // APNs payload for Live Activity update
      const payload = JSON.stringify({
        aps: {
          timestamp: Math.floor(Date.now() / 1000),
          event: 'update',
          'content-state': contentState,
        },
      });

      const headers = {
        ':method': 'POST',
        ':path': `/3/device/${pushToken}`,
        'authorization': `bearer ${token}`,
        'apns-topic': `${BUNDLE_ID}.push-type.liveactivity`,
        'apns-push-type': 'liveactivity',
        'apns-priority': '10',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      };

      const req = client.request(headers);

      let responseData = '';

      req.on('response', (headers) => {
        const status = headers[':status'];
        if (status === 200) {
          console.log('[LiveActivity] Push sent successfully');
          resolve({ success: true });
        } else {
          console.error('[LiveActivity] Push failed with status:', status);
        }
      });

      req.on('data', (chunk) => {
        responseData += chunk;
      });

      req.on('end', () => {
        client.close();
        if (responseData) {
          try {
            const parsed = JSON.parse(responseData);
            if (parsed.reason) {
              reject(new Error(`APNs error: ${parsed.reason}`));
            }
          } catch (e) {
            // Response wasn't JSON, that's ok
          }
        }
      });

      req.on('error', (err) => {
        console.error('[LiveActivity] Request error:', err);
        reject(err);
      });

      req.write(payload);
      req.end();

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Register a Live Activity push token for a user
 * @param {string} userId - User ID
 * @param {string} pushToken - The Live Activity push token
 */
export async function registerLiveActivityToken(userId, pushToken) {
  try {
    // Upsert the token (replace if exists)
    const { error } = await supabase
      .from('live_activity_tokens')
      .upsert(
        {
          user_id: userId,
          push_token: pushToken,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

    if (error) {
      console.error('[LiveActivity] Failed to register token:', error);
      throw error;
    }

    console.log('[LiveActivity] Token registered for user:', userId);
    return true;
  } catch (error) {
    console.error('[LiveActivity] Error registering token:', error);
    throw error;
  }
}

/**
 * Get the Live Activity token for a user
 * @param {string} userId - User ID
 */
export async function getLiveActivityToken(userId) {
  try {
    const { data, error } = await supabase
      .from('live_activity_tokens')
      .select('push_token')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No token found
      }
      throw error;
    }

    return data?.push_token || null;
  } catch (error) {
    console.error('[LiveActivity] Error getting token:', error);
    return null;
  }
}

/**
 * Remove a user's Live Activity token
 * @param {string} userId - User ID
 */
export async function unregisterLiveActivityToken(userId) {
  try {
    const { error } = await supabase
      .from('live_activity_tokens')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('[LiveActivity] Failed to unregister token:', error);
      throw error;
    }

    console.log('[LiveActivity] Token unregistered for user:', userId);
    return true;
  } catch (error) {
    console.error('[LiveActivity] Error unregistering token:', error);
    throw error;
  }
}

/**
 * Calculate step rate per minute based on previous sync data
 * @param {number} currentSteps - Current step count
 * @param {number|null} lastSteps - Last synced step count
 * @param {string|null} lastSyncAt - Last sync timestamp
 * @returns {number} Steps per minute rate (capped at 200)
 */
function calculateStepRate(currentSteps, lastSteps, lastSyncAt) {
  if (!lastSteps || !lastSyncAt) {
    return 0;
  }

  const now = Date.now();
  const lastTime = new Date(lastSyncAt).getTime();
  const minutesElapsed = (now - lastTime) / 60000;

  // Need at least 30 seconds between updates for meaningful rate
  if (minutesElapsed < 0.5) {
    return 0;
  }

  const stepDelta = currentSteps - lastSteps;

  // Only return positive rates
  if (stepDelta <= 0) {
    return 0;
  }

  const rate = stepDelta / minutesElapsed;
  // Cap at 200 steps/min (very fast running pace)
  return Math.min(rate, 200);
}

/**
 * Update a user's Live Activity with new step data
 * @param {string} userId - User ID
 * @param {number} currentSteps - Current step count
 * @param {number} goalSteps - Step goal
 */
export async function updateUserSteps(userId, currentSteps, goalSteps) {
  try {
    const pushToken = await getLiveActivityToken(userId);

    if (!pushToken) {
      console.log('[LiveActivity] No token found for user:', userId);
      return false;
    }

    // Get previous sync data for step rate calculation
    const { data: prevData } = await supabase
      .from('live_activity_tokens')
      .select('last_steps, last_sync_at')
      .eq('user_id', userId)
      .single();

    const progressPercentage = goalSteps > 0
      ? Math.min(Math.round((currentSteps / goalSteps) * 100), 100)
      : 0;
    const isGoalReached = currentSteps >= goalSteps;

    // Calculate step rate based on previous sync
    const stepRatePerMinute = calculateStepRate(
      currentSteps,
      prevData?.last_steps,
      prevData?.last_sync_at
    );

    const contentState = {
      currentSteps,
      goalSteps,
      progressPercentage,
      isGoalReached,
      stepRatePerMinute,
      lastSyncTimestamp: Date.now() / 1000, // Unix timestamp in seconds
    };

    // Store steps in DB first (so we don't lose data if push fails)
    const { error: dbError } = await supabase
      .from('live_activity_tokens')
      .update({
        last_steps: currentSteps,
        last_goal: goalSteps,
        last_sync_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (dbError) {
      console.error('[LiveActivity] Failed to update DB:', dbError);
    } else {
      console.log('[LiveActivity] DB updated: steps=', currentSteps, 'goal=', goalSteps, 'rate=', stepRatePerMinute.toFixed(1), 'steps/min');
    }

    // Then send push (may fail but DB is already updated)
    await sendLiveActivityUpdate(pushToken, contentState);

    return true;
  } catch (error) {
    console.error('[LiveActivity] Failed to update user steps:', error);
    return false;
  }
}

/**
 * Check if APNs is properly configured
 */
export function isConfigured() {
  return !!(TEAM_ID && KEY_ID && AUTH_KEY);
}

/**
 * Send a native APNs silent push notification to wake the app
 * This bypasses Expo and goes directly to Apple's servers
 * @param {string} deviceToken - The native iOS device token (hex string)
 * @param {object} data - Optional data payload
 */
export async function sendSilentPush(deviceToken, data = {}) {
  return new Promise((resolve, reject) => {
    try {
      const token = generateAPNsToken();

      const client = http2.connect(`https://${APNS_HOST}`);

      client.on('error', (err) => {
        console.error('[LiveActivity] Silent push HTTP/2 connection error:', err);
        reject(err);
      });

      // APNs silent push payload - content-available wakes the app
      const payload = JSON.stringify({
        aps: {
          'content-available': 1,
        },
        action: 'sync_steps',
        timestamp: Date.now(),
        ...data,
      });

      const headers = {
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        'authorization': `bearer ${token}`,
        'apns-topic': BUNDLE_ID, // Regular push topic (not liveactivity)
        'apns-push-type': 'background',
        'apns-priority': '5', // Use 5 for silent push (10 is for visible notifications)
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      };

      const req = client.request(headers);

      let responseData = '';

      req.on('response', (headers) => {
        const status = headers[':status'];
        console.log('[LiveActivity] Silent push response status:', status);
        console.log('[LiveActivity] Silent push response headers:', JSON.stringify(headers));
        if (status === 200) {
          console.log('[LiveActivity] Silent push sent successfully');
          resolve({ success: true });
        } else {
          console.error('[LiveActivity] Silent push failed with status:', status);
        }
      });

      req.on('data', (chunk) => {
        responseData += chunk;
      });

      req.on('end', () => {
        client.close();
        if (responseData) {
          console.log('[LiveActivity] Silent push response body:', responseData);
          try {
            const parsed = JSON.parse(responseData);
            if (parsed.reason) {
              console.error('[LiveActivity] APNs silent push error:', parsed.reason);
              reject(new Error(`APNs error: ${parsed.reason}`));
            }
          } catch (e) {
            // Response wasn't JSON, that's ok
          }
        }
      });

      req.on('error', (err) => {
        console.error('[LiveActivity] Silent push request error:', err);
        reject(err);
      });

      req.write(payload);
      req.end();

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Register a native iOS device token for silent push
 * Updates the existing row (must have push_token already registered)
 * @param {string} userId - User ID
 * @param {string} deviceToken - Native iOS device token (hex string)
 */
export async function registerDeviceToken(userId, deviceToken) {
  try {
    // Update existing row with device token (don't upsert to avoid NOT NULL constraint)
    const { error } = await supabase
      .from('live_activity_tokens')
      .update({
        device_token: deviceToken,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('[LiveActivity] Failed to register device token:', error);
      throw error;
    }

    console.log('[LiveActivity] Device token registered for user:', userId);
    return true;
  } catch (error) {
    console.error('[LiveActivity] Error registering device token:', error);
    throw error;
  }
}

/**
 * Send silent push to all users with device tokens
 */
export async function sendSilentPushToAllUsers() {
  try {
    const { data: tokens, error } = await supabase
      .from('live_activity_tokens')
      .select('user_id, device_token')
      .not('device_token', 'is', null);

    if (error) {
      console.error('[LiveActivity] Error fetching device tokens:', error);
      return { success: 0, failed: 0 };
    }

    if (!tokens || tokens.length === 0) {
      console.log('[LiveActivity] No device tokens found');
      return { success: 0, failed: 0 };
    }

    console.log(`[LiveActivity] Sending silent push to ${tokens.length} devices...`);

    let successCount = 0;
    let failCount = 0;

    for (const token of tokens) {
      try {
        await sendSilentPush(token.device_token);
        successCount++;
      } catch (err) {
        console.error(`[LiveActivity] Failed to send silent push to user ${token.user_id}:`, err.message);
        failCount++;
      }
    }

    return { success: successCount, failed: failCount };
  } catch (error) {
    console.error('[LiveActivity] Error in sendSilentPushToAllUsers:', error);
    return { success: 0, failed: 0 };
  }
}

/**
 * Live Activity Cron Service
 *
 * Uses "perceived performance" strategy with UI interpolation.
 * Instead of frequent server pushes, we push every 10 minutes (or on 500+ step delta)
 * while the widget UI interpolates steps locally between updates.
 *
 * Smart Triggers (whichever comes first):
 * 1. Time-based: Every 10 minutes
 * 2. Delta-based: When steps change by 500+
 *
 * The widget receives stepRatePerMinute and uses TimelineView to
 * smoothly increment the displayed count between pushes.
 */

import cron from 'node-cron';
import { supabase } from '../config/supabase.js';
import { sendLiveActivityUpdate, isConfigured, sendSilentPushToAllUsers } from './liveActivityService.js';

let smartUpdateCronJob = null;    // Smart push every 10 min (with delta check)
let silentPushCronJob = null;     // Silent push to refresh cache (every 15 min)

/**
 * Calculate step rate per minute
 */
function calculateStepRate(currentSteps, lastSteps, lastSyncAt) {
  if (!lastSteps || !lastSyncAt) {
    return 0;
  }

  const now = Date.now();
  const lastTime = new Date(lastSyncAt).getTime();
  const minutesElapsed = (now - lastTime) / 60000;

  if (minutesElapsed < 0.5) {
    return 0;
  }

  const stepDelta = currentSteps - lastSteps;
  if (stepDelta <= 0) {
    return 0;
  }

  const rate = stepDelta / minutesElapsed;
  return Math.min(rate, 200); // Cap at 200 steps/min
}

/**
 * Check if date is from today
 */
function isFromToday(dateString) {
  if (!dateString) return false;
  const syncDate = new Date(dateString);
  const today = new Date();
  return syncDate.toDateString() === today.toDateString();
}

/**
 * Push reset to widget for new day (0 steps)
 */
async function pushResetToWidget(token) {
  const contentState = {
    currentSteps: 0,
    goalSteps: token.last_goal || 10000,
    progressPercentage: 0,
    isGoalReached: false,
    stepRatePerMinute: 0,
    lastSyncTimestamp: Date.now() / 1000,
  };

  try {
    await sendLiveActivityUpdate(token.push_token, contentState);
    console.log(`[LiveActivityCron] Reset widget to 0 for user ${token.user_id}`);

    // Update DB to reflect the reset
    const { error: dbError } = await supabase
      .from('live_activity_tokens')
      .update({
        last_pushed_steps: 0,
        last_push_at: new Date().toISOString(),
      })
      .eq('user_id', token.user_id);

    if (dbError) {
      console.error(`[LiveActivityCron] Failed to update DB after reset for user ${token.user_id}:`, dbError);
    }

    return true;
  } catch (err) {
    console.error(`[LiveActivityCron] Failed to reset widget for user ${token.user_id}:`, err.message);

    // Delete row with invalid/expired tokens to prevent re-registration cycle
    if (err.message.includes('BadDeviceToken') || err.message.includes('Unregistered') || err.message.includes('ExpiredToken')) {
      console.log(`[LiveActivityCron] Deleting expired token row for user ${token.user_id}`);
      const { error: deleteError } = await supabase
        .from('live_activity_tokens')
        .delete()
        .eq('user_id', token.user_id);

      if (deleteError) {
        console.error(`[LiveActivityCron] Failed to delete token for user ${token.user_id}:`, deleteError);
      }
    }
    return false;
  }
}

/**
 * Push update to widget with step rate for interpolation
 */
async function pushUpdateToWidget(token) {
  const { push_token, last_steps, last_goal, last_pushed_steps, last_push_at, last_sync_at } = token;

  const goalSteps = last_goal || 10000;
  const currentSteps = last_steps || 0;
  const progressPercentage = goalSteps > 0
    ? Math.min(Math.round((currentSteps / goalSteps) * 100), 100)
    : 0;
  const isGoalReached = currentSteps >= goalSteps;

  // Calculate step rate from recent history
  const stepRatePerMinute = calculateStepRate(currentSteps, last_pushed_steps, last_push_at);

  const contentState = {
    currentSteps,
    goalSteps,
    progressPercentage,
    isGoalReached,
    stepRatePerMinute,
    lastSyncTimestamp: Date.now() / 1000,
  };

  try {
    await sendLiveActivityUpdate(push_token, contentState);
    console.log(`[LiveActivityCron] Updated widget for user ${token.user_id}: ${currentSteps} steps, rate=${stepRatePerMinute.toFixed(1)}/min`);

    // Update pushed tracking
    const { error: dbError } = await supabase
      .from('live_activity_tokens')
      .update({
        last_pushed_steps: currentSteps,
        last_push_at: new Date().toISOString(),
      })
      .eq('user_id', token.user_id);

    if (dbError) {
      console.error(`[LiveActivityCron] Failed to update push tracking for user ${token.user_id}:`, dbError);
    }

    return true;
  } catch (err) {
    console.error(`[LiveActivityCron] Failed to update widget for user ${token.user_id}:`, err.message);

    // Delete row with invalid/expired tokens to prevent re-registration cycle
    // (silent push would wake app → app re-registers expired token → infinite loop)
    if (err.message.includes('BadDeviceToken') || err.message.includes('Unregistered') || err.message.includes('ExpiredToken')) {
      console.log(`[LiveActivityCron] Deleting expired token row for user ${token.user_id}`);
      const { error: deleteError } = await supabase
        .from('live_activity_tokens')
        .delete()
        .eq('user_id', token.user_id);

      if (deleteError) {
        console.error(`[LiveActivityCron] Failed to delete token for user ${token.user_id}:`, deleteError);
      }
    }
    return false;
  }
}

/**
 * Smart update with freshness check and delta-based triggers
 */
async function updateWithSmartTriggers() {
  if (!isConfigured()) {
    console.log('[LiveActivityCron] APNs not configured, skipping update');
    return;
  }

  try {
    // Get all users with active Live Activity tokens
    const { data: tokens, error } = await supabase
      .from('live_activity_tokens')
      .select('user_id, push_token, last_steps, last_goal, last_sync_at, last_pushed_steps, last_push_at')
      .not('push_token', 'is', null);

    if (error) {
      console.error('[LiveActivityCron] Error fetching tokens:', error);
      return;
    }

    if (!tokens || tokens.length === 0) {
      console.log('[LiveActivityCron] No active Live Activity tokens');
      return;
    }

    console.log(`[LiveActivityCron] Checking ${tokens.length} users for smart updates...`);

    let updated = 0;
    let reset = 0;
    let skipped = 0;

    for (const token of tokens) {
      // CRITICAL: Freshness check - only push if data is from TODAY
      if (!isFromToday(token.last_sync_at)) {
        console.log(`[LiveActivityCron] Stale data for user ${token.user_id} (last sync: ${token.last_sync_at}) - resetting to 0`);
        const success = await pushResetToWidget(token);
        if (success) reset++;
        continue;
      }

      // Skip if no step data
      if (token.last_steps === null || token.last_steps === undefined) {
        skipped++;
        continue;
      }

      // Smart trigger calculation
      const stepDelta = Math.abs((token.last_steps || 0) - (token.last_pushed_steps || 0));
      const minutesSincePush = token.last_push_at
        ? (Date.now() - new Date(token.last_push_at).getTime()) / 60000
        : 999;

      // Smart trigger: 10 min elapsed OR 500+ step change
      const shouldPush = minutesSincePush >= 10 || stepDelta >= 500;

      if (shouldPush) {
        console.log(`[LiveActivityCron] Pushing update for user ${token.user_id} (delta=${stepDelta}, mins=${minutesSincePush.toFixed(1)})`);
        const success = await pushUpdateToWidget(token);
        if (success) updated++;
      } else {
        skipped++;
      }
    }

    console.log(`[LiveActivityCron] Smart update complete: ${updated} updated, ${reset} reset, ${skipped} skipped`);
  } catch (error) {
    console.error('[LiveActivityCron] Error in updateWithSmartTriggers:', error);
  }
}

/**
 * Send native APNs silent push to wake apps and trigger fresh HealthKit sync
 */
async function triggerSilentSyncForAllUsers() {
  if (!isConfigured()) {
    console.log('[LiveActivityCron] APNs not configured, skipping silent push');
    return;
  }

  console.log('[LiveActivityCron] Sending native APNs silent push to all users...');
  const result = await sendSilentPushToAllUsers();
  console.log(`[LiveActivityCron] Silent push complete: ${result.success} success, ${result.failed} failed`);
}

/**
 * Start the Live Activity cron jobs
 * - Smart update: Every 10 minutes (with delta-based early triggers)
 * - Silent push: Every 15 minutes (wakes app to refresh cache from HealthKit)
 */
export function startLiveActivityCron() {
  if (smartUpdateCronJob && silentPushCronJob) {
    console.log('[LiveActivityCron] Cron jobs already running');
    return;
  }

  console.log('[LiveActivityCron] Starting smart cron jobs...');

  // Cron 1: Smart update every 10 minutes
  // Uses interpolation + delta triggers for perceived real-time updates
  smartUpdateCronJob = cron.schedule('*/10 * * * *', async () => {
    console.log('[LiveActivityCron] Running smart update check...');
    await updateWithSmartTriggers();
  });
  console.log('[LiveActivityCron] Smart update cron started (every 10 min)');

  // Cron 2: Send silent push every 15 minutes to refresh HealthKit cache
  silentPushCronJob = cron.schedule('*/15 * * * *', async () => {
    console.log('[LiveActivityCron] Sending silent push to refresh cache...');
    await triggerSilentSyncForAllUsers();
  });
  console.log('[LiveActivityCron] Silent push cron started (every 15 min)');

  console.log('[LiveActivityCron] Both cron jobs started successfully');
}

/**
 * Stop the Live Activity cron jobs
 */
export function stopLiveActivityCron() {
  if (smartUpdateCronJob) {
    smartUpdateCronJob.stop();
    smartUpdateCronJob = null;
    console.log('[LiveActivityCron] Smart update cron stopped');
  }
  if (silentPushCronJob) {
    silentPushCronJob.stop();
    silentPushCronJob = null;
    console.log('[LiveActivityCron] Silent push cron stopped');
  }
}

/**
 * Manually trigger a smart update (for testing)
 */
export async function triggerManualUpdate() {
  console.log('[LiveActivityCron] Manual smart update triggered');
  await updateWithSmartTriggers();
}

/**
 * Manually trigger silent sync (for testing)
 */
export async function triggerManualSilentSync() {
  console.log('[LiveActivityCron] Manual silent sync triggered');
  await triggerSilentSyncForAllUsers();
}

/**
 * Legacy function for compatibility
 */
export async function updateAllLiveActivities() {
  console.log('[LiveActivityCron] updateAllLiveActivities called, redirecting to smart update');
  await updateWithSmartTriggers();
}

export default {
  startLiveActivityCron,
  stopLiveActivityCron,
  triggerManualUpdate,
  triggerManualSilentSync,
  updateAllLiveActivities,
};

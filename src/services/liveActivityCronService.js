/**
 * Live Activity Cron Service
 *
 * Periodically sends silent push notifications to wake the app and trigger
 * fresh HealthKit sync. This ensures Live Activity widgets show accurate data
 * even when the app isn't running.
 *
 * Flow:
 * 1. Cron runs every 5 minutes
 * 2. Sends silent push to all users with active Live Activity tokens
 * 3. App wakes up, reads HealthKit, syncs to backend
 * 4. Sync endpoint sends Live Activity push with fresh data
 */

import cron from 'node-cron';
import { supabase } from '../config/supabase.js';
import { sendLiveActivityUpdate, isConfigured, sendSilentPushToAllUsers } from './liveActivityService.js';

let liveActivityCronJob = null;

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
 * Update all active Live Activity widgets with their last synced data
 * (Fallback for when silent push doesn't work or APNs is configured)
 */
async function updateAllLiveActivities() {
  if (!isConfigured()) {
    console.log('[LiveActivityCron] APNs not configured, skipping Live Activity push');
    return;
  }

  try {
    // Get all users with active Live Activity tokens and recent syncs
    const { data: tokens, error } = await supabase
      .from('live_activity_tokens')
      .select('user_id, push_token, last_steps, last_goal, last_sync_at')
      .not('push_token', 'is', null)
      .not('last_steps', 'is', null);

    if (error) {
      console.error('[LiveActivityCron] Error fetching tokens:', error);
      return;
    }

    if (!tokens || tokens.length === 0) {
      console.log('[LiveActivityCron] No active Live Activity tokens to update');
      return;
    }

    console.log(`[LiveActivityCron] Updating ${tokens.length} Live Activity widgets with cached data...`);

    let successCount = 0;
    let failCount = 0;

    for (const token of tokens) {
      try {
        const { push_token, last_steps, last_goal } = token;

        // Calculate progress
        const goalSteps = last_goal || 10000;
        const currentSteps = last_steps || 0;
        const progressPercentage = goalSteps > 0
          ? Math.min(Math.round((currentSteps / goalSteps) * 100), 100)
          : 0;
        const isGoalReached = currentSteps >= goalSteps;

        const contentState = {
          currentSteps,
          goalSteps,
          progressPercentage,
          isGoalReached,
        };

        await sendLiveActivityUpdate(push_token, contentState);
        successCount++;
      } catch (err) {
        console.error(`[LiveActivityCron] Failed to update widget for user ${token.user_id}:`, err.message);
        failCount++;

        // If token is invalid, consider removing it
        if (err.message.includes('BadDeviceToken') || err.message.includes('Unregistered')) {
          console.log(`[LiveActivityCron] Removing invalid token for user ${token.user_id}`);
          await supabase
            .from('live_activity_tokens')
            .delete()
            .eq('user_id', token.user_id);
        }
      }
    }

    console.log(`[LiveActivityCron] Update complete: ${successCount} success, ${failCount} failed`);
  } catch (error) {
    console.error('[LiveActivityCron] Error in updateAllLiveActivities:', error);
  }
}

/**
 * Start the Live Activity cron job
 * @param {string} schedule - Cron schedule (default: every 15 minutes)
 */
export function startLiveActivityCron(schedule = '*/3 * * * *') {
  if (liveActivityCronJob) {
    console.log('[LiveActivityCron] Cron job already running');
    return;
  }

  console.log(`[LiveActivityCron] Starting cron job with schedule: ${schedule}`);

  liveActivityCronJob = cron.schedule(schedule, async () => {
    console.log('[LiveActivityCron] Running scheduled update...');

    // Send silent push to wake apps and trigger HealthKit sync
    // The app will read HealthKit, sync to backend, and backend will push fresh data
    // We do NOT push cached data as fallback - that would overwrite with stale steps
    await triggerSilentSyncForAllUsers();
  });

  console.log('[LiveActivityCron] Cron job started successfully');
}

/**
 * Stop the Live Activity cron job
 */
export function stopLiveActivityCron() {
  if (liveActivityCronJob) {
    liveActivityCronJob.stop();
    liveActivityCronJob = null;
    console.log('[LiveActivityCron] Cron job stopped');
  }
}

/**
 * Manually trigger an update (for testing)
 */
export async function triggerManualUpdate() {
  console.log('[LiveActivityCron] Manual update triggered');
  await updateAllLiveActivities();
}

/**
 * Manually trigger silent sync (for testing)
 */
export async function triggerManualSilentSync() {
  console.log('[LiveActivityCron] Manual silent sync triggered');
  await triggerSilentSyncForAllUsers();
}

export default {
  startLiveActivityCron,
  stopLiveActivityCron,
  triggerManualUpdate,
  triggerManualSilentSync,
};

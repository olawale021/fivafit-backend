/**
 * Live Activity Routes
 *
 * Handles iOS Live Activity (Dynamic Island/Lock Screen) push token registration
 * and step data syncing for real-time widget updates
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as liveActivityService from '../services/liveActivityService.js';

const router = express.Router();

/**
 * POST /api/live-activity/register
 * Register a Live Activity push token for the authenticated user
 */
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { pushToken, deviceToken, platform } = req.body;

    if (!pushToken) {
      return res.status(400).json({ error: 'pushToken is required' });
    }

    if (platform !== 'ios') {
      return res.status(400).json({ error: 'Live Activities are only supported on iOS' });
    }

    // Register Live Activity token
    await liveActivityService.registerLiveActivityToken(userId, pushToken);

    // Also register native device token for silent push (if provided)
    if (deviceToken) {
      await liveActivityService.registerDeviceToken(userId, deviceToken);
      console.log('[LiveActivity] Device token also registered for user:', userId);
    }

    res.json({
      success: true,
      message: 'Live Activity token registered successfully',
    });
  } catch (error) {
    console.error('[LiveActivity] Register error:', error);
    res.status(500).json({ error: 'Failed to register Live Activity token' });
  }
});

/**
 * POST /api/live-activity/unregister
 * Remove the Live Activity push token for the authenticated user
 */
router.post('/unregister', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    await liveActivityService.unregisterLiveActivityToken(userId);

    res.json({
      success: true,
      message: 'Live Activity token unregistered successfully',
    });
  } catch (error) {
    console.error('[LiveActivity] Unregister error:', error);
    res.status(500).json({ error: 'Failed to unregister Live Activity token' });
  }
});

/**
 * POST /api/live-activity/sync-steps
 * Sync step data and push update to the user's Live Activity widget
 */
router.post('/sync-steps', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentSteps, goalSteps } = req.body;

    if (typeof currentSteps !== 'number' || typeof goalSteps !== 'number') {
      return res.status(400).json({ error: 'currentSteps and goalSteps are required as numbers' });
    }

    const success = await liveActivityService.updateUserSteps(userId, currentSteps, goalSteps);

    if (!success) {
      // No token registered or push failed - not a critical error
      return res.json({
        success: false,
        message: 'No Live Activity registered or update failed',
      });
    }

    res.json({
      success: true,
      message: 'Steps synced and widget updated',
    });
  } catch (error) {
    console.error('[LiveActivity] Sync steps error:', error);
    res.status(500).json({ error: 'Failed to sync steps' });
  }
});

/**
 * GET /api/live-activity/status
 * Check if Live Activity is configured and get status
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const isConfigured = liveActivityService.isConfigured();
    const token = await liveActivityService.getLiveActivityToken(userId);

    res.json({
      configured: isConfigured,
      hasToken: !!token,
      message: isConfigured
        ? 'Live Activity service is ready'
        : 'APNs not configured. Set APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_AUTH_KEY environment variables.',
    });
  } catch (error) {
    console.error('[LiveActivity] Status error:', error);
    res.status(500).json({ error: 'Failed to get Live Activity status' });
  }
});

/**
 * POST /api/live-activity/trigger-sync
 * Manually trigger a native APNs silent push to sync steps (for testing)
 * Sends a silent push notification to wake the app and sync HealthKit data
 */
router.post('/trigger-sync', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Import dependencies
    const { sendSilentPush } = await import('../services/liveActivityService.js');
    const { supabase } = await import('../config/supabase.js');

    // Get the device token for this user
    const { data: userData, error } = await supabase
      .from('live_activity_tokens')
      .select('device_token')
      .eq('user_id', userId)
      .single();

    if (error || !userData?.device_token) {
      return res.json({
        success: false,
        message: 'No device token found. Make sure app registered the native device token.',
      });
    }

    console.log(`[LiveActivity] Triggering native APNs silent push for user ${userId}`);
    console.log(`[LiveActivity] Device token: ${userData.device_token.substring(0, 20)}...`);

    await sendSilentPush(userData.device_token);

    res.json({
      success: true,
      message: 'Native APNs silent push sent - check Xcode console for [AppDelegate] logs',
    });
  } catch (error) {
    console.error('[LiveActivity] Trigger sync error:', error);
    res.status(500).json({ error: 'Failed to trigger sync: ' + error.message });
  }
});

export default router;

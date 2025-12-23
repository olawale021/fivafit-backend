/**
 * User Activity Controller
 * Handles user activity tracking endpoints
 */

import { supabase } from '../config/supabase.js'

/**
 * Track app open
 * POST /api/user-activity/app-open
 */
export const trackAppOpen = async (req, res) => {
  try {
    const userId = req.user.id; // From auth middleware
    const now = new Date().toISOString();

    // Check if record exists
    const { data: existing } = await supabase
      .from('user_activity')
      .select('*')
      .eq('user_id', userId)
      .single();

    let result;

    if (existing) {
      // Update existing record
      result = await supabase
        .from('user_activity')
        .update({
          last_app_open: now,
          app_open_count: existing.app_open_count + 1,
          updated_at: now
        })
        .eq('user_id', userId)
        .select()
        .single();
    } else {
      // Insert new record
      result = await supabase
        .from('user_activity')
        .insert({
          user_id: userId,
          last_app_open: now,
          app_open_count: 1
        })
        .select()
        .single();
    }

    if (result.error) {
      throw result.error;
    }

    res.json({
      success: true,
      message: 'App open tracked successfully',
      data: result.data
    });
  } catch (error) {
    console.error('Error tracking app open:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track app open',
      error: error.message
    });
  }
};

/**
 * Track workout completion
 * POST /api/user-activity/workout-complete
 */
export const trackWorkoutComplete = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date().toISOString();

    // Check if record exists
    const { data: existing } = await supabase
      .from('user_activity')
      .select('*')
      .eq('user_id', userId)
      .single();

    let result;

    if (existing) {
      // Update existing record
      result = await supabase
        .from('user_activity')
        .update({
          last_workout_date: now,
          last_app_open: now,
          updated_at: now
        })
        .eq('user_id', userId)
        .select()
        .single();
    } else {
      // Insert new record
      result = await supabase
        .from('user_activity')
        .insert({
          user_id: userId,
          last_workout_date: now,
          last_app_open: now
        })
        .select()
        .single();
    }

    if (result.error) {
      throw result.error;
    }

    res.json({
      success: true,
      message: 'Workout completion tracked successfully',
      data: result.data
    });
  } catch (error) {
    console.error('Error tracking workout completion:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track workout completion',
      error: error.message
    });
  }
};

/**
 * Get user activity stats
 * GET /api/user-activity/stats
 */
export const getUserActivityStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: activity, error } = await supabase
      .from('user_activity')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw error;
    }

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: 'No activity data found'
      });
    }

    // Calculate days since last app open
    const daysSinceAppOpen = activity.last_app_open
      ? Math.floor((Date.now() - new Date(activity.last_app_open).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // Calculate days since last workout
    const daysSinceWorkout = activity.last_workout_date
      ? Math.floor((Date.now() - new Date(activity.last_workout_date).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    res.json({
      success: true,
      data: {
        ...activity,
        daysSinceAppOpen,
        daysSinceWorkout
      }
    });
  } catch (error) {
    console.error('Error fetching user activity stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity stats',
      error: error.message
    });
  }
};

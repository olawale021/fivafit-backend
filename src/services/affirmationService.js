/**
 * Affirmation Service
 * Business logic for affirmation generation and delivery
 */

import { supabase } from '../config/supabase.js'
import { dailyAffirmations } from '../content/affirmations/daily.js'
import { reengagementMessages } from '../content/affirmations/reengagement.js'
import { noPlanMessages } from '../content/affirmations/no-plan.js'
import {
  personalizeMessage,
  getEligibleTemplates,
  selectRandomTemplate
} from '../content/affirmations/utils.js'

/**
 * Get user context data for personalization
 */
export async function getUserContext(userId) {
  try {
    // Fetch user's streak and comeback count
    const { data: streakData } = await supabase
      .from('user_streaks')
      .select('current_streak, comeback_count')
      .eq('user_id', userId)
      .single();

    // Fetch recent workouts (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { count: recentWorkoutsCount } = await supabase
      .from('workouts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('created_at', sevenDaysAgo.toISOString());

    // Fetch last workout date
    const { data: lastWorkoutData } = await supabase
      .from('workouts')
      .select('created_at')
      .eq('user_id', userId)
      .eq('completed', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Fetch user activity
    const { data: activityData } = await supabase
      .from('user_activity')
      .select('last_app_open, last_workout_date')
      .eq('user_id', userId)
      .single();

    // Calculate days since last workout
    let daysSinceLastWorkout = 999;
    if (lastWorkoutData) {
      const lastWorkout = new Date(lastWorkoutData.created_at);
      const now = new Date();
      daysSinceLastWorkout = Math.floor((now - lastWorkout) / (1000 * 60 * 60 * 24));
    }

    // Calculate days since last app open
    let daysSinceLastAppOpen = 999;
    if (activityData?.last_app_open) {
      const lastOpen = new Date(activityData.last_app_open);
      const now = new Date();
      daysSinceLastAppOpen = Math.floor((now - lastOpen) / (1000 * 60 * 60 * 24));
    }

    return {
      userId,
      streak: streakData?.current_streak || 0,
      comebackCount: streakData?.comeback_count || 0,
      recentWorkoutsCount: recentWorkoutsCount || 0,
      lastVictory: undefined, // TODO: Implement victory tracking
      daysSinceLastWorkout,
      daysSinceLastAppOpen
    };
  } catch (error) {
    console.error('Error getting user context:', error);
    return {
      userId,
      streak: 0,
      comebackCount: 0,
      recentWorkoutsCount: 0,
      daysSinceLastWorkout: 999,
      daysSinceLastAppOpen: 999
    };
  }
}

/**
 * Generate personalized affirmation
 */
export async function generateAffirmation(userId, type, scheduledFor = new Date()) {
  try {
    const userContext = await getUserContext(userId);

    let templates;
    if (type === 'daily') {
      templates = dailyAffirmations;
    } else if (type === 're_engagement') {
      templates = reengagementMessages;
    } else if (type === 'no_plan') {
      templates = noPlanMessages;
    } else {
      templates = dailyAffirmations;
    }

    // Filter templates based on available context (skip for no_plan messages)
    let finalTemplates;
    if (type === 'no_plan') {
      finalTemplates = templates;
    } else {
      const eligible = getEligibleTemplates(templates, userContext);
      finalTemplates = eligible.length > 0 ? eligible : templates;
    }

    // Select random template
    const selected = selectRandomTemplate(finalTemplates);

    if (!selected) {
      throw new Error('No affirmation template found');
    }

    // Personalize message (no_plan messages don't need personalization)
    const personalizedText = type === 'no_plan'
      ? selected.text
      : personalizeMessage(selected.text, userContext);

    // Save to database
    const { data, error } = await supabase
      .from('affirmations')
      .insert({
        user_id: userId,
        affirmation_type: type,
        affirmation_id: selected.id,
        affirmation_text: personalizedText,
        context_data: userContext,
        scheduled_for: scheduledFor.toISOString(),
        delivery_status: 'pending'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      ...data,
      context_data: userContext
    };
  } catch (error) {
    console.error('Error generating affirmation:', error);
    throw error;
  }
}

/**
 * Mark affirmations as sent
 */
export async function markAsSent(affirmationIds) {
  try {
    const { error } = await supabase
      .from('affirmations')
      .update({
        sent_at: new Date().toISOString(),
        delivery_status: 'sent'
      })
      .in('id', affirmationIds);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error marking affirmations as sent:', error);
    throw error;
  }
}

/**
 * Get all users who need daily affirmations scheduled
 */
export async function getUsersForDailyAffirmations() {
  try {
    const { data, error } = await supabase
      .from('affirmation_schedule')
      .select('user_id, morning_time, evening_time, timezone, last_morning_sent, last_evening_sent')
      .eq('enabled', true);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching users for daily affirmations:', error);
    return [];
  }
}

/**
 * Get inactive users (2+ days since last app open)
 */
export async function getInactiveUsers() {
  try {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const { data, error } = await supabase
      .from('user_activity')
      .select('user_id')
      .lt('last_app_open', twoDaysAgo.toISOString());

    if (error) {
      throw error;
    }

    return (data || []).map(row => row.user_id);
  } catch (error) {
    console.error('Error fetching inactive users:', error);
    return [];
  }
}

/**
 * Get users without active workout plans
 */
export async function getUsersWithoutActivePlan() {
  try {
    // Get all users who have affirmations enabled
    const { data: enabledUsers, error: schedError } = await supabase
      .from('affirmation_schedule')
      .select('user_id')
      .eq('enabled', true);

    if (schedError || !enabledUsers) {
      return [];
    }

    const userIds = enabledUsers.map(u => u.user_id);
    const usersWithoutPlan = [];

    // Check each user for active workout plans
    for (const userId of userIds) {
      const { data: plans, error: planError } = await supabase
        .from('workout_plans')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true);

      // If no active plans, add to list
      if (!planError && (!plans || plans.length === 0)) {
        usersWithoutPlan.push(userId);
      }
    }

    return usersWithoutPlan;
  } catch (error) {
    console.error('Error fetching users without active plan:', error);
    return [];
  }
}

/**
 * Check if no-plan notification was sent today
 */
export async function wasNoPlanSentToday(userId) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const { data, error } = await supabase
      .from('affirmations')
      .select('id')
      .eq('user_id', userId)
      .eq('affirmation_type', 'no_plan')
      .gte('sent_at', `${today}T00:00:00`)
      .lt('sent_at', `${today}T23:59:59`)
      .limit(1);

    if (error) {
      throw error;
    }

    return data && data.length > 0;
  } catch (error) {
    console.error('Error checking no-plan notification:', error);
    return false;
  }
}

/**
 * Check if re-engagement was recently sent
 */
export async function wasReengagementRecentlySent(userId, withinDays = 2) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - withinDays);

    const { data, error } = await supabase
      .from('affirmations')
      .select('id')
      .eq('user_id', userId)
      .eq('affirmation_type', 're_engagement')
      .gte('sent_at', cutoffDate.toISOString())
      .limit(1);

    if (error) {
      throw error;
    }

    return data && data.length > 0;
  } catch (error) {
    console.error('Error checking recent re-engagement:', error);
    return false;
  }
}

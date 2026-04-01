import * as workoutPlannerService from '../services/workoutPlannerService.js';
import generationJobService from '../services/generationJobService.js';
import { supabase } from '../config/supabase.js';

// ============================================================================
// WORKOUT PLAN GENERATION
// ============================================================================

/**
 * Generate the first plan for a new user (no premium required).
 * Only works if user has zero existing plans — prevents abuse.
 */
export async function generateFirstPlan(req, res) {
  try {
    const userId = req.user.id;
    const {
      fitness_goals,
      target_body_parts,
      days_per_week,
      hours_per_session,
      selected_days
    } = req.body;

    // Check user has NEVER had a plan (not just currently 0 — count all including deleted)
    const { count } = await supabase
      .from('workout_plans')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (count && count > 0) {
      return res.status(403).json({ error: 'Free plan already used. Upgrade to premium to generate more plans.' });
    }

    if (!fitness_goals?.length) return res.status(400).json({ error: 'fitness_goals is required' });
    if (!target_body_parts?.length) return res.status(400).json({ error: 'target_body_parts is required' });

    console.log(`🤖 Generating first plan for new user ${userId}...`);

    const plan = await workoutPlannerService.generateWeeklyPlan({
      userId,
      fitness_goals,
      target_body_parts,
      days_per_week: days_per_week || 3,
      hours_per_session: hours_per_session || 1,
      selected_days
    });

    console.log(`✅ First plan generated: ${plan.plan_name}`);

    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    console.error('Error generating first plan:', error);
    res.status(500).json({ error: error.message || 'Failed to generate plan' });
  }
}

/**
 * Generate a workout plan for onboarding (no auth required).
 * Creates a plan with a temp_id. After login, claim it with /claim-onboarding-plan.
 */
export async function generateOnboardingPlan(req, res) {
  try {
    const {
      temp_id,
      fitness_goals,
      target_body_parts,
      fitness_levels,
      days_per_week,
      hours_per_session,
      selected_days,
      selected_dates,
      // Profile data passed directly (user doesn't exist yet)
      gender,
      age,
      weight_kg,
      height_cm,
    } = req.body;

    if (!temp_id) return res.status(400).json({ error: 'temp_id is required' });
    if (!fitness_goals?.length) return res.status(400).json({ error: 'fitness_goals is required' });
    if (!target_body_parts?.length) return res.status(400).json({ error: 'target_body_parts is required' });

    console.log(`🤖 Generating onboarding plan (temp: ${temp_id})...`);

    // Use the temp_id itself as user_id — it's already a valid UUID
    // Will be reassigned to real user_id after login via claim endpoint
    const plan = await workoutPlannerService.generateWeeklyPlan({
      userId: temp_id,
      fitness_goals,
      target_body_parts,
      fitness_levels: fitness_levels || ['beginner'],
      days_per_week: days_per_week || 3,
      hours_per_session: hours_per_session || 1,
      selected_days,
      selected_dates,
      // Override user profile lookup with passed data
      userProfileOverride: {
        gender: gender || 'not specified',
        age: age || 25,
        weight_kg: weight_kg || 70,
        height_cm: height_cm || 170,
      },
    });

    console.log(`✅ Onboarding plan generated: ${plan.plan_name} (temp: ${temp_id})`);

    res.status(201).json({
      success: true,
      data: { plan_id: plan.id, temp_id, plan_name: plan.plan_name },
    });
  } catch (error) {
    console.error('Error generating onboarding plan:', error);
    res.status(500).json({ error: error.message || 'Failed to generate onboarding plan' });
  }
}

/**
 * Claim an onboarding plan — reassign from temp placeholder to real user.
 * Called after login.
 */
export async function claimOnboardingPlan(req, res) {
  try {
    const userId = req.user.id;
    const { temp_id } = req.body;

    if (!temp_id) return res.status(400).json({ error: 'temp_id is required' });

    // temp_id was used as user_id when generating — now reassign to real user
    const { data, error } = await supabase
      .from('workout_plans')
      .update({ user_id: userId, is_active: true })
      .eq('user_id', temp_id)
      .select('id, plan_name')
      .single();

    if (error) {
      console.error('Error claiming onboarding plan:', error);
      // Not critical — user can create a plan manually
      return res.status(404).json({ error: 'Onboarding plan not found or already claimed' });
    }

    // Also update daily_workouts user references
    await supabase
      .from('daily_workouts')
      .update({ user_id: userId })
      .eq('workout_plan_id', data.id);

    console.log(`✅ Onboarding plan claimed: ${data.plan_name} → user ${userId}`);

    res.json({ success: true, data: { plan_id: data.id, plan_name: data.plan_name } });
  } catch (error) {
    console.error('Error claiming onboarding plan:', error);
    res.status(500).json({ error: 'Failed to claim plan' });
  }
}

/**
 * Generate a new AI-powered workout plan
 */
export async function generateWorkoutPlan(req, res) {
  try {
    const userId = req.user.id;
    const {
      fitness_goals,
      target_body_parts,
      days_per_week,
      hours_per_session,
      selected_days
    } = req.body;

    // Validate required fields
    if (!fitness_goals || !Array.isArray(fitness_goals) || fitness_goals.length === 0) {
      return res.status(400).json({ error: 'fitness_goals is required and must be a non-empty array' });
    }

    if (!target_body_parts || !Array.isArray(target_body_parts) || target_body_parts.length === 0) {
      return res.status(400).json({ error: 'target_body_parts is required and must be a non-empty array' });
    }

    if (!days_per_week || days_per_week < 1 || days_per_week > 7) {
      return res.status(400).json({ error: 'days_per_week must be between 1 and 7' });
    }

    if (!hours_per_session || hours_per_session <= 0 || hours_per_session > 5) {
      return res.status(400).json({ error: 'hours_per_session must be between 0 and 5' });
    }

    console.log(`🤖 Generating AI workout plan for user ${userId}...`);

    // Generate plan using service
    const plan = await workoutPlannerService.generateWeeklyPlan({
      userId,
      fitness_goals,
      target_body_parts,
      days_per_week,
      hours_per_session,
      selected_days
    });

    console.log(`✅ Workout plan generated: ${plan.plan_name}`);

    res.status(201).json({
      success: true,
      data: plan
    });
  } catch (error) {
    console.error('Error generating workout plan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate workout plan'
    });
  }
}

/**
 * Generate a workout plan PREVIEW with exercise alternatives (does not save to database)
 */
export async function generatePlanPreview(req, res) {
  try {
    const userId = req.user.id;
    const {
      fitness_goals,
      target_body_parts,
      fitness_levels,
      days_per_week,
      hours_per_session,
      selected_days,
      selected_dates,
      start_date
    } = req.body;

    // Validate required fields
    if (!fitness_goals || !Array.isArray(fitness_goals) || fitness_goals.length === 0) {
      return res.status(400).json({ error: 'fitness_goals is required and must be a non-empty array' });
    }

    if (!target_body_parts || !Array.isArray(target_body_parts) || target_body_parts.length === 0) {
      return res.status(400).json({ error: 'target_body_parts is required and must be a non-empty array' });
    }

    if (!fitness_levels || !Array.isArray(fitness_levels) || fitness_levels.length === 0) {
      return res.status(400).json({ error: 'fitness_levels is required and must be a non-empty array' });
    }

    if (!days_per_week || days_per_week < 1 || days_per_week > 7) {
      return res.status(400).json({ error: 'days_per_week must be between 1 and 7' });
    }

    if (!hours_per_session || hours_per_session <= 0 || hours_per_session > 5) {
      return res.status(400).json({ error: 'hours_per_session must be between 0 and 5' });
    }

    console.log(`🔍 Generating plan preview for user ${userId}...`);

    // Generate preview with alternatives
    const planPreview = await workoutPlannerService.generatePlanPreview({
      userId,
      fitness_goals,
      target_body_parts,
      fitness_levels,
      days_per_week,
      hours_per_session,
      selected_days,
      selected_dates,
      start_date
    });

    console.log(`✅ Plan preview generated with alternatives`);

    res.status(200).json({
      success: true,
      data: planPreview
    });
  } catch (error) {
    console.error('Error generating plan preview:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate plan preview'
    });
  }
}

/**
 * Generate a workout plan ASYNC (returns job ID immediately, processes in background)
 * This allows users to minimize the app while generation continues
 */
export async function generatePlanAsync(req, res) {
  try {
    const userId = req.user.id;
    const requestData = req.body;

    // Validate required fields (same as generatePlanPreview)
    if (!requestData.fitness_goals || !Array.isArray(requestData.fitness_goals) || requestData.fitness_goals.length === 0) {
      return res.status(400).json({ error: 'fitness_goals is required and must be a non-empty array' });
    }

    if (!requestData.target_body_parts || !Array.isArray(requestData.target_body_parts) || requestData.target_body_parts.length === 0) {
      return res.status(400).json({ error: 'target_body_parts is required and must be a non-empty array' });
    }

    console.log(`🚀 Creating async generation job for user ${userId}...`);

    // Create job and start processing in background
    const job = await generationJobService.createJob(userId, requestData);

    res.status(202).json({
      success: true,
      data: {
        job_id: job.id,
        status: job.status,
        message: 'Generation started. You can minimize the app - we\'ll notify you when it\'s ready!'
      }
    });
  } catch (error) {
    console.error('Error creating generation job:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create generation job'
    });
  }
}

/**
 * Get status and result of a generation job
 */
export async function getGenerationJob(req, res) {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;

    const job = await generationJobService.getJob(jobId, userId);

    res.status(200).json({
      success: true,
      data: job
    });
  } catch (error) {
    console.error('Error getting generation job:', error);
    res.status(error.message === 'Job not found' ? 404 : 500).json({
      success: false,
      error: error.message || 'Failed to get generation job'
    });
  }
}

/**
 * Finalize and save user's customized workout plan
 */
export async function finalizePlan(req, res) {
  try {
    const userId = req.user.id;
    const { planPreview, userChoices, deletedExercises } = req.body;

    // Validate required fields
    if (!planPreview) {
      return res.status(400).json({ error: 'planPreview is required' });
    }

    if (!userChoices || typeof userChoices !== 'object') {
      return res.status(400).json({ error: 'userChoices must be an object' });
    }

    console.log(`💾 Finalizing plan for user ${userId}...`);

    // Finalize and save plan
    const savedPlan = await workoutPlannerService.finalizePlanPreview({
      userId,
      planPreview,
      userChoices,
      deletedExercises
    });

    console.log(`✅ Plan finalized and saved: ${savedPlan.id}`);

    res.status(201).json({
      success: true,
      data: savedPlan
    });
  } catch (error) {
    console.error('Error finalizing plan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to finalize plan'
    });
  }
}

// ============================================================================
// WORKOUT PLANS MANAGEMENT
// ============================================================================

/**
 * Get all workout plans for the authenticated user
 */
export async function getUserPlans(req, res) {
  try {
    const userId = req.user.id;
    const { status } = req.query; // active, completed, all

    const plans = await workoutPlannerService.getUserPlans(userId, status);

    // Add sync metadata for offline support
    const metadata = {
      last_modified: new Date().toISOString(),
      count: plans.length,
      synced_at: Date.now(),
    };

    res.json({
      success: true,
      data: plans,
      _metadata: metadata
    });
  } catch (error) {
    console.error('Error fetching user plans:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch workout plans'
    });
  }
}

/**
 * Get a specific workout plan by ID
 */
export async function getPlanById(req, res) {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    const plan = await workoutPlannerService.getPlanById(planId, userId);

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Workout plan not found'
      });
    }

    res.json({
      success: true,
      data: plan
    });
  } catch (error) {
    console.error('Error fetching plan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch workout plan'
    });
  }
}

/**
 * Delete a workout plan
 */
export async function deletePlan(req, res) {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    const deleted = await workoutPlannerService.deletePlan(planId, userId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Workout plan not found'
      });
    }

    res.json({
      success: true,
      message: 'Workout plan deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting plan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete workout plan'
    });
  }
}

/**
 * Activate a workout plan
 */
export async function activatePlan(req, res) {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    const plan = await workoutPlannerService.activatePlan(planId, userId);

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Workout plan not found'
      });
    }

    res.json({
      success: true,
      data: plan,
      message: 'Workout plan activated successfully'
    });
  } catch (error) {
    console.error('Error activating plan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to activate workout plan'
    });
  }
}

/**
 * Deactivate a workout plan
 */
export async function deactivatePlan(req, res) {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    const plan = await workoutPlannerService.deactivatePlan(planId, userId);

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Workout plan not found'
      });
    }

    res.json({
      success: true,
      data: plan,
      message: 'Workout plan deactivated successfully'
    });
  } catch (error) {
    console.error('Error deactivating plan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to deactivate workout plan'
    });
  }
}

// ============================================================================
// CURRENT ACTIVE PLAN
// ============================================================================

/**
 * Get the current active workout plan
 */
export async function getCurrentActivePlan(req, res) {
  try {
    const userId = req.user.id;

    const plan = await workoutPlannerService.getCurrentActivePlan(userId);

    // No plan is a valid state for new users - return success with null data
    res.json({
      success: true,
      data: plan || null
    });
  } catch (error) {
    console.error('Error fetching active plan:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch active workout plan'
    });
  }
}

// ============================================================================
// DAILY WORKOUTS
// ============================================================================

/**
 * Get a specific daily workout with full exercise details
 */
export async function getDailyWorkout(req, res) {
  try {
    const userId = req.user.id;
    const { dailyWorkoutId } = req.params;

    const dailyWorkout = await workoutPlannerService.getDailyWorkoutWithExercises(dailyWorkoutId, userId);

    if (!dailyWorkout) {
      return res.status(404).json({
        success: false,
        error: 'Daily workout not found'
      });
    }

    res.json({
      success: true,
      data: dailyWorkout
    });
  } catch (error) {
    console.error('Error fetching daily workout:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch daily workout'
    });
  }
}

/**
 * Get a daily workout by day order
 */
export async function getDailyWorkoutByDay(req, res) {
  try {
    const userId = req.user.id;
    const { planId, dayOrder } = req.params;

    const dailyWorkout = await workoutPlannerService.getDailyWorkoutByDay(planId, parseInt(dayOrder), userId);

    if (!dailyWorkout) {
      return res.status(404).json({
        success: false,
        error: 'Daily workout not found'
      });
    }

    res.json({
      success: true,
      data: dailyWorkout
    });
  } catch (error) {
    console.error('Error fetching daily workout by day:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch daily workout'
    });
  }
}

/**
 * Get the next incomplete workout
 */
export async function getNextWorkout(req, res) {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    const nextWorkout = await workoutPlannerService.getNextIncompleteWorkout(planId, userId);

    if (!nextWorkout) {
      return res.status(404).json({
        success: false,
        error: 'No incomplete workouts found',
        message: 'All workouts completed!'
      });
    }

    res.json({
      success: true,
      data: nextWorkout
    });
  } catch (error) {
    console.error('Error fetching next workout:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch next workout'
    });
  }
}

// ============================================================================
// WORKOUT COMPLETION
// ============================================================================

/**
 * Mark a daily workout as completed
 */
export async function completeDailyWorkout(req, res) {
  try {
    const userId = req.user.id;
    const { dailyWorkoutId } = req.params;
    const {
      duration_minutes,
      difficulty_rating,
      energy_level,
      notes,
      exercises_completed,
      share_to_feed
    } = req.body;

    const completion = await workoutPlannerService.completeWorkout({
      dailyWorkoutId,
      userId,
      duration_minutes,
      difficulty_rating,
      energy_level,
      notes,
      exercises_completed,
      share_to_feed
    });

    res.status(201).json({
      success: true,
      data: completion,
      message: 'Workout completed successfully! 🎉'
    });
  } catch (error) {
    console.error('Error completing workout:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to complete workout'
    });
  }
}

/**
 * Update an existing workout completion
 */
export async function updateWorkoutCompletion(req, res) {
  try {
    const userId = req.user.id;
    const { dailyWorkoutId } = req.params;
    const updates = req.body;

    const completion = await workoutPlannerService.updateWorkoutCompletion(dailyWorkoutId, userId, updates);

    if (!completion) {
      return res.status(404).json({
        success: false,
        error: 'Workout completion not found'
      });
    }

    res.json({
      success: true,
      data: completion,
      message: 'Workout completion updated successfully'
    });
  } catch (error) {
    console.error('Error updating workout completion:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update workout completion'
    });
  }
}

/**
 * Get workout completion by daily workout ID
 */
export async function getWorkoutCompletionByDailyWorkoutId(req, res) {
  try {
    const userId = req.user.id;
    const { dailyWorkoutId } = req.params;

    const completion = await workoutPlannerService.getWorkoutCompletionByDailyWorkoutId(dailyWorkoutId, userId);

    if (!completion) {
      return res.status(404).json({
        success: false,
        error: 'Workout completion not found'
      });
    }

    res.json({
      success: true,
      data: completion
    });
  } catch (error) {
    console.error('Error fetching workout completion:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch workout completion'
    });
  }
}

/**
 * Get workout completion by completion ID
 */
export async function getWorkoutCompletionById(req, res) {
  try {
    const userId = req.user.id;
    const { completionId } = req.params;

    const completion = await workoutPlannerService.getWorkoutCompletionById(completionId, userId);

    if (!completion) {
      return res.status(404).json({
        success: false,
        error: 'Workout completion not found'
      });
    }

    res.json({
      success: true,
      data: completion
    });
  } catch (error) {
    console.error('Error fetching workout completion:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch workout completion'
    });
  }
}

// ============================================================================
// PROGRESS & STATS
// ============================================================================

/**
 * Get progress stats for a specific plan
 */
export async function getPlanProgress(req, res) {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    const progress = await workoutPlannerService.getPlanProgress(planId, userId);

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Workout plan not found'
      });
    }

    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    console.error('Error fetching plan progress:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch plan progress'
    });
  }
}

/**
 * Get overall workout stats for the user
 */
export async function getUserWorkoutStats(req, res) {
  try {
    const userId = req.user.id;

    const stats = await workoutPlannerService.getUserWorkoutStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching user workout stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch workout stats'
    });
  }
}

/**
 * Get workout completion history
 */
export async function getWorkoutHistory(req, res) {
  try {
    const userId = req.user.id;
    const { limit = 10, offset = 0 } = req.query;

    const history = await workoutPlannerService.getWorkoutHistory(userId, parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error fetching workout history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch workout history'
    });
  }
}

// ============================================================================
// USER PREFERENCES
// ============================================================================

/**
 * Get user's workout planner preferences
 */
export async function getUserPreferences(req, res) {
  try {
    const userId = req.user.id;

    const preferences = await workoutPlannerService.getUserPreferences(userId);

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch preferences'
    });
  }
}

/**
 * Update user's workout planner preferences
 */
export async function updateUserPreferences(req, res) {
  try {
    const userId = req.user.id;
    const updates = req.body;

    const preferences = await workoutPlannerService.updateUserPreferences(userId, updates);

    res.json({
      success: true,
      data: preferences,
      message: 'Preferences updated successfully'
    });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update preferences'
    });
  }
}

/**
 * Create initial user preferences
 */
export async function createUserPreferences(req, res) {
  try {
    const userId = req.user.id;
    const data = req.body;

    const preferences = await workoutPlannerService.createUserPreferences(userId, data);

    res.status(201).json({
      success: true,
      data: preferences,
      message: 'Preferences created successfully'
    });
  } catch (error) {
    console.error('Error creating user preferences:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create preferences'
    });
  }
}

// ============================================================================
// SKIP TRACKING
// ============================================================================

/**
 * Mark a workout as skipped
 */
export async function skipWorkout(req, res) {
  try {
    const userId = req.user.id;
    const { dailyWorkoutId } = req.params;
    const { reason } = req.body;

    const result = await workoutPlannerService.skipWorkout(userId, dailyWorkoutId, reason);

    res.json({
      success: true,
      data: result,
      message: 'Workout marked as skipped'
    });
  } catch (error) {
    console.error('Error skipping workout:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to skip workout'
    });
  }
}

/**
 * Get all skipped workouts for the user
 */
export async function getSkippedWorkouts(req, res) {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const skipped = await workoutPlannerService.getSkippedWorkouts(userId, parseInt(limit), parseInt(offset));

    res.json({
      success: true,
      data: skipped
    });
  } catch (error) {
    console.error('Error fetching skipped workouts:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch skipped workouts'
    });
  }
}

/**
 * Get skip statistics for the user
 */
export async function getSkipStats(req, res) {
  try {
    const userId = req.user.id;

    const stats = await workoutPlannerService.getSkipStats(userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching skip stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch skip statistics'
    });
  }
}

/**
 * Auto-skip past incomplete workouts (called by cron job or manually)
 */
export async function autoSkipPastWorkouts(req, res) {
  try {
    const userId = req.user.id;

    const result = await workoutPlannerService.autoSkipPastWorkouts(userId);

    res.json({
      success: true,
      data: result,
      message: `${result.skipped_count} past workouts marked as skipped`
    });
  } catch (error) {
    console.error('Error auto-skipping past workouts:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to auto-skip past workouts'
    });
  }
}

/**
 * Auto-deactivate expired workout plans
 * POST /api/workout-planner/auto-deactivate
 */
export async function autoDeactivateExpiredPlans(req, res) {
  try {
    const userId = req.user.id;

    const result = await workoutPlannerService.autoDeactivateExpiredPlans(userId);

    res.json({
      success: true,
      data: result,
      message: `${result.deactivated_count} expired plans deactivated`
    });
  } catch (error) {
    console.error('Error auto-deactivating expired plans:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to auto-deactivate expired plans'
    });
  }
}

// ============================================================================
// PUBLIC/SHARED WORKOUT ACCESS
// ============================================================================

/**
 * Get shared workout details (accessible to any authenticated user)
 * Returns data if the workout was shared to feed OR if the user is the owner
 * GET /api/workout-planner/shared/:completionId
 */
export async function getSharedWorkout(req, res) {
  try {
    const { completionId } = req.params;
    const userId = req.user.id;

    // Get the workout completion (allows if shared_to_feed OR user is owner)
    const completion = await workoutPlannerService.getSharedWorkoutCompletion(completionId, userId);

    if (!completion) {
      return res.status(404).json({
        success: false,
        error: 'Shared workout not found or not shared publicly'
      });
    }

    // Get the daily workout details
    const dailyWorkout = await workoutPlannerService.getDailyWorkoutPublic(completion.daily_workout_id);

    if (!dailyWorkout) {
      return res.status(404).json({
        success: false,
        error: 'Workout details not found'
      });
    }

    // Combine the data
    res.json({
      success: true,
      data: {
        completion: {
          id: completion.id,
          duration_minutes: completion.duration_minutes,
          difficulty_rating: completion.difficulty_rating,
          energy_level: completion.energy_level,
          notes: completion.notes,
          completed_at: completion.completed_at,
          exercises_completed: completion.exercises_completed
        },
        workout: {
          id: dailyWorkout.id,
          workout_name: dailyWorkout.workout_name,
          focus_area: dailyWorkout.focus_area,
          estimated_duration_minutes: dailyWorkout.estimated_duration_minutes,
          exercises: dailyWorkout.exercises || [],
          warm_up_exercises: dailyWorkout.warm_up_exercises || [],
          workout_tips: dailyWorkout.workout_tips,
          user: dailyWorkout.user || completion.users
        }
      }
    });
  } catch (error) {
    console.error('Error fetching shared workout:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch shared workout'
    });
  }
}

import * as workoutPlannerService from '../services/workoutPlannerService.js';

// ============================================================================
// WORKOUT PLAN GENERATION
// ============================================================================

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
      selected_days
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
      selected_days
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

    res.json({
      success: true,
      data: plans
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

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'No active workout plan found'
      });
    }

    res.json({
      success: true,
      data: plan
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

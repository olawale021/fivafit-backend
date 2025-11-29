import { supabase } from '../config/supabase.js';

/**
 * Saved Workouts Service
 * Handles user's personal saved workout library
 */

// ============================================================================
// SAVED WORKOUTS
// ============================================================================

/**
 * Save/copy a workout to user's library
 * @param {string} userId - User ID
 * @param {Object} workoutData - Workout data to save
 * @returns {Object} - Saved workout
 */
export async function saveWorkout(userId, workoutData) {
  try {
    const { data, error } = await supabase
      .from('saved_workouts')
      .insert([{
        user_id: userId,
        workout_name: workoutData.workout_name,
        focus_area: workoutData.focus_area,
        target_muscles: workoutData.target_muscles,
        estimated_duration_minutes: workoutData.estimated_duration_minutes,
        exercises: workoutData.exercises,
        warm_up_exercises: workoutData.warm_up_exercises,
        warm_up: workoutData.warm_up,
        cool_down: workoutData.cool_down,
        workout_tips: workoutData.workout_tips,
        source_daily_workout_id: workoutData.source_daily_workout_id,
        source_workout_completion_id: workoutData.source_workout_completion_id,
        source_post_id: workoutData.source_post_id,
        copied_from_user_id: workoutData.copied_from_user_id,
        notes: workoutData.notes || null,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error saving workout:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in saveWorkout:', error);
    throw error;
  }
}

/**
 * Copy a workout from daily_workout
 * @param {string} userId - User ID
 * @param {string} dailyWorkoutId - Daily workout ID to copy from
 * @param {string} postId - Optional post ID (if from feed)
 * @param {string} workoutCompletionId - Optional workout completion ID
 * @returns {Object} - Saved workout
 */
export async function copyWorkoutFromDaily(userId, dailyWorkoutId, postId = null, workoutCompletionId = null) {
  try {
    // Fetch the daily workout data
    const { data: dailyWorkout, error: fetchError } = await supabase
      .from('daily_workouts')
      .select('*')
      .eq('id', dailyWorkoutId)
      .single();

    if (fetchError || !dailyWorkout) {
      throw new Error('Daily workout not found');
    }

    // Get the workout plan to find the original creator
    const { data: plan } = await supabase
      .from('workout_plans')
      .select('user_id')
      .eq('id', dailyWorkout.workout_plan_id)
      .single();

    // Save the workout
    const savedWorkout = await saveWorkout(userId, {
      workout_name: dailyWorkout.workout_name,
      focus_area: dailyWorkout.focus_area,
      target_muscles: dailyWorkout.target_muscles,
      estimated_duration_minutes: dailyWorkout.estimated_duration_minutes,
      exercises: dailyWorkout.exercises,
      warm_up_exercises: dailyWorkout.warm_up_exercises,
      warm_up: dailyWorkout.warm_up,
      cool_down: dailyWorkout.cool_down,
      workout_tips: dailyWorkout.workout_tips,
      source_daily_workout_id: dailyWorkoutId,
      source_workout_completion_id: workoutCompletionId,
      source_post_id: postId,
      copied_from_user_id: plan?.user_id || null,
    });

    return savedWorkout;
  } catch (error) {
    console.error('Error in copyWorkoutFromDaily:', error);
    throw error;
  }
}

/**
 * Get all saved workouts for a user
 * @param {string} userId - User ID
 * @param {Object} filters - Optional filters (favorite, focus_area, etc.)
 * @returns {Array} - Array of saved workouts
 */
export async function getUserSavedWorkouts(userId, filters = {}) {
  try {
    let query = supabase
      .from('saved_workouts')
      .select('*')
      .eq('user_id', userId);

    // Apply filters
    if (filters.is_favorite !== undefined) {
      query = query.eq('is_favorite', filters.is_favorite);
    }

    if (filters.focus_area) {
      query = query.eq('focus_area', filters.focus_area);
    }

    // Order by
    const orderBy = filters.order_by || 'created_at';
    const orderDirection = filters.order_direction || 'desc';
    query = query.order(orderBy, { ascending: orderDirection === 'asc' });

    // Pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching saved workouts:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUserSavedWorkouts:', error);
    throw error;
  }
}

/**
 * Get a single saved workout by ID
 * @param {string} workoutId - Saved workout ID
 * @param {string} userId - User ID (for authorization)
 * @returns {Object} - Saved workout
 */
export async function getSavedWorkoutById(workoutId, userId) {
  try {
    const { data, error } = await supabase
      .from('saved_workouts')
      .select('*')
      .eq('id', workoutId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching saved workout:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in getSavedWorkoutById:', error);
    throw error;
  }
}

/**
 * Update a saved workout
 * @param {string} workoutId - Saved workout ID
 * @param {string} userId - User ID (for authorization)
 * @param {Object} updates - Fields to update
 * @returns {Object} - Updated workout
 */
export async function updateSavedWorkout(workoutId, userId, updates) {
  try {
    const { data, error } = await supabase
      .from('saved_workouts')
      .update(updates)
      .eq('id', workoutId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating saved workout:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in updateSavedWorkout:', error);
    throw error;
  }
}

/**
 * Delete a saved workout
 * @param {string} workoutId - Saved workout ID
 * @param {string} userId - User ID (for authorization)
 */
export async function deleteSavedWorkout(workoutId, userId) {
  try {
    const { error } = await supabase
      .from('saved_workouts')
      .delete()
      .eq('id', workoutId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting saved workout:', error);
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error in deleteSavedWorkout:', error);
    throw error;
  }
}

/**
 * Toggle favorite status
 * @param {string} workoutId - Saved workout ID
 * @param {string} userId - User ID
 * @returns {Object} - Updated workout
 */
export async function toggleWorkoutFavorite(workoutId, userId) {
  try {
    // Get current favorite status
    const { data: current } = await supabase
      .from('saved_workouts')
      .select('is_favorite')
      .eq('id', workoutId)
      .eq('user_id', userId)
      .single();

    if (!current) {
      throw new Error('Saved workout not found');
    }

    // Toggle
    const { data, error } = await supabase
      .from('saved_workouts')
      .update({ is_favorite: !current.is_favorite })
      .eq('id', workoutId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error toggling favorite:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in toggleWorkoutFavorite:', error);
    throw error;
  }
}

// ============================================================================
// SAVED EXERCISES
// ============================================================================

/**
 * Save an exercise to user's library
 * @param {string} userId - User ID
 * @param {Object} exerciseData - Exercise data to save
 * @returns {Object} - Saved exercise
 */
export async function saveExercise(userId, exerciseData) {
  try {
    // Check if exercise already exists for this user
    const { data: existing } = await supabase
      .from('saved_exercises')
      .select('id')
      .eq('user_id', userId)
      .eq('exercise_id', exerciseData.exercise_id)
      .single();

    if (existing) {
      throw new Error('Exercise already saved');
    }

    const { data, error } = await supabase
      .from('saved_exercises')
      .insert([{
        user_id: userId,
        exercise_id: exerciseData.exercise_id,
        name: exerciseData.name,
        image_url: exerciseData.image_url,
        body_part: exerciseData.body_part,
        target_muscle: exerciseData.target_muscle,
        equipment: exerciseData.equipment,
        sets: exerciseData.sets || null,
        reps: exerciseData.reps || null,
        rest_seconds: exerciseData.rest_seconds || null,
        tempo: exerciseData.tempo || null,
        weight: exerciseData.weight || null,
        notes: exerciseData.notes || null,
        source_type: exerciseData.source_type || 'custom',
        source_daily_workout_id: exerciseData.source_daily_workout_id || null,
        source_post_id: exerciseData.source_post_id || null,
        source_saved_workout_id: exerciseData.source_saved_workout_id || null,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error saving exercise:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in saveExercise:', error);
    throw error;
  }
}

/**
 * Get all saved exercises for a user
 * @param {string} userId - User ID
 * @param {Object} filters - Optional filters
 * @returns {Array} - Array of saved exercises
 */
export async function getUserSavedExercises(userId, filters = {}) {
  try {
    let query = supabase
      .from('saved_exercises')
      .select('*')
      .eq('user_id', userId);

    // Apply filters
    if (filters.is_favorite !== undefined) {
      query = query.eq('is_favorite', filters.is_favorite);
    }

    if (filters.body_part) {
      query = query.eq('body_part', filters.body_part);
    }

    if (filters.source_type) {
      query = query.eq('source_type', filters.source_type);
    }

    // Order by
    const orderBy = filters.order_by || 'created_at';
    const orderDirection = filters.order_direction || 'desc';
    query = query.order(orderBy, { ascending: orderDirection === 'asc' });

    // Pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching saved exercises:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUserSavedExercises:', error);
    throw error;
  }
}

/**
 * Update a saved exercise
 * @param {string} exerciseId - Saved exercise ID
 * @param {string} userId - User ID
 * @param {Object} updates - Fields to update
 * @returns {Object} - Updated exercise
 */
export async function updateSavedExercise(exerciseId, userId, updates) {
  try {
    const { data, error } = await supabase
      .from('saved_exercises')
      .update(updates)
      .eq('id', exerciseId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating saved exercise:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in updateSavedExercise:', error);
    throw error;
  }
}

/**
 * Delete a saved exercise
 * @param {string} exerciseId - Saved exercise ID
 * @param {string} userId - User ID
 */
export async function deleteSavedExercise(exerciseId, userId) {
  try {
    const { error } = await supabase
      .from('saved_exercises')
      .delete()
      .eq('id', exerciseId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting saved exercise:', error);
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error in deleteSavedExercise:', error);
    throw error;
  }
}

/**
 * Toggle exercise favorite status
 * @param {string} exerciseId - Saved exercise ID
 * @param {string} userId - User ID
 * @returns {Object} - Updated exercise
 */
export async function toggleExerciseFavorite(exerciseId, userId) {
  try {
    const { data: current } = await supabase
      .from('saved_exercises')
      .select('is_favorite')
      .eq('id', exerciseId)
      .eq('user_id', userId)
      .single();

    if (!current) {
      throw new Error('Saved exercise not found');
    }

    const { data, error } = await supabase
      .from('saved_exercises')
      .update({ is_favorite: !current.is_favorite })
      .eq('id', exerciseId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error toggling favorite:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in toggleExerciseFavorite:', error);
    throw error;
  }
}

/**
 * Check if an exercise is already saved
 * @param {string} userId - User ID
 * @param {string} exerciseId - Exercise ID
 * @returns {boolean} - True if already saved
 */
export async function isExerciseSaved(userId, exerciseId) {
  try {
    const { data } = await supabase
      .from('saved_exercises')
      .select('id')
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId)
      .single();

    return !!data;
  } catch (error) {
    return false;
  }
}

/**
 * Activate a saved workout - creates a workout plan with start date
 * @param {string} savedWorkoutId - Saved workout ID
 * @param {string} userId - User ID
 * @param {string} startDate - Start date (YYYY-MM-DD format)
 * @returns {Object} - Created workout plan
 */
export async function activateSavedWorkout(savedWorkoutId, userId, startDate) {
  try {
    // Get the saved workout
    const savedWorkout = await getSavedWorkoutById(savedWorkoutId, userId);

    if (!savedWorkout) {
      throw new Error('Saved workout not found');
    }

    // Create a new workout plan (keeping other plans active)
    const { data: plan, error: planError } = await supabase
      .from('workout_plans')
      .insert([{
        user_id: userId,
        plan_name: savedWorkout.workout_name,
        description: `Activated from saved workout: ${savedWorkout.workout_name}`,
        fitness_goals: ['general_fitness'], // Default
        target_body_parts: savedWorkout.target_muscles || [],
        days_per_week: 1,
        hours_per_session: (savedWorkout.estimated_duration_minutes || 60) / 60,
        selected_days: null,
        total_weeks: 1,
        total_workouts: 1,
        completed_workouts: 0,
        is_active: true,
        is_ai_generated: false,
        started_at: startDate,
      }])
      .select()
      .single();

    if (planError) {
      console.error('Error creating workout plan:', planError);
      throw planError;
    }

    // Create a daily workout from the saved workout
    const { data: dailyWorkout, error: dailyError } = await supabase
      .from('daily_workouts')
      .insert([{
        workout_plan_id: plan.id,
        day_of_week: null, // Flexible
        week_number: 1,
        day_order: 1,
        workout_name: savedWorkout.workout_name,
        focus_area: savedWorkout.focus_area,
        target_muscles: savedWorkout.target_muscles,
        estimated_duration_minutes: savedWorkout.estimated_duration_minutes,
        exercises: savedWorkout.exercises,
        warm_up_exercises: savedWorkout.warm_up_exercises,
        warm_up: savedWorkout.warm_up,
        cool_down: savedWorkout.cool_down,
        workout_tips: savedWorkout.workout_tips,
        is_completed: false,
        scheduled_date: startDate,
      }])
      .select()
      .single();

    if (dailyError) {
      console.error('Error creating daily workout:', dailyError);
      // Clean up the plan if daily workout creation fails
      await supabase.from('workout_plans').delete().eq('id', plan.id);
      throw dailyError;
    }

    return {
      plan,
      dailyWorkout,
    };
  } catch (error) {
    console.error('Error in activateSavedWorkout:', error);
    throw error;
  }
}

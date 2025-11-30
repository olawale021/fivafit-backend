import * as savedWorkoutsService from '../services/savedWorkoutsService.js';

// ============================================================================
// SAVED WORKOUTS
// ============================================================================

/**
 * Save/copy a workout to user's library
 * POST /api/saved-workouts
 */
export async function saveWorkout(req, res) {
  try {
    const userId = req.user.id;
    const workoutData = req.body;

    const savedWorkout = await savedWorkoutsService.saveWorkout(userId, workoutData);

    res.status(201).json({
      success: true,
      data: savedWorkout,
      message: 'Workout saved successfully',
    });
  } catch (error) {
    console.error('Error in saveWorkout controller:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save workout',
    });
  }
}

/**
 * Copy workout from daily_workout (e.g., from feed post)
 * POST /api/saved-workouts/copy/:dailyWorkoutId
 */
export async function copyWorkoutFromDaily(req, res) {
  try {
    const userId = req.user.id;
    const { dailyWorkoutId } = req.params;
    const { postId, workoutCompletionId } = req.body;

    const savedWorkout = await savedWorkoutsService.copyWorkoutFromDaily(
      userId,
      dailyWorkoutId,
      postId,
      workoutCompletionId
    );

    res.status(201).json({
      success: true,
      data: savedWorkout,
      message: 'Workout copied successfully',
    });
  } catch (error) {
    console.error('Error in copyWorkoutFromDaily controller:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to copy workout',
    });
  }
}

/**
 * Get all saved workouts for the user
 * GET /api/saved-workouts
 * Query params: ?favorite=true&focus_area=Upper Body&limit=20&offset=0
 */
export async function getUserSavedWorkouts(req, res) {
  try {
    const userId = req.user.id;
    const filters = {
      is_favorite: req.query.favorite === 'true' ? true : undefined,
      focus_area: req.query.focus_area,
      order_by: req.query.order_by || 'created_at',
      order_direction: req.query.order_direction || 'desc',
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    };

    const workouts = await savedWorkoutsService.getUserSavedWorkouts(userId, filters);

    // Add sync metadata for offline support
    const metadata = {
      last_modified: new Date().toISOString(),
      count: workouts.length,
      synced_at: Date.now(),
    };

    res.json({
      success: true,
      data: workouts,
      _metadata: metadata
    });
  } catch (error) {
    console.error('Error in getUserSavedWorkouts controller:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch saved workouts',
    });
  }
}

/**
 * Get a single saved workout by ID
 * GET /api/saved-workouts/:id
 */
export async function getSavedWorkoutById(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const workout = await savedWorkoutsService.getSavedWorkoutById(id, userId);

    res.json({
      success: true,
      data: workout,
    });
  } catch (error) {
    console.error('Error in getSavedWorkoutById controller:', error);
    res.status(404).json({
      success: false,
      error: 'Saved workout not found',
    });
  }
}

/**
 * Update a saved workout
 * PUT /api/saved-workouts/:id
 */
export async function updateSavedWorkout(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    const workout = await savedWorkoutsService.updateSavedWorkout(id, userId, updates);

    res.json({
      success: true,
      data: workout,
      message: 'Workout updated successfully',
    });
  } catch (error) {
    console.error('Error in updateSavedWorkout controller:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update workout',
    });
  }
}

/**
 * Delete a saved workout
 * DELETE /api/saved-workouts/:id
 */
export async function deleteSavedWorkout(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await savedWorkoutsService.deleteSavedWorkout(id, userId);

    res.json({
      success: true,
      message: 'Workout deleted successfully',
    });
  } catch (error) {
    console.error('Error in deleteSavedWorkout controller:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete workout',
    });
  }
}

/**
 * Toggle favorite status
 * PUT /api/saved-workouts/:id/favorite
 */
export async function toggleWorkoutFavorite(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const workout = await savedWorkoutsService.toggleWorkoutFavorite(id, userId);

    res.json({
      success: true,
      data: workout,
      message: workout.is_favorite ? 'Added to favorites' : 'Removed from favorites',
    });
  } catch (error) {
    console.error('Error in toggleWorkoutFavorite controller:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle favorite',
    });
  }
}

// ============================================================================
// SAVED EXERCISES
// ============================================================================

/**
 * Save an exercise to user's library
 * POST /api/saved-exercises
 */
export async function saveExercise(req, res) {
  try {
    const userId = req.user.id;
    const exerciseData = req.body;

    const savedExercise = await savedWorkoutsService.saveExercise(userId, exerciseData);

    res.status(201).json({
      success: true,
      data: savedExercise,
      message: 'Exercise saved successfully',
    });
  } catch (error) {
    console.error('Error in saveExercise controller:', error);

    if (error.message === 'Exercise already saved') {
      return res.status(409).json({
        success: false,
        error: 'Exercise already saved',
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save exercise',
    });
  }
}

/**
 * Get all saved exercises for the user
 * GET /api/saved-exercises
 * Query params: ?favorite=true&body_part=chest&source_type=search&limit=50&offset=0
 */
export async function getUserSavedExercises(req, res) {
  try {
    const userId = req.user.id;
    const filters = {
      is_favorite: req.query.favorite === 'true' ? true : undefined,
      body_part: req.query.body_part,
      source_type: req.query.source_type,
      order_by: req.query.order_by || 'created_at',
      order_direction: req.query.order_direction || 'desc',
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    };

    const exercises = await savedWorkoutsService.getUserSavedExercises(userId, filters);

    // Add sync metadata for offline support
    const metadata = {
      last_modified: new Date().toISOString(),
      count: exercises.length,
      synced_at: Date.now(),
    };

    res.json({
      success: true,
      data: exercises,
      _metadata: metadata
    });
  } catch (error) {
    console.error('Error in getUserSavedExercises controller:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch saved exercises',
    });
  }
}

/**
 * Update a saved exercise
 * PUT /api/saved-exercises/:id
 */
export async function updateSavedExercise(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    const exercise = await savedWorkoutsService.updateSavedExercise(id, userId, updates);

    res.json({
      success: true,
      data: exercise,
      message: 'Exercise updated successfully',
    });
  } catch (error) {
    console.error('Error in updateSavedExercise controller:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update exercise',
    });
  }
}

/**
 * Delete a saved exercise
 * DELETE /api/saved-exercises/:id
 */
export async function deleteSavedExercise(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await savedWorkoutsService.deleteSavedExercise(id, userId);

    res.json({
      success: true,
      message: 'Exercise deleted successfully',
    });
  } catch (error) {
    console.error('Error in deleteSavedExercise controller:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete exercise',
    });
  }
}

/**
 * Toggle exercise favorite status
 * PUT /api/saved-exercises/:id/favorite
 */
export async function toggleExerciseFavorite(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const exercise = await savedWorkoutsService.toggleExerciseFavorite(id, userId);

    res.json({
      success: true,
      data: exercise,
      message: exercise.is_favorite ? 'Added to favorites' : 'Removed from favorites',
    });
  } catch (error) {
    console.error('Error in toggleExerciseFavorite controller:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle favorite',
    });
  }
}

/**
 * Check if an exercise is already saved
 * GET /api/saved-exercises/check/:exerciseId
 */
export async function checkExerciseSaved(req, res) {
  try {
    const userId = req.user.id;
    const { exerciseId } = req.params;

    const isSaved = await savedWorkoutsService.isExerciseSaved(userId, exerciseId);

    res.json({
      success: true,
      data: { is_saved: isSaved },
    });
  } catch (error) {
    console.error('Error in checkExerciseSaved controller:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check exercise status',
    });
  }
}

/**
 * Activate a saved workout - creates a plan with start date
 * POST /api/saved-workouts/:id/activate
 * Body: { start_date: "2025-11-29" }
 */
export async function activateSavedWorkout(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { start_date } = req.body;

    if (!start_date) {
      return res.status(400).json({
        success: false,
        error: 'Start date is required',
      });
    }

    const result = await savedWorkoutsService.activateSavedWorkout(id, userId, start_date);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Workout activated successfully',
    });
  } catch (error) {
    console.error('Error in activateSavedWorkout controller:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to activate workout',
    });
  }
}

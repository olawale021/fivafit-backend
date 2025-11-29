import express from 'express';
import * as savedWorkoutsController from '../controllers/savedWorkoutsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ============================================================================
// SAVED EXERCISES ROUTES
// ============================================================================
// NOTE: These MUST come before /:id routes to avoid route conflicts

/**
 * POST /api/saved-workouts/exercises
 * Save an exercise to user's library
 *
 * Body: {
 *   exercise_id: string (required),
 *   name: string (required),
 *   image_url?: string,
 *   body_part?: string,
 *   target_muscle?: string,
 *   equipment?: string,
 *   sets?: number,
 *   reps?: string,
 *   rest_seconds?: number,
 *   tempo?: string,
 *   weight?: string,
 *   notes?: string,
 *   source_type?: string,
 *   source_daily_workout_id?: string,
 *   source_post_id?: string,
 *   source_saved_workout_id?: string
 * }
 */
router.post('/exercises', savedWorkoutsController.saveExercise);

/**
 * GET /api/saved-workouts/exercises
 * Get all saved exercises for the authenticated user
 *
 * Query params:
 *   ?favorite=true
 *   &body_part=chest
 *   &source_type=search
 *   &order_by=created_at|times_completed
 *   &order_direction=asc|desc
 *   &limit=50
 *   &offset=0
 */
router.get('/exercises', savedWorkoutsController.getUserSavedExercises);

/**
 * GET /api/saved-workouts/exercises/check/:exerciseId
 * Check if an exercise is already saved
 */
router.get('/exercises/check/:exerciseId', savedWorkoutsController.checkExerciseSaved);

/**
 * PUT /api/saved-workouts/exercises/:id
 * Update a saved exercise
 *
 * Body: {
 *   sets?: number,
 *   reps?: string,
 *   weight?: string,
 *   notes?: string,
 *   ...any other fields
 * }
 */
router.put('/exercises/:id', savedWorkoutsController.updateSavedExercise);

/**
 * DELETE /api/saved-workouts/exercises/:id
 * Delete a saved exercise
 */
router.delete('/exercises/:id', savedWorkoutsController.deleteSavedExercise);

/**
 * PUT /api/saved-workouts/exercises/:id/favorite
 * Toggle favorite status for a saved exercise
 */
router.put('/exercises/:id/favorite', savedWorkoutsController.toggleExerciseFavorite);

// ============================================================================
// SAVED WORKOUTS ROUTES
// ============================================================================
// NOTE: Specific routes (like /copy/:id) MUST come before generic /:id routes

/**
 * POST /api/saved-workouts/copy/:dailyWorkoutId
 * Copy a workout from a daily_workout (e.g., from feed)
 *
 * Params: dailyWorkoutId
 * Body: {
 *   postId?: string,
 *   workoutCompletionId?: string
 * }
 */
router.post('/copy/:dailyWorkoutId', savedWorkoutsController.copyWorkoutFromDaily);

/**
 * POST /api/saved-workouts/:id/activate
 * Activate a saved workout - creates a plan with start date
 *
 * Body: {
 *   start_date: "2025-11-29" (YYYY-MM-DD format)
 * }
 */
router.post('/:id/activate', savedWorkoutsController.activateSavedWorkout);

/**
 * PUT /api/saved-workouts/:id/favorite
 * Toggle favorite status for a saved workout
 */
router.put('/:id/favorite', savedWorkoutsController.toggleWorkoutFavorite);

/**
 * POST /api/saved-workouts
 * Save a new workout to user's library
 *
 * Body: {
 *   workout_name: string,
 *   focus_area: string,
 *   target_muscles: string[],
 *   estimated_duration_minutes: number,
 *   exercises: object[],
 *   warm_up_exercises: object[],
 *   warm_up: string,
 *   cool_down: string,
 *   workout_tips: string,
 *   source_daily_workout_id: string,
 *   source_workout_completion_id: string,
 *   source_post_id: string,
 *   copied_from_user_id: string,
 *   notes: string
 * }
 */
router.post('/', savedWorkoutsController.saveWorkout);

/**
 * GET /api/saved-workouts
 * Get all saved workouts for the authenticated user
 *
 * Query params:
 *   ?favorite=true
 *   &focus_area=Upper Body
 *   &order_by=created_at|times_completed
 *   &order_direction=asc|desc
 *   &limit=20
 *   &offset=0
 */
router.get('/', savedWorkoutsController.getUserSavedWorkouts);

/**
 * GET /api/saved-workouts/:id
 * Get a specific saved workout by ID
 */
router.get('/:id', savedWorkoutsController.getSavedWorkoutById);

/**
 * PUT /api/saved-workouts/:id
 * Update a saved workout
 *
 * Body: {
 *   workout_name?: string,
 *   exercises?: object[],
 *   notes?: string,
 *   ...any other fields
 * }
 */
router.put('/:id', savedWorkoutsController.updateSavedWorkout);

/**
 * DELETE /api/saved-workouts/:id
 * Delete a saved workout
 */
router.delete('/:id', savedWorkoutsController.deleteSavedWorkout);

export default router;

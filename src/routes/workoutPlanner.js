import express from 'express';
import * as workoutPlannerController from '../controllers/workoutPlannerController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ============================================================================
// WORKOUT PLAN GENERATION
// ============================================================================

/**
 * POST /api/workout-planner/generate
 * Generate a new AI-powered workout plan
 *
 * Body: {
 *   fitness_goals: ["lose_weight", "gain_muscle"],
 *   target_body_parts: ["chest", "back", "legs"],
 *   days_per_week: 3,
 *   hours_per_session: 1.5,
 *   selected_days: ["monday", "wednesday", "friday"] // optional
 * }
 */
router.post('/generate', workoutPlannerController.generateWorkoutPlan);

/**
 * POST /api/workout-planner/generate-preview
 * Generate a workout plan PREVIEW with exercise alternatives (does NOT save to database)
 * User can then customize exercises and finalize the plan
 *
 * Body: {
 *   fitness_goals: ["lose_weight", "gain_muscle"],
 *   target_body_parts: ["chest", "back", "legs"],
 *   days_per_week: 3,
 *   hours_per_session: 1.5,
 *   selected_days: ["monday", "wednesday", "friday"] // optional
 * }
 *
 * Response includes 3 exercise alternatives for each exercise slot
 */
router.post('/generate-preview', workoutPlannerController.generatePlanPreview);

/**
 * POST /api/workout-planner/finalize
 * Finalize and save user's customized workout plan
 *
 * Body: {
 *   planPreview: { ... },  // The preview object returned from /generate-preview
 *   userChoices: {         // User's exercise choices
 *     "day_0_exercise_0": "exercise_id_chosen",
 *     "day_0_exercise_1": "exercise_id_chosen",
 *     ...
 *   }
 * }
 *
 * Saves the finalized plan to database with user's chosen exercises
 */
router.post('/finalize', workoutPlannerController.finalizePlan);

// ============================================================================
// WORKOUT PLANS MANAGEMENT
// ============================================================================

/**
 * GET /api/workout-planner/plans
 * Get all workout plans for the authenticated user
 * Query params: ?status=active|completed|all (default: all)
 */
router.get('/plans', workoutPlannerController.getUserPlans);

/**
 * GET /api/workout-planner/plans/:planId
 * Get a specific workout plan with all daily workouts
 */
router.get('/plans/:planId', workoutPlannerController.getPlanById);

/**
 * DELETE /api/workout-planner/plans/:planId
 * Delete a workout plan (and all associated daily workouts)
 */
router.delete('/plans/:planId', workoutPlannerController.deletePlan);

/**
 * PUT /api/workout-planner/plans/:planId/activate
 * Set a plan as the active plan (deactivates other plans)
 */
router.put('/plans/:planId/activate', workoutPlannerController.activatePlan);

/**
 * PUT /api/workout-planner/plans/:planId/deactivate
 * Deactivate a plan
 */
router.put('/plans/:planId/deactivate', workoutPlannerController.deactivatePlan);

// ============================================================================
// CURRENT ACTIVE PLAN
// ============================================================================

/**
 * GET /api/workout-planner/current
 * Get the current active workout plan for the user
 */
router.get('/current', workoutPlannerController.getCurrentActivePlan);

// ============================================================================
// DAILY WORKOUTS
// ============================================================================

/**
 * GET /api/workout-planner/daily/:dailyWorkoutId
 * Get a specific daily workout with full exercise details
 */
router.get('/daily/:dailyWorkoutId', workoutPlannerController.getDailyWorkout);

/**
 * GET /api/workout-planner/plans/:planId/day/:dayOrder
 * Get a daily workout by its day order (1, 2, 3, etc.)
 */
router.get('/plans/:planId/day/:dayOrder', workoutPlannerController.getDailyWorkoutByDay);

/**
 * GET /api/workout-planner/plans/:planId/next
 * Get the next incomplete workout in the plan
 */
router.get('/plans/:planId/next', workoutPlannerController.getNextWorkout);

// ============================================================================
// WORKOUT COMPLETION
// ============================================================================

/**
 * POST /api/workout-planner/complete/:dailyWorkoutId
 * Mark a daily workout as completed
 *
 * Body: {
 *   duration_minutes: 60,
 *   difficulty_rating: 3,
 *   energy_level: 4,
 *   notes: "Great workout!",
 *   exercises_completed: [...],
 *   share_to_feed: false
 * }
 */
router.post('/complete/:dailyWorkoutId', workoutPlannerController.completeDailyWorkout);

/**
 * PUT /api/workout-planner/complete/:dailyWorkoutId/update
 * Update an existing workout completion
 */
router.put('/complete/:dailyWorkoutId/update', workoutPlannerController.updateWorkoutCompletion);

/**
 * GET /api/workout-planner/completion/:dailyWorkoutId
 * Get workout completion by daily workout ID
 */
router.get('/completion/:dailyWorkoutId', workoutPlannerController.getWorkoutCompletionByDailyWorkoutId);

// ============================================================================
// PROGRESS & STATS
// ============================================================================

/**
 * GET /api/workout-planner/progress/:planId
 * Get progress stats for a specific plan
 */
router.get('/progress/:planId', workoutPlannerController.getPlanProgress);

/**
 * GET /api/workout-planner/stats
 * Get overall workout stats for the user
 */
router.get('/stats', workoutPlannerController.getUserWorkoutStats);

/**
 * GET /api/workout-planner/history
 * Get workout completion history
 * Query params: ?limit=10&offset=0
 */
router.get('/history', workoutPlannerController.getWorkoutHistory);

// ============================================================================
// USER PREFERENCES
// ============================================================================

/**
 * GET /api/workout-planner/preferences
 * Get user's workout planner preferences
 */
router.get('/preferences', workoutPlannerController.getUserPreferences);

/**
 * PUT /api/workout-planner/preferences
 * Update user's workout planner preferences
 *
 * Body: {
 *   default_fitness_goals: ["gain_muscle"],
 *   default_target_body_parts: ["chest", "back"],
 *   default_days_per_week: 4,
 *   default_hours_per_session: 1.5,
 *   default_selected_days: ["monday", "tuesday", "thursday", "friday"],
 *   fitness_level: "intermediate",
 *   prefer_compound_exercises: true
 * }
 */
router.put('/preferences', workoutPlannerController.updateUserPreferences);

/**
 * POST /api/workout-planner/preferences
 * Create initial user preferences
 */
router.post('/preferences', workoutPlannerController.createUserPreferences);

export default router;

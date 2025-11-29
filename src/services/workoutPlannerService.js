import { supabase } from '../config/supabase.js';
import * as aiService from './aiService.js';
import * as exerciseService from './exerciseService.js';
import * as userService from './userService.js';

// ============================================================================
// MAIN WORKFLOW: AI WORKOUT PLAN GENERATION
// ============================================================================

/**
 * Generate a personalized weekly workout plan using AI
 *
 * This is the main entry point that:
 * 1. Fetches user profile data
 * 2. Fetches relevant exercises from database
 * 3. Calls OpenAI to generate plan structure
 * 4. Fetches full exercise details (with instructions)
 * 5. Saves plan to database
 * 6. Enforces business logic (single active plan, etc.)
 */
export async function generateWeeklyPlan({
  userId,
  fitness_goals,
  target_body_parts,
  days_per_week,
  hours_per_session,
  selected_days
}) {
  try {
    console.log(`📋 Step 1: Fetching user profile for ${userId}...`);

    // Get user profile data
    const user = await userService.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get user metadata (from users table or custom metadata)
    const userProfile = {
      gender: user.gender || 'not specified',
      age: calculateAge(user.date_of_birth),
      weight_kg: user.weight_kg,
      height_cm: user.height_cm
    };

    // Get user preferences for fitness level
    const preferences = await getUserPreferences(userId);
    const fitnessLevel = preferences?.fitness_level || 'beginner';

    console.log(`💪 Step 2: Fetching relevant exercises from database...`);

    // Fetch exercises filtered by target body parts
    const relevantExercises = await fetchExercisesForPlanner(target_body_parts, fitnessLevel);

    console.log(`📊 Found ${relevantExercises.length} relevant exercises`);

    // Create lightweight metadata for AI (saves tokens)
    const exerciseMetadata = relevantExercises.map(ex => ({
      id: ex.id,
      name: ex.name,
      bodyPart: ex.bodyPart,
      target: ex.target,
      equipment: ex.equipment,
      difficulty: ex.difficulty,
      category: ex.category
    }));

    console.log(`🤖 Step 3: Calling OpenAI to generate plan structure...`);

    // Call OpenAI to generate plan structure
    const aiPlanStructure = await aiService.generateWorkoutPlanWithAI({
      userProfile: { ...userProfile, fitnessLevel },
      preferences: {
        fitness_goals,
        target_body_parts,
        days_per_week,
        hours_per_session,
        selected_days
      },
      availableExercises: exerciseMetadata
    });

    console.log(`✅ AI generated plan: ${aiPlanStructure.plan_name}`);

    // Check if warm-up exercises were generated
    const warmUpCounts = aiPlanStructure.daily_workouts.map((day, idx) => ({
      day: idx + 1,
      warmUps: day.warm_up_exercises?.length || 0
    }));
    console.log(`🔥 Warm-up exercises per day:`, warmUpCounts);

    if (warmUpCounts.some(d => d.warmUps === 0)) {
      console.warn(`⚠️  Some days missing warm-up exercises!`);
    }

    console.log(`📅 Step 4: Fetching full exercise details from database...`);

    // Extract all exercise IDs from AI response
    const allExerciseIds = extractExerciseIds(aiPlanStructure.daily_workouts);

    // Fetch FULL exercise details (including instructions)
    const fullExercises = await fetchFullExerciseDetails(allExerciseIds);

    console.log(`📚 Fetched ${fullExercises.length} exercises with full details`);
    console.log(`💾 Step 5: Saving plan to database...`);

    // Build complete plan with exercise data
    const completePlan = buildPlanWithExerciseData(aiPlanStructure, fullExercises);

    // Save to database
    const savedPlan = await savePlanToDatabase(userId, completePlan, {
      fitness_goals,
      target_body_parts,
      days_per_week,
      hours_per_session,
      selected_days
    });

    console.log(`🎉 Workout plan created successfully: ${savedPlan.id}`);

    return savedPlan;
  } catch (error) {
    console.error('❌ Error generating weekly plan:', error);
    throw error;
  }
}

/**
 * Generate a workout plan PREVIEW with exercise alternatives
 * This does NOT save to database - returns plan structure for user to customize
 * Each exercise slot includes 3 alternatives for user to choose from
 */
export async function generatePlanPreview({
  userId,
  fitness_goals,
  target_body_parts,
  fitness_levels,
  days_per_week,
  hours_per_session,
  selected_days
}) {
  try {
    console.log(`📋 Generating plan preview for user ${userId}...`);

    // Get user profile data
    const user = await userService.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const userProfile = {
      gender: user.gender || 'not specified',
      age: calculateAge(user.date_of_birth),
      weight_kg: user.weight_kg,
      height_cm: user.height_cm
    };

    // Use the fitness levels provided by the user during plan creation (required)
    if (!fitness_levels || !Array.isArray(fitness_levels) || fitness_levels.length === 0) {
      throw new Error('fitness_levels is required and must be a non-empty array');
    }

    // Determine exercise range based on fitness level and session duration
    const exerciseRange = determineExerciseRange(fitness_levels, hours_per_session);
    console.log(`📊 Exercise range for ${fitness_levels.join(', ')} @ ${hours_per_session}h: ${exerciseRange.min}-${exerciseRange.max} exercises`);

    // Fetch relevant exercises for all selected fitness levels
    const relevantExercises = await fetchExercisesForPlanner(target_body_parts, fitness_levels);
    console.log(`📊 Found ${relevantExercises.length} relevant exercises`);

    const exerciseMetadata = relevantExercises.map(ex => ({
      id: ex.id,
      name: ex.name,
      bodyPart: ex.bodyPart,
      target: ex.target,
      equipment: ex.equipment,
      difficulty: ex.difficulty,
      category: ex.category
    }));

    // Generate base plan structure with AI
    console.log(`🤖 Calling AI to generate base plan...`);
    const aiPlanStructure = await aiService.generateWorkoutPlanWithAI({
      userProfile: { ...userProfile, fitnessLevels: fitness_levels },
      preferences: {
        fitness_goals,
        target_body_parts,
        days_per_week,
        hours_per_session,
        selected_days,
        exercise_range: exerciseRange
      },
      availableExercises: exerciseMetadata
    });

    // Check if warm-up exercises were generated
    const warmUpCounts = aiPlanStructure.daily_workouts.map((day, idx) => ({
      day: idx + 1,
      warmUps: day.warm_up_exercises?.length || 0
    }));
    console.log(`🔥 Warm-up exercises per day (preview):`, warmUpCounts);

    if (warmUpCounts.some(d => d.warmUps === 0)) {
      console.warn(`⚠️  AI did not generate warm-up exercises for some days!`);
    }

    // For each exercise in the plan, find 2 alternatives
    console.log(`🔄 Finding exercise alternatives...`);
    const planWithAlternatives = await addExerciseAlternatives(
      aiPlanStructure,
      relevantExercises
    );

    // Fetch full details for all exercises (main + alternatives)
    const allExerciseIds = extractAllExerciseIdsWithAlternatives(planWithAlternatives.daily_workouts);
    const fullExercises = await fetchFullExerciseDetails(allExerciseIds);

    // Build complete preview with full exercise data
    const completePlanPreview = buildPlanPreviewWithExerciseData(
      planWithAlternatives,
      fullExercises,
      {
        fitness_goals,
        target_body_parts,
        fitness_levels: fitness_levels,
        days_per_week,
        hours_per_session,
        selected_days
      }
    );

    console.log(`✅ Plan preview generated successfully`);
    return completePlanPreview;

  } catch (error) {
    console.error('❌ Error generating plan preview:', error);
    throw error;
  }
}

/**
 * Find 2 alternative exercises for each exercise in the plan using AI
 * Ensures alternatives are unique within each day (no exercise appears as alternative for multiple exercises)
 */
async function addExerciseAlternatives(aiPlan, availableExercises) {
  const planWithAlternatives = { ...aiPlan };

  // Process each day's workouts
  planWithAlternatives.daily_workouts = await Promise.all(
    aiPlan.daily_workouts.map(async (day) => {
      // Track used exercise IDs for this day to prevent duplicates
      const usedExerciseIds = new Set();

      // Add all main exercise IDs from this day to the used set
      day.exercises.forEach(ex => {
        if (ex.exercise_id) {
          usedExerciseIds.add(ex.exercise_id);
        }
      });

      // Process exercises sequentially to track alternatives properly
      const exercisesWithAlternatives = [];

      for (const exerciseRef of day.exercises) {
        // Find the main exercise
        const mainExercise = availableExercises.find(ex => ex.id === exerciseRef.exercise_id);

        if (!mainExercise) {
          exercisesWithAlternatives.push(exerciseRef);
          continue;
        }

        // Filter available exercises to exclude already used ones
        const availableForAlternatives = availableExercises.filter(
          ex => !usedExerciseIds.has(ex.id)
        );

        console.log(`🔄 Finding alternatives for: ${mainExercise.name} (${mainExercise.equipment})`);
        console.log(`   Available pool: ${availableForAlternatives.length} exercises`);

        // Use AI to recommend 2 alternative exercises
        const workoutContext = {
          focus_area: day.focus_area,
          target_muscles: day.target_muscles || []
        };

        const alternatives = await aiService.generateExerciseAlternatives({
          mainExercise,
          availableExercises: availableForAlternatives,
          workoutContext
        });

        // Log the alternatives found
        if (alternatives.length > 0) {
          const altDetails = alternatives.map(altId => {
            const alt = availableExercises.find(ex => ex.id === altId);
            return alt ? `${alt.name} (${alt.equipment})` : altId;
          });
          console.log(`   ✅ Alternatives: ${altDetails.join(' | ')}`);
        } else {
          console.log(`   ⚠️  No alternatives found`);
        }

        // Add the chosen alternatives to the used set
        alternatives.forEach(altId => usedExerciseIds.add(altId));

        exercisesWithAlternatives.push({
          ...exerciseRef,
          alternatives: alternatives.length > 0 ? alternatives : []
        });
      }

      return {
        ...day,
        exercises: exercisesWithAlternatives
      };
    })
  );

  return planWithAlternatives;
}

/**
 * Extract all exercise IDs including alternatives and warm-up exercises
 */
function extractAllExerciseIdsWithAlternatives(dailyWorkouts) {
  const exerciseIds = new Set();

  dailyWorkouts.forEach(day => {
    // Main exercises
    day.exercises.forEach(ex => {
      if (ex.exercise_id) {
        exerciseIds.add(ex.exercise_id);
      }
      if (ex.alternatives && ex.alternatives.length > 0) {
        ex.alternatives.forEach(altId => exerciseIds.add(altId));
      }
    });

    // Warm-up exercises
    if (day.warm_up_exercises && Array.isArray(day.warm_up_exercises)) {
      day.warm_up_exercises.forEach(ex => {
        if (ex.exercise_id) {
          exerciseIds.add(ex.exercise_id);
        }
      });
    }
  });

  return Array.from(exerciseIds);
}

/**
 * Build plan preview with full exercise data for main and alternatives
 */
function buildPlanPreviewWithExerciseData(aiPlan, fullExercises, preferences) {
  const exerciseMap = {};
  fullExercises.forEach(ex => {
    exerciseMap[ex.id] = ex;
  });

  const enrichedDailyWorkouts = aiPlan.daily_workouts.map(day => {
    const exercisesWithFullData = day.exercises.map(exerciseRef => {
      const mainExercise = exerciseMap[exerciseRef.exercise_id];
      if (!mainExercise) return null;

      // Get full data for alternatives
      const alternativesWithData = (exerciseRef.alternatives || [])
        .map(altId => exerciseMap[altId])
        .filter(Boolean)
        .map(alt => ({
          id: alt.id,
          name: alt.name,
          bodyPart: alt.bodyPart,
          target: alt.target,
          equipment: alt.equipment,
          difficulty: alt.difficulty,
          category: alt.category,
          image_url: alt.image_url,
          secondary_muscles: alt.secondary_muscles || [],
          instructions: alt.instructions || [],
          description: alt.description
        }));

      return {
        // Main exercise data
        id: mainExercise.id,
        name: mainExercise.name,
        bodyPart: mainExercise.bodyPart,
        target: mainExercise.target,
        equipment: mainExercise.equipment,
        difficulty: mainExercise.difficulty,
        category: mainExercise.category,
        image_url: mainExercise.image_url,
        secondary_muscles: mainExercise.secondary_muscles || [],
        instructions: mainExercise.instructions || [],
        description: mainExercise.description,
        // Workout-specific data from AI
        sets: exerciseRef.sets,
        reps: exerciseRef.reps,
        rest_seconds: exerciseRef.rest_seconds,
        tempo: exerciseRef.tempo,
        notes: exerciseRef.notes,
        // Alternatives
        alternatives: alternativesWithData
      };
    }).filter(Boolean);

    // Process warm-up exercises
    const warmUpExercisesWithFullData = (day.warm_up_exercises || []).map(exerciseRef => {
      const warmUpExercise = exerciseMap[exerciseRef.exercise_id];
      if (!warmUpExercise) return null;

      return {
        id: warmUpExercise.id,
        name: warmUpExercise.name,
        bodyPart: warmUpExercise.bodyPart,
        target: warmUpExercise.target,
        equipment: warmUpExercise.equipment,
        difficulty: warmUpExercise.difficulty,
        category: warmUpExercise.category,
        image_url: warmUpExercise.image_url,
        secondary_muscles: warmUpExercise.secondary_muscles || [],
        instructions: warmUpExercise.instructions || [],
        description: warmUpExercise.description,
        // Workout-specific data from AI
        sets: exerciseRef.sets || 1,
        reps: exerciseRef.reps || '10-15',
        rest_seconds: exerciseRef.rest_seconds || 30,
        notes: exerciseRef.notes || 'Light warm-up'
      };
    }).filter(Boolean);

    return {
      day_order: day.day_order,
      day_of_week: day.day_of_week,
      week_number: day.week_number,
      workout_name: day.workout_name,
      focus_area: day.focus_area,
      target_muscles: day.target_muscles || [],
      estimated_duration_minutes: day.estimated_duration_minutes,
      exercises: exercisesWithFullData,
      warm_up_exercises: warmUpExercisesWithFullData,
      warm_up: day.warm_up,
      cool_down: day.cool_down,
      workout_tips: day.workout_tips
    };
  });

  return {
    plan_name: aiPlan.plan_name,
    description: aiPlan.description,
    preferences: preferences,
    daily_workouts: enrichedDailyWorkouts
  };
}

/**
 * Finalize and save the user's customized plan to database
 * Accepts user's chosen exercises and saves only those (no alternatives)
 */
export async function finalizePlanPreview({
  userId,
  planPreview,
  userChoices,
  deletedExercises
}) {
  try {
    console.log(`💾 Finalizing plan for user ${userId}...`);

    // Apply user's exercise choices and remove deleted exercises
    const finalizedPlan = applyUserExerciseChoices(planPreview, userChoices, deletedExercises);

    // Fetch full exercise details for chosen exercises only
    const chosenExerciseIds = extractExerciseIds(finalizedPlan.daily_workouts);
    const fullExercises = await fetchFullExerciseDetails(chosenExerciseIds);

    // Build final plan with full exercise data (without alternatives)
    const completePlan = buildPlanWithExerciseData(finalizedPlan, fullExercises);

    // Save to database
    const savedPlan = await savePlanToDatabase(userId, completePlan, planPreview.preferences);

    console.log(`🎉 Plan finalized and saved: ${savedPlan.id}`);
    return savedPlan;

  } catch (error) {
    console.error('❌ Error finalizing plan:', error);
    throw error;
  }
}

/**
 * Apply user's exercise choices to replace alternatives with chosen exercises
 * Also filters out deleted exercises
 * userChoices format: { "day_0_exercise_0": "exercise_id", "day_1_exercise_2": "exercise_id", ... }
 * deletedExercises format: { "day_0": [1, 3], "day_2": [0], ... }
 */
function applyUserExerciseChoices(planPreview, userChoices, deletedExercises = {}) {
  const finalizedPlan = JSON.parse(JSON.stringify(planPreview)); // Deep clone

  finalizedPlan.daily_workouts = planPreview.daily_workouts.map((day, dayIndex) => {
    const dayKey = `day_${dayIndex}`;
    const deletedIndices = deletedExercises[dayKey] || [];

    // Filter out deleted exercises and apply user choices
    const exercises = day.exercises
      .map((exercise, exIndex) => {
        // Skip deleted exercises
        if (deletedIndices.includes(exIndex)) {
          return null;
        }

        const choiceKey = `day_${dayIndex}_exercise_${exIndex}`;
        const chosenExerciseId = userChoices[choiceKey];

        // If user made a choice, find the chosen exercise from alternatives
      if (chosenExerciseId && chosenExerciseId !== exercise.id) {
        const chosenAlt = exercise.alternatives?.find(alt => alt.id === chosenExerciseId);
        if (chosenAlt) {
          // Replace with chosen alternative, keep workout params (sets, reps, etc.)
          return {
            ...chosenAlt,
            sets: exercise.sets,
            reps: exercise.reps,
            rest_seconds: exercise.rest_seconds,
            tempo: exercise.tempo,
            notes: exercise.notes
          };
        }
      }

      // No choice made or invalid choice - keep default (remove alternatives)
      const { alternatives, ...exerciseWithoutAlternatives } = exercise;
      return exerciseWithoutAlternatives;
    })
    .filter(exercise => exercise !== null); // Remove deleted exercises

    return {
      ...day,
      exercises
    };
  });

  return finalizedPlan;
}

/**
 * Determine exercise range based on fitness level and session duration
 * - Beginner: 5-6 exercises per hour
 * - Intermediate: 7-8 exercises per hour
 * - Advanced: 8 exercises per hour
 */
function determineExerciseRange(fitnessLevels, hoursPerSession) {
  // Determine highest fitness level selected
  const level = fitnessLevels.includes('advanced') ? 'advanced'
              : fitnessLevels.includes('intermediate') ? 'intermediate'
              : 'beginner';

  // Base exercises per hour based on fitness level
  const exercisesPerHour = {
    beginner: { min: 5, max: 6 },
    intermediate: { min: 7, max: 8 },
    advanced: { min: 8, max: 8 }
  };

  const baseRange = exercisesPerHour[level];

  // Calculate total exercises based on session duration
  const minExercises = Math.round(baseRange.min * hoursPerSession);
  const maxExercises = Math.round(baseRange.max * hoursPerSession);

  // Ensure reasonable bounds (min 3, max 12)
  return {
    min: Math.max(3, minExercises),
    max: Math.min(12, maxExercises)
  };
}

/**
 * Fetch exercises filtered by user's target body parts
 * Also includes bodyweight/band exercises for warm-up
 * Reduces the number of exercises sent to AI
 */
async function fetchExercisesForPlanner(target_body_parts, fitnessLevels) {
  try {
    // Fetch main exercises matching target body parts
    let mainQuery = supabase
      .from('exercises')
      .select('id, name, bodyPart, target, equipment, difficulty, category, secondary_muscles');

    // Filter by body parts (case insensitive)
    if (target_body_parts && target_body_parts.length > 0) {
      mainQuery = mainQuery.or(
        target_body_parts.map(bp => `bodyPart.ilike.%${bp}%`).join(',')
      );
    }

    // Filter exercises based on selected fitness levels
    // Only include difficulties that match user's exact selections (no beginner unless selected)
    const allowedDifficulties = new Set();

    fitnessLevels.forEach(level => {
      if (level === 'beginner') {
        allowedDifficulties.add('beginner');
        allowedDifficulties.add('intermediate');
      } else if (level === 'intermediate') {
        allowedDifficulties.add('intermediate');
        allowedDifficulties.add('advanced');
      } else if (level === 'advanced') {
        allowedDifficulties.add('advanced');
      }
    });

    if (allowedDifficulties.size > 0) {
      mainQuery = mainQuery.in('difficulty', Array.from(allowedDifficulties));
    }

    console.log(`📊 Fitness levels selected: [${fitnessLevels.join(', ')}]`);
    console.log(`📊 Fetching exercises with difficulties: [${Array.from(allowedDifficulties).join(', ')}]`);

    const { data: mainExercises, error: mainError } = await mainQuery
      .order('difficulty')
      .limit(180); // Reduced limit to make room for warm-up exercises

    if (mainError) throw mainError;

    // Fetch additional warm-up exercises (bodyweight, band, assisted)
    const { data: warmUpExercises, error: warmUpError } = await supabase
      .from('exercises')
      .select('id, name, bodyPart, target, equipment, difficulty, category, secondary_muscles')
      .in('equipment', ['body weight', 'assisted', 'band'])
      .in('difficulty', ['beginner'])
      .limit(30);

    if (warmUpError) {
      console.warn('Could not fetch warm-up exercises:', warmUpError);
    }

    // Combine and deduplicate
    const allExercises = [...(mainExercises || [])];
    const exerciseIds = new Set(allExercises.map(ex => ex.id));

    // Add warm-up exercises that aren't already included
    (warmUpExercises || []).forEach(ex => {
      if (!exerciseIds.has(ex.id)) {
        allExercises.push(ex);
        exerciseIds.add(ex.id);
      }
    });

    const warmUpCount = warmUpExercises?.length || 0;
    console.log(`📊 Fetched ${allExercises.length} exercises (${mainExercises?.length || 0} main + ${warmUpCount} warm-up)`);

    if (warmUpCount === 0) {
      console.warn('⚠️  No warm-up exercises found! Check equipment values in database.');
    } else {
      console.log(`✅ Warm-up exercises available:`, warmUpExercises.slice(0, 5).map(ex => `${ex.name} (${ex.equipment})`));
    }

    return allExercises;
  } catch (error) {
    console.error('Error fetching exercises for planner:', error);
    // Return empty array on error - AI will still work
    return [];
  }
}

/**
 * Extract all unique exercise IDs from daily workouts
 * Handles both AI-generated format (exercise_id) and finalized format (id)
 * Also extracts warm_up_exercise IDs
 */
function extractExerciseIds(dailyWorkouts) {
  const exerciseIds = new Set();

  dailyWorkouts.forEach(day => {
    // Main exercises
    day.exercises.forEach(ex => {
      // Handle both formats: exercise_id (from AI) and id (from finalized plan)
      const exerciseId = ex.exercise_id || ex.id;
      if (exerciseId) {
        exerciseIds.add(exerciseId);
      }
    });

    // Warm-up exercises
    if (day.warm_up_exercises && Array.isArray(day.warm_up_exercises)) {
      day.warm_up_exercises.forEach(ex => {
        const exerciseId = ex.exercise_id || ex.id;
        if (exerciseId) {
          exerciseIds.add(exerciseId);
        }
      });
    }
  });

  return Array.from(exerciseIds);
}

/**
 * Fetch FULL exercise details from database (including instructions array)
 */
async function fetchFullExerciseDetails(exerciseIds) {
  try {
    if (!exerciseIds || exerciseIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from('exercises')
      .select('*') // Get everything including instructions
      .in('id', exerciseIds);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error fetching full exercise details:', error);
    return [];
  }
}

/**
 * Combine AI plan structure with full exercise details from database
 * Handles both AI-generated format (exercise_id) and finalized format (id)
 */
function buildPlanWithExerciseData(aiPlan, fullExercises) {
  // Create a lookup map for quick exercise access
  const exerciseMap = {};
  fullExercises.forEach(ex => {
    exerciseMap[ex.id] = ex;
  });

  // Populate each daily workout with full exercise data
  const enrichedDailyWorkouts = aiPlan.daily_workouts.map(day => {
    const exercisesWithFullData = day.exercises.map(exerciseRef => {
      // Handle both formats: exercise_id (from AI) and id (from finalized plan)
      const exerciseId = exerciseRef.exercise_id || exerciseRef.id;
      const fullExercise = exerciseMap[exerciseId];

      if (!fullExercise) {
        console.warn(`⚠️  Exercise ${exerciseId} not found in database`);
        return null;
      }

      return {
        // Exercise details from database
        id: fullExercise.id,
        name: fullExercise.name,
        bodyPart: fullExercise.bodyPart,
        target: fullExercise.target,
        equipment: fullExercise.equipment,
        difficulty: fullExercise.difficulty,
        category: fullExercise.category,
        image_url: fullExercise.image_url,
        secondary_muscles: fullExercise.secondary_muscles,
        instructions: fullExercise.instructions, // ✅ STEPS FROM DATABASE!
        description: fullExercise.description,

        // AI-generated workout parameters
        sets: exerciseRef.sets,
        reps: exerciseRef.reps,
        rest_seconds: exerciseRef.rest_seconds,
        tempo: exerciseRef.tempo,
        notes: exerciseRef.notes
      };
    }).filter(ex => ex !== null); // Remove null entries

    // Process warm-up exercises
    const warmUpExercisesWithFullData = (day.warm_up_exercises || []).map(exerciseRef => {
      const exerciseId = exerciseRef.exercise_id || exerciseRef.id;
      const fullExercise = exerciseMap[exerciseId];

      if (!fullExercise) {
        console.warn(`⚠️  Warm-up exercise ${exerciseId} not found in database`);
        return null;
      }

      return {
        // Exercise details from database
        id: fullExercise.id,
        name: fullExercise.name,
        bodyPart: fullExercise.bodyPart,
        target: fullExercise.target,
        equipment: fullExercise.equipment,
        difficulty: fullExercise.difficulty,
        category: fullExercise.category,
        image_url: fullExercise.image_url,
        secondary_muscles: fullExercise.secondary_muscles,
        instructions: fullExercise.instructions,
        description: fullExercise.description,

        // AI-generated workout parameters
        sets: exerciseRef.sets || 1,
        reps: exerciseRef.reps || '10-15',
        rest_seconds: exerciseRef.rest_seconds || 30,
        notes: exerciseRef.notes || 'Light warm-up'
      };
    }).filter(ex => ex !== null);

    return {
      ...day,
      exercises: exercisesWithFullData,
      warm_up_exercises: warmUpExercisesWithFullData
    };
  });

  return {
    ...aiPlan,
    daily_workouts: enrichedDailyWorkouts
  };
}

/**
 * Save AI-generated plan to database
 * Handles:
 * - Creating workout_plans record
 * - Creating daily_workouts records
 * - Calculating total_workouts
 * - Allows multiple active plans
 */
async function savePlanToDatabase(userId, completePlan, preferences) {
  try {
    // Create workout plan record
    const { data: plan, error: planError } = await supabase
      .from('workout_plans')
      .insert({
        user_id: userId,
        plan_name: completePlan.plan_name,
        description: completePlan.description,
        fitness_goals: preferences.fitness_goals,
        target_body_parts: preferences.target_body_parts,
        days_per_week: preferences.days_per_week,
        hours_per_session: preferences.hours_per_session,
        selected_days: preferences.selected_days,
        total_workouts: completePlan.daily_workouts.length,
        is_ai_generated: true,
        is_active: true,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (planError) throw planError;

    console.log(`✅ Created workout_plans record: ${plan.id}`);

    // Calculate scheduled dates for each workout
    const calculateScheduledDate = (dayOfWeek, weekNumber) => {
      const planStartDate = new Date(plan.started_at);
      const dayNameToIndex = {
        'sunday': 0,
        'monday': 1,
        'tuesday': 2,
        'wednesday': 3,
        'thursday': 4,
        'friday': 5,
        'saturday': 6
      };

      const targetDayIndex = dayNameToIndex[dayOfWeek?.toLowerCase()];
      if (targetDayIndex === undefined) return null;

      // Find the first occurrence of the target day from plan start date
      const currentDayIndex = planStartDate.getDay();
      let daysUntilFirstOccurrence = targetDayIndex - currentDayIndex;
      if (daysUntilFirstOccurrence < 0) {
        daysUntilFirstOccurrence += 7;
      }

      // Add weeks offset
      const totalDaysOffset = daysUntilFirstOccurrence + ((weekNumber - 1) * 7);

      const scheduledDate = new Date(planStartDate);
      scheduledDate.setDate(planStartDate.getDate() + totalDaysOffset);

      // Return in YYYY-MM-DD format for PostgreSQL DATE type
      return scheduledDate.toISOString().split('T')[0];
    };

    // Create daily workouts with scheduled dates
    const dailyWorkoutsToInsert = completePlan.daily_workouts.map((day, index) => ({
      workout_plan_id: plan.id,
      day_of_week: day.day_of_week,
      week_number: day.week_number || 1,
      day_order: day.day_order || (index + 1),
      workout_name: day.workout_name,
      focus_area: day.focus_area,
      target_muscles: day.target_muscles,
      estimated_duration_minutes: day.estimated_duration_minutes,
      exercises: day.exercises, // Store full exercise data as JSONB
      warm_up_exercises: day.warm_up_exercises || [], // Store warm-up exercises with full details
      warm_up: day.warm_up,
      cool_down: day.cool_down,
      workout_tips: day.workout_tips,
      scheduled_date: calculateScheduledDate(day.day_of_week, day.week_number || 1)
    }));

    const { data: dailyWorkouts, error: dailyError } = await supabase
      .from('daily_workouts')
      .insert(dailyWorkoutsToInsert)
      .select();

    if (dailyError) throw dailyError;

    console.log(`✅ Created ${dailyWorkouts.length} daily_workouts records`);

    // Return complete plan with daily workouts
    return {
      ...plan,
      daily_workouts: dailyWorkouts
    };
  } catch (error) {
    console.error('Error saving plan to database:', error);
    throw error;
  }
}

// ============================================================================
// BUSINESS LOGIC FUNCTIONS
// ============================================================================

/**
 * Deactivate all active plans for a user
 * (Utility function - not automatically enforced, allows multiple active plans)
 */
async function deactivateAllUserPlans(userId) {
  try {
    const { error } = await supabase
      .from('workout_plans')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw error;
  } catch (error) {
    console.error('Error deactivating user plans:', error);
    throw error;
  }
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;

  // Handle different date formats
  let birthDate;
  if (typeof dateOfBirth === 'string') {
    // Try DD/MM/YYYY format
    if (dateOfBirth.includes('/')) {
      const parts = dateOfBirth.split('/');
      if (parts.length === 3) {
        birthDate = new Date(parts[2], parts[1] - 1, parts[0]);
      }
    } else {
      birthDate = new Date(dateOfBirth);
    }
  } else {
    birthDate = new Date(dateOfBirth);
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

// ============================================================================
// WORKOUT PLANS CRUD
// ============================================================================

/**
 * Get all workout plans for a user
 */
export async function getUserPlans(userId, status = 'all') {
  try {
    let query = supabase
      .from('workout_plans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'completed') {
      query = query.not('completed_at', 'is', null);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error fetching user plans:', error);
    throw error;
  }
}

/**
 * Get a specific plan by ID with all daily workouts
 */
export async function getPlanById(planId, userId) {
  try {
    // Fetch plan
    const { data: plan, error: planError } = await supabase
      .from('workout_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', userId)
      .single();

    if (planError) {
      if (planError.code === 'PGRST116') return null;
      throw planError;
    }

    // Fetch daily workouts
    const { data: dailyWorkouts, error: dailyError } = await supabase
      .from('daily_workouts')
      .select('*')
      .eq('workout_plan_id', planId)
      .order('day_order');

    if (dailyError) throw dailyError;

    return {
      ...plan,
      daily_workouts: dailyWorkouts || []
    };
  } catch (error) {
    console.error('Error fetching plan by ID:', error);
    throw error;
  }
}

/**
 * Delete a workout plan
 */
export async function deletePlan(planId, userId) {
  try {
    const { data, error } = await supabase
      .from('workout_plans')
      .delete()
      .eq('id', planId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;

    return data && data.length > 0;
  } catch (error) {
    console.error('Error deleting plan:', error);
    throw error;
  }
}

/**
 * Activate a workout plan (allows multiple active plans)
 */
export async function activatePlan(planId, userId) {
  try {
    // Get the plan to check if it has been started before
    const { data: existingPlan, error: fetchError } = await supabase
      .from('workout_plans')
      .select('started_at')
      .eq('id', planId)
      .eq('user_id', userId)
      .single();

    if (fetchError) throw fetchError;

    // Only set started_at if it hasn't been set before
    const updateData = {
      is_active: true,
      updated_at: new Date().toISOString()
    };

    if (!existingPlan.started_at) {
      updateData.started_at = new Date().toISOString();
    }

    // Activate this plan
    const { data, error } = await supabase
      .from('workout_plans')
      .update(updateData)
      .eq('id', planId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error activating plan:', error);
    throw error;
  }
}

/**
 * Deactivate a workout plan
 */
export async function deactivatePlan(planId, userId) {
  try {
    const { data, error } = await supabase
      .from('workout_plans')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', planId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error deactivating plan:', error);
    throw error;
  }
}

/**
 * Get the current active plan
 */
export async function getCurrentActivePlan(userId) {
  try {
    const { data: plan, error: planError } = await supabase
      .from('workout_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (planError) {
      if (planError.code === 'PGRST116') return null;
      throw planError;
    }

    // Fetch daily workouts
    const { data: dailyWorkouts, error: dailyError } = await supabase
      .from('daily_workouts')
      .select('*')
      .eq('workout_plan_id', plan.id)
      .order('day_order');

    if (dailyError) throw dailyError;

    return {
      ...plan,
      daily_workouts: dailyWorkouts || []
    };
  } catch (error) {
    console.error('Error fetching active plan:', error);
    throw error;
  }
}

// ============================================================================
// DAILY WORKOUTS
// ============================================================================

/**
 * Get a daily workout with full exercise details
 */
export async function getDailyWorkoutWithExercises(dailyWorkoutId, userId) {
  try {
    const { data, error } = await supabase
      .from('daily_workouts')
      .select(`
        *,
        workout_plans!inner(user_id)
      `)
      .eq('id', dailyWorkoutId)
      .eq('workout_plans.user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    // Exercises are already stored with full details in the exercises JSONB column
    return data;
  } catch (error) {
    console.error('Error fetching daily workout:', error);
    throw error;
  }
}

/**
 * Get a daily workout by day order
 */
export async function getDailyWorkoutByDay(planId, dayOrder, userId) {
  try {
    // Verify plan ownership
    const plan = await getPlanById(planId, userId);
    if (!plan) return null;

    const { data, error } = await supabase
      .from('daily_workouts')
      .select('*')
      .eq('workout_plan_id', planId)
      .eq('day_order', dayOrder)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error fetching daily workout by day:', error);
    throw error;
  }
}

/**
 * Get the next incomplete workout
 * Smart detection: Returns today's workout, or tomorrow's if today is done/none scheduled
 */
export async function getNextIncompleteWorkout(planId, userId) {
  try {
    // Verify plan ownership
    const plan = await getPlanById(planId, userId);
    if (!plan) return null;

    // Get today's and tomorrow's dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // First, try to get today's incomplete workout
    const { data: todayWorkout, error: todayError } = await supabase
      .from('daily_workouts')
      .select('*')
      .eq('workout_plan_id', planId)
      .eq('is_completed', false)
      .eq('scheduled_date', todayStr)
      .order('day_order')
      .limit(1)
      .single();

    // If there's an incomplete workout for today, return it
    if (todayWorkout) {
      return todayWorkout;
    }

    // No workout today (or today's workout is completed), get tomorrow's or next upcoming
    const { data: upcomingWorkout, error: upcomingError } = await supabase
      .from('daily_workouts')
      .select('*')
      .eq('workout_plan_id', planId)
      .eq('is_completed', false)
      .gte('scheduled_date', tomorrowStr) // Tomorrow or later
      .order('scheduled_date')
      .order('day_order')
      .limit(1)
      .single();

    if (upcomingWorkout) {
      return upcomingWorkout;
    }

    // No upcoming workouts found, check if there are any incomplete workouts at all (past dates)
    const { data: anyIncomplete, error: anyError } = await supabase
      .from('daily_workouts')
      .select('*')
      .eq('workout_plan_id', planId)
      .eq('is_completed', false)
      .order('day_order')
      .limit(1)
      .single();

    if (anyError && anyError.code === 'PGRST116') {
      return null; // No incomplete workouts at all
    }
    if (anyError) throw anyError;

    // Return the first incomplete workout even if it's in the past
    return anyIncomplete;
  } catch (error) {
    console.error('Error fetching next workout:', error);
    throw error;
  }
}

// ============================================================================
// WORKOUT COMPLETION
// ============================================================================

/**
 * Complete a workout
 * Business Logic:
 * - Mark daily_workout as completed
 * - Create workout_completion record
 * - Update plan completion stats
 * - Check if plan is fully completed
 */
export async function completeWorkout({
  dailyWorkoutId,
  userId,
  duration_minutes,
  difficulty_rating,
  energy_level,
  notes,
  exercises_completed,
  share_to_feed
}) {
  try {
    // Get daily workout
    const dailyWorkout = await getDailyWorkoutWithExercises(dailyWorkoutId, userId);
    if (!dailyWorkout) {
      throw new Error('Daily workout not found');
    }

    // Update daily_workouts record
    const { error: updateError } = await supabase
      .from('daily_workouts')
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
        actual_duration_minutes: duration_minutes,
        difficulty_rating,
        completion_notes: notes
      })
      .eq('id', dailyWorkoutId);

    if (updateError) throw updateError;

    // Create workout_completion record
    const { data: completion, error: completionError } = await supabase
      .from('workout_completions')
      .insert({
        user_id: userId,
        daily_workout_id: dailyWorkoutId,
        workout_plan_id: dailyWorkout.workout_plan_id,
        duration_minutes,
        difficulty_rating,
        energy_level,
        notes,
        exercises_completed,
        shared_to_feed: share_to_feed || false
      })
      .select()
      .single();

    if (completionError) throw completionError;

    // Business Logic: Update plan completion stats
    await updatePlanCompletionStats(dailyWorkout.workout_plan_id);

    return completion;
  } catch (error) {
    console.error('Error completing workout:', error);
    throw error;
  }
}

/**
 * Update plan completion statistics
 * (Business Logic: manually update completed_workouts count and check if plan is done)
 */
async function updatePlanCompletionStats(planId) {
  try {
    // Count completed workouts
    const { count, error: countError } = await supabase
      .from('daily_workouts')
      .select('*', { count: 'exact', head: true })
      .eq('workout_plan_id', planId)
      .eq('is_completed', true);

    if (countError) throw countError;

    // Get total workouts
    const { data: plan, error: planError } = await supabase
      .from('workout_plans')
      .select('total_workouts')
      .eq('id', planId)
      .single();

    if (planError) throw planError;

    // Update plan
    const updateData = {
      completed_workouts: count || 0,
      updated_at: new Date().toISOString()
    };

    // If all workouts completed, mark plan as complete
    if (count >= plan.total_workouts) {
      updateData.completed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('workout_plans')
      .update(updateData)
      .eq('id', planId);

    if (updateError) throw updateError;
  } catch (error) {
    console.error('Error updating plan completion stats:', error);
    throw error;
  }
}

/**
 * Update a workout completion
 */
export async function updateWorkoutCompletion(dailyWorkoutId, userId, updates) {
  try {
    // Get existing completion
    const { data: existing, error: fetchError } = await supabase
      .from('workout_completions')
      .select('*')
      .eq('daily_workout_id', dailyWorkoutId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') return null;
      throw fetchError;
    }

    // Update
    const { data, error } = await supabase
      .from('workout_completions')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error updating workout completion:', error);
    throw error;
  }
}

// ============================================================================
// PROGRESS & STATS
// ============================================================================

/**
 * Get plan progress
 */
export async function getPlanProgress(planId, userId) {
  try {
    const plan = await getPlanById(planId, userId);
    if (!plan) return null;

    const completionPercentage = plan.total_workouts > 0
      ? Math.round((plan.completed_workouts / plan.total_workouts) * 100)
      : 0;

    return {
      plan_id: plan.id,
      plan_name: plan.plan_name,
      total_workouts: plan.total_workouts,
      completed_workouts: plan.completed_workouts,
      completion_percentage: completionPercentage,
      is_completed: plan.completed_at !== null,
      started_at: plan.started_at,
      completed_at: plan.completed_at
    };
  } catch (error) {
    console.error('Error fetching plan progress:', error);
    throw error;
  }
}

/**
 * Get overall user workout stats
 */
export async function getUserWorkoutStats(userId) {
  try {
    // Total plans
    const { count: totalPlans } = await supabase
      .from('workout_plans')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Completed plans
    const { count: completedPlans } = await supabase
      .from('workout_plans')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('completed_at', 'is', null);

    // Total workouts completed
    const { count: totalWorkoutsCompleted } = await supabase
      .from('workout_completions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Recent completions (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { count: recentCompletions } = await supabase
      .from('workout_completions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('completed_at', sevenDaysAgo.toISOString());

    return {
      total_plans: totalPlans || 0,
      completed_plans: completedPlans || 0,
      active_plans: (totalPlans || 0) - (completedPlans || 0),
      total_workouts_completed: totalWorkoutsCompleted || 0,
      recent_workouts_7_days: recentCompletions || 0
    };
  } catch (error) {
    console.error('Error fetching user workout stats:', error);
    throw error;
  }
}

/**
 * Get workout completion history
 */
export async function getWorkoutHistory(userId, limit = 10, offset = 0) {
  try {
    const { data, error } = await supabase
      .from('workout_completions')
      .select(`
        *,
        daily_workouts(workout_name, focus_area),
        workout_plans(plan_name)
      `)
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error fetching workout history:', error);
    throw error;
  }
}

/**
 * Get workout completion by daily workout ID
 */
export async function getWorkoutCompletionByDailyWorkoutId(dailyWorkoutId, userId) {
  try {
    const { data, error } = await supabase
      .from('workout_completions')
      .select('*')
      .eq('daily_workout_id', dailyWorkoutId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error fetching workout completion:', error);
    throw error;
  }
}

/**
 * Get workout completion by completion ID
 */
export async function getWorkoutCompletionById(completionId, userId) {
  try {
    const { data, error } = await supabase
      .from('workout_completions')
      .select('*')
      .eq('id', completionId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error fetching workout completion:', error);
    throw error;
  }
}

// ============================================================================
// USER PREFERENCES
// ============================================================================

/**
 * Get user preferences
 */
export async function getUserPreferences(userId) {
  try {
    const { data, error } = await supabase
      .from('workout_plan_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    throw error;
  }
}

/**
 * Create user preferences
 */
export async function createUserPreferences(userId, data) {
  try {
    const { data: preferences, error } = await supabase
      .from('workout_plan_preferences')
      .insert({
        user_id: userId,
        ...data,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    return preferences;
  } catch (error) {
    console.error('Error creating user preferences:', error);
    throw error;
  }
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(userId, updates) {
  try {
    // Check if preferences exist
    const existing = await getUserPreferences(userId);

    if (!existing) {
      // Create if doesn't exist
      return await createUserPreferences(userId, updates);
    }

    // Update
    const { data, error } = await supabase
      .from('workout_plan_preferences')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error updating user preferences:', error);
    throw error;
  }
}

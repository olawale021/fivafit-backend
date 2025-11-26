import { supabase } from '../config/supabase.js'

/**
 * Workout Service
 * Manages shared workout library - workouts are saved once and reused
 */

/**
 * Normalize workout name for similarity comparison
 * Removes common words, converts to lowercase, sorts words
 */
function normalizeWorkoutName(name) {
  const commonWords = ['the', 'a', 'an', 'and', 'or', 'for', 'with', 'training', 'workout', 'program', 'protocol']

  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .split(/\s+/)
    .filter(word => !commonWords.includes(word) && word.length > 0)
    .sort()
    .join(' ')
}

/**
 * Calculate similarity between two workout names (0-1 scale)
 * Uses normalized keyword matching
 */
function calculateNameSimilarity(name1, name2) {
  const normalized1 = normalizeWorkoutName(name1)
  const normalized2 = normalizeWorkoutName(name2)

  const words1 = new Set(normalized1.split(' '))
  const words2 = new Set(normalized2.split(' '))

  // Calculate Jaccard similarity (intersection / union)
  const intersection = new Set([...words1].filter(x => words2.has(x)))
  const union = new Set([...words1, ...words2])

  return intersection.size / union.size
}

/**
 * Check if two workouts are functionally similar
 * Compares level, reps, sets to ensure they're actually the same workout
 */
function areWorkoutsSimilar(workout1, workout2) {
  return workout1.level === workout2.level &&
         workout1.reps === workout2.reps &&
         workout1.sets === workout2.sets
}

/**
 * Check if a workout with the given name already exists
 * @param {string} workoutName - Unique workout name
 * @returns {Object|null} - Existing workout or null
 */
export async function getWorkoutByName(workoutName) {
  try {
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('name', workoutName)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - workout doesn't exist
        return null
      }
      console.error('Error fetching workout by name:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Error in getWorkoutByName:', error)
    return null
  }
}

/**
 * Find similar workouts by matching level and comparing name similarity
 * @param {Object} workoutData - Workout to find matches for
 * @param {number} similarityThreshold - Minimum similarity score (0-1), default 0.75
 * @returns {Object|null} - Most similar existing workout or null
 */
export async function findSimilarWorkout(workoutData, similarityThreshold = 0.75) {
  try {
    // Get all workouts with the same level
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('level', workoutData.level)

    if (error) {
      console.error('Error finding similar workouts:', error)
      return null
    }

    if (!data || data.length === 0) {
      return null
    }

    // Find the most similar workout
    let bestMatch = null
    let highestSimilarity = 0

    for (const existingWorkout of data) {
      // Check name similarity
      const nameSimilarity = calculateNameSimilarity(workoutData.name, existingWorkout.name)

      // Check if workouts are functionally similar (same reps, sets)
      const functionalSimilarity = areWorkoutsSimilar(workoutData, existingWorkout)

      // Combined score: name must be similar AND workout parameters must match
      if (nameSimilarity >= similarityThreshold && functionalSimilarity) {
        if (nameSimilarity > highestSimilarity) {
          highestSimilarity = nameSimilarity
          bestMatch = existingWorkout
        }
      }
    }

    if (bestMatch) {
      console.log(`🔍 Found similar workout: "${bestMatch.name}" (similarity: ${(highestSimilarity * 100).toFixed(1)}%)`)
    }

    return bestMatch
  } catch (error) {
    console.error('Error in findSimilarWorkout:', error)
    return null
  }
}

/**
 * Get multiple workouts by their IDs
 * @param {string[]} workoutIds - Array of workout UUIDs
 * @returns {Object[]} - Array of workout objects
 */
export async function getWorkoutsByIds(workoutIds) {
  try {
    if (!workoutIds || workoutIds.length === 0) {
      return []
    }

    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .in('id', workoutIds)

    if (error) {
      console.error('Error fetching workouts by IDs:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error in getWorkoutsByIds:', error)
    return []
  }
}

/**
 * Save a new workout to the library
 * Checks for exact name match first, then similar workouts
 * @param {Object} workoutData - Workout details
 * @returns {Object|null} - Saved or existing workout
 */
export async function saveWorkout(workoutData) {
  try {
    // Step 1: Check for exact name match
    const exactMatch = await getWorkoutByName(workoutData.name)
    if (exactMatch) {
      console.log(`♻️  Reusing existing workout (exact match): "${workoutData.name}"`)
      await incrementWorkoutUsage(exactMatch.id)
      return exactMatch
    }

    // Step 2: Check for similar workouts (fuzzy matching)
    const similarWorkout = await findSimilarWorkout(workoutData)
    if (similarWorkout) {
      console.log(`♻️  Reusing similar workout: "${workoutData.name}" → "${similarWorkout.name}"`)
      await incrementWorkoutUsage(similarWorkout.id)
      return similarWorkout
    }

    // Step 3: No match found, create new workout
    const { data, error } = await supabase
      .from('workouts')
      .insert([{
        name: workoutData.name,
        level: workoutData.level,
        reps: workoutData.reps,
        sets: workoutData.sets,
        description: workoutData.description,
        rest_period: workoutData.rest_period,
        tempo: workoutData.tempo,
        duration: workoutData.duration,
        instructions: workoutData.instructions,
        exercises: workoutData.exercises,
        common_mistakes: workoutData.common_mistakes,
        safety_tips: workoutData.safety_tips,
        biomechanics: workoutData.biomechanics,
        progressions: workoutData.progressions,
        regressions: workoutData.regressions,
        progression_to_next: workoutData.progression_to_next,
        times_used: 1
      }])
      .select()
      .single()

    if (error) {
      console.error('Error saving workout:', error)
      return null
    }

    console.log(`✅ Saved new workout: "${workoutData.name}"`)
    return data
  } catch (error) {
    console.error('Error in saveWorkout:', error)
    return null
  }
}

/**
 * Save multiple workouts from AI response
 * @param {Object[]} workouts - Array of workout objects from AI
 * @returns {string[]} - Array of workout IDs
 */
export async function saveWorkouts(workouts) {
  const workoutIds = []

  for (const workout of workouts) {
    const saved = await saveWorkout(workout)
    if (saved) {
      workoutIds.push(saved.id)
    }
  }

  return workoutIds
}

/**
 * Increment the times_used counter for a workout
 * @param {string} workoutId - Workout UUID
 */
export async function incrementWorkoutUsage(workoutId) {
  try {
    const { error } = await supabase
      .from('workouts')
      .update({
        times_used: supabase.raw('times_used + 1')
      })
      .eq('id', workoutId)

    if (error) {
      console.error('Error incrementing workout usage:', error)
    }
  } catch (error) {
    console.error('Error in incrementWorkoutUsage:', error)
  }
}

/**
 * Get workout statistics
 * @returns {Object} - Statistics about workout library
 */
export async function getWorkoutStats() {
  try {
    const { count, error } = await supabase
      .from('workouts')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('Error getting workout stats:', error)
      return { total: 0 }
    }

    return { total: count || 0 }
  } catch (error) {
    console.error('Error in getWorkoutStats:', error)
    return { total: 0 }
  }
}

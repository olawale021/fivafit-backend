import { supabase } from '../config/supabase.js'
import { getWorkoutsByIds } from './workoutService.js'

/**
 * Equipment Cache Service
 * Manages caching of AI-generated equipment analysis
 *
 * IMPORTANT: Variations are stored and retrieved by EQUIPMENT NAME, not category.
 * Each unique equipment (e.g., "Lat Pulldown Machine", "Cable Row Machine")
 * gets its own set of 15 variations, even if they're in the same category.
 *
 * NEW: Equipment cache now stores references to workouts (workout_ids) instead of
 * full workout data. Workouts are stored in a separate shared library to prevent duplicates.
 */

// Equipment categories mapping for better matching
// IMPORTANT: These categories must align with the AI prompt categories in aiService.js
const EQUIPMENT_CATEGORIES = {
  barbell: ['barbell', 'olympic bar', 'ez bar', 'trap bar', 'bench', 'weight bench', 'incline bench', 'decline bench', 'squat rack', 'power rack', 'half rack'],
  dumbbell: ['dumbbell', 'hex dumbbell', 'rubber dumbbell', 'adjustable dumbbell'],
  kettlebell: ['kettlebell', 'competition kettlebell'],
  cable: ['cable', 'cable machine', 'pulley', 'cable crossover', 'functional trainer', 'lat pulldown', 'seated row', 'cable column'],
  'leverage machine': ['leverage machine', 'chest press machine', 'shoulder press machine', 'leg press', 'leg extension', 'leg curl', 'hack squat', 'plate-loaded'],
  'smith machine': ['smith machine', 'smith'],
  'body weight': ['pull up bar', 'pull-up bar', 'dip station', 'parallel bars', 'gymnastic rings', 'captain\'s chair'],
  band: ['resistance band', 'therapy band', 'loop band', 'trx', 'suspension trainer'],
}

/**
 * Categorize equipment based on name
 */
export function categorizeEquipment(equipmentName) {
  const lowerName = equipmentName.toLowerCase()

  for (const [category, keywords] of Object.entries(EQUIPMENT_CATEGORIES)) {
    if (keywords.some(keyword => lowerName.includes(keyword))) {
      return category
    }
  }

  // Default to a sanitized version of the equipment name
  return lowerName.replace(/[^a-z0-9]/g, '_').substring(0, 50)
}

/**
 * Get cached equipment responses for a specific equipment name
 * Automatically populates workout details from the workouts table
 */
export async function getCachedEquipment(equipmentName, userGender = 'all', limit = 15) {
  try {
    const { data, error } = await supabase
      .from('equipment_cache')
      .select('*')
      .eq('equipment_name', equipmentName)
      .in('gender_targeted', [userGender, 'all'])
      .order('times_served', { ascending: true }) // Prefer less-served variations
      .limit(limit)

    if (error) {
      console.error('Error fetching cached equipment:', error)
      return []
    }

    if (!data || data.length === 0) {
      return []
    }

    // Populate workout details for each cached item
    const populatedData = await Promise.all(
      data.map(async (item) => {
        // Try new workout_ids field first, fall back to old recommended_workouts
        if (item.workout_ids && item.workout_ids.length > 0) {
          const workouts = await getWorkoutsByIds(item.workout_ids)
          return {
            ...item,
            recommended_workouts: workouts
          }
        } else if (item.recommended_workouts) {
          // Backward compatibility: use old format if workout_ids not present
          return item
        }
        return item
      })
    )

    return populatedData
  } catch (error) {
    console.error('Error in getCachedEquipment:', error)
    return []
  }
}

/**
 * Get a random cached equipment response for a specific equipment name
 */
export async function getRandomCachedEquipment(equipmentName, userGender = 'all') {
  const cached = await getCachedEquipment(equipmentName, userGender)

  if (!cached || cached.length === 0) {
    return null
  }

  // Weighted random selection (favor less-served items)
  const maxServed = Math.max(...cached.map(c => c.times_served))
  const weights = cached.map(c => maxServed - c.times_served + 1)
  const totalWeight = weights.reduce((a, b) => a + b, 0)

  let random = Math.random() * totalWeight
  for (let i = 0; i < cached.length; i++) {
    random -= weights[i]
    if (random <= 0) {
      return cached[i]
    }
  }

  return cached[0]
}

/**
 * Count variations for a specific equipment name
 */
export async function countVariations(equipmentName, userGender = 'all') {
  try {
    const { count, error } = await supabase
      .from('equipment_cache')
      .select('*', { count: 'exact', head: true })
      .eq('equipment_name', equipmentName)
      .in('gender_targeted', [userGender, 'all'])

    if (error) {
      console.error('Error counting variations:', error)
      return 0
    }

    return count || 0
  } catch (error) {
    console.error('Error in countVariations:', error)
    return 0
  }
}

/**
 * Save new equipment analysis to cache
 * Accepts workout_ids array (new format) or recommended_workouts (legacy)
 */
export async function saveEquipmentToCache(equipmentData) {
  try {
    const { data, error } = await supabase
      .from('equipment_cache')
      .insert([equipmentData])
      .select()

    if (error) {
      console.error('Error saving equipment to cache:', error)
      return null
    }

    console.log(`💾 Saved new equipment variation to cache: ${equipmentData.equipment_name}`)
    return data[0]
  } catch (error) {
    console.error('Error in saveEquipmentToCache:', error)
    return null
  }
}

/**
 * Update times served for a cached item
 */
export async function incrementTimesServed(cacheId) {
  try {
    // First, get current times_served value
    const { data: current, error: fetchError } = await supabase
      .from('equipment_cache')
      .select('times_served')
      .eq('id', cacheId)
      .single()

    if (fetchError) {
      console.error('Error fetching current times served:', fetchError)
      return
    }

    // Increment and update
    const { error: updateError } = await supabase
      .from('equipment_cache')
      .update({
        times_served: (current.times_served || 0) + 1,
        last_served_at: new Date().toISOString()
      })
      .eq('id', cacheId)

    if (updateError) {
      console.error('Error updating times served:', updateError)
    }
  } catch (error) {
    console.error('Error in incrementTimesServed:', error)
  }
}

/**
 * Delete a cached equipment entry by ID
 */
export async function deleteCachedEquipment(cacheId) {
  try {
    const { error } = await supabase
      .from('equipment_cache')
      .delete()
      .eq('id', cacheId)

    if (error) {
      console.error('Error deleting cached equipment:', error)
      return false
    }

    console.log(`🗑️ Deleted outdated cache entry: ${cacheId}`)
    return true
  } catch (error) {
    console.error('Error in deleteCachedEquipment:', error)
    return false
  }
}

/**
 * Check if we should use cache or make fresh API call
 * Returns true 80% of the time if cache exists
 */
export function shouldUseCache(hasCache) {
  if (!hasCache) return false
  return Math.random() < 0.8 // 80% chance to use cache
}

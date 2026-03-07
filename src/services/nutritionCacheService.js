import { supabase } from '../config/supabase.js'

const CACHE_MAX_AGE_DAYS = 30

/**
 * Normalize a food name for consistent cache lookups
 * "Grilled Chicken Breast" → "grilled chicken breast"
 */
function normalize(name) {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Look up cached nutrition data for a list of food items
 * @param {Array} items - [{ name, serving_size }]
 * @returns {object} - { cached: Map<index, nutritionData>, uncached: [{ index, name, serving_size }] }
 */
export async function lookupCache(items) {
  const cached = new Map()
  const uncached = []

  if (!items || items.length === 0) return { cached, uncached }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - CACHE_MAX_AGE_DAYS)

  // Build lookup pairs
  const lookups = items.map((item, i) => ({
    index: i,
    nameNorm: normalize(item.name),
    servingSize: (item.serving_size || '').trim()
  }))

  // Query all at once using OR conditions
  const { data, error } = await supabase
    .from('nutrition_cache')
    .select('*')
    .gt('last_used_at', cutoff.toISOString())
    .in('food_name_normalized', lookups.map(l => l.nameNorm))

  if (error) {
    console.error('[NutritionCache] Lookup error:', error.message)
    // On error, treat everything as uncached
    return { cached, uncached: items.map((item, i) => ({ index: i, ...item })) }
  }

  // Build a map of cached results: "name|serving" → row
  const cacheMap = new Map()
  for (const row of (data || [])) {
    const key = `${row.food_name_normalized}|${row.serving_size}`
    cacheMap.set(key, row)
  }

  // Match each item
  for (const lookup of lookups) {
    const key = `${lookup.nameNorm}|${lookup.servingSize}`
    const hit = cacheMap.get(key)

    if (hit) {
      cached.set(lookup.index, {
        name: items[lookup.index].name,
        serving_size: items[lookup.index].serving_size,
        calories: hit.calories,
        protein_g: parseFloat(hit.protein_g),
        carbs_g: parseFloat(hit.carbs_g),
        fat_g: parseFloat(hit.fat_g),
        fiber_g: parseFloat(hit.fiber_g),
        sugar_g: parseFloat(hit.sugar_g),
      })

      // Update hit_count and last_used_at in background (don't await)
      supabase
        .from('nutrition_cache')
        .update({ hit_count: hit.hit_count + 1, last_used_at: new Date().toISOString() })
        .eq('id', hit.id)
        .then(() => {})
        .catch(() => {})
    } else {
      uncached.push({ index: lookup.index, ...items[lookup.index] })
    }
  }

  return { cached, uncached }
}

/**
 * Save nutrition results to cache
 * @param {Array} items - [{ name, serving_size, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g }]
 */
export async function saveToCache(items) {
  if (!items || items.length === 0) return

  const rows = items.map(item => ({
    food_name_normalized: normalize(item.name),
    serving_size: (item.serving_size || '').trim(),
    calories: item.calories || 0,
    protein_g: item.protein_g || 0,
    carbs_g: item.carbs_g || 0,
    fat_g: item.fat_g || 0,
    fiber_g: item.fiber_g || 0,
    sugar_g: item.sugar_g || 0,
  }))

  const { error } = await supabase
    .from('nutrition_cache')
    .upsert(rows, { onConflict: 'food_name_normalized,serving_size' })

  if (error) {
    console.error('[NutritionCache] Save error:', error.message)
  } else {
    console.log(`[NutritionCache] Saved ${rows.length} items to cache`)
  }
}

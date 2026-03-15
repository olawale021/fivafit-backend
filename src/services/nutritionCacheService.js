import { supabase } from '../config/supabase.js'

const CACHE_MAX_AGE_DAYS = 30

/**
 * Normalize a food name for consistent cache lookups
 * "Grilled Chicken Breast" → "grilled chicken breast"
 * "boiled eggs" → "boiled egg"
 * "Steamed White Rice" → "steamed white rice"
 */
function normalize(name) {
  let s = name.toLowerCase().trim()

  // Collapse whitespace
  s = s.replace(/\s+/g, ' ')

  // Strip trailing 's' for simple plurals (eggs→egg, carrots→carrot, beans stays beans)
  // Only strip if the word is >3 chars and doesn't end in 'ss' (e.g., "glass")
  s = s.replace(/\b(\w{4,})s\b/g, (match, word) => {
    if (word.endsWith('s')) return match // "glass" → keep
    if (word.endsWith('ie')) return word.slice(0, -2) + 'y' // "berries" → "berry" (stripped s → "berrie" → "berry")
    return word
  })

  return s
}

/**
 * Word-number map for parseGrams
 */
const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

/**
 * Extract gram weight from a free-form serving size string.
 * Returns null if grams can't be determined.
 *
 * "approximately 250 grams" → 250
 * "about 200g"              → 200
 * "one whole egg (50g)"     → 50
 * "~150 grams"              → 150
 * "1 cup"                   → null
 */
export function parseGrams(servingStr) {
  if (!servingStr) return null

  let s = servingStr.toLowerCase().trim()

  // Strip filler words
  s = s.replace(/\b(approximately|about|roughly|around)\b/g, '')
  s = s.replace(/~/g, '')

  // Convert word-numbers to digits
  for (const [word, digit] of Object.entries(WORD_NUMBERS)) {
    s = s.replace(new RegExp(`\\b${word}\\b`, 'g'), String(digit))
  }

  // Match gram patterns: "250g", "250 grams", "250gm", "250 gm"
  const match = s.match(/(\d+(?:\.\d+)?)\s*(?:g(?:rams?)?|gm)\b/)
  if (match) {
    return parseFloat(match[1])
  }

  return null
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

  // Query by food_name_normalized only (not serving_size)
  const uniqueNames = [...new Set(lookups.map(l => l.nameNorm))]

  const { data, error } = await supabase
    .from('nutrition_cache')
    .select('*')
    .gt('last_used_at', cutoff.toISOString())
    .in('food_name_normalized', uniqueNames)

  if (error) {
    console.error('[NutritionCache] Lookup error:', error.message)
    return { cached, uncached: items.map((item, i) => ({ index: i, ...item })) }
  }

  // Build map: normalized_name → row
  const cacheMap = new Map()
  for (const row of (data || [])) {
    cacheMap.set(row.food_name_normalized, row)
  }

  // Match each item with scaling
  for (const lookup of lookups) {
    const hit = cacheMap.get(lookup.nameNorm)

    if (hit) {
      // Determine scaling ratio
      let ratio = 1
      const cachedGrams = hit.reference_grams ? parseFloat(hit.reference_grams) : null
      const requestedGrams = parseGrams(lookup.servingSize)

      if (cachedGrams && requestedGrams) {
        ratio = requestedGrams / cachedGrams
      }

      cached.set(lookup.index, {
        name: items[lookup.index].name,
        serving_size: items[lookup.index].serving_size,
        calories: Math.round(hit.calories * ratio),
        protein_g: parseFloat((parseFloat(hit.protein_g) * ratio).toFixed(1)),
        carbs_g: parseFloat((parseFloat(hit.carbs_g) * ratio).toFixed(1)),
        fat_g: parseFloat((parseFloat(hit.fat_g) * ratio).toFixed(1)),
        fiber_g: parseFloat((parseFloat(hit.fiber_g) * ratio).toFixed(1)),
        sugar_g: parseFloat((parseFloat(hit.sugar_g) * ratio).toFixed(1)),
      })

      // Update hit_count and last_used_at in background
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

  const rows = items.map(item => {
    const grams = parseGrams(item.serving_size)
    return {
      food_name_normalized: normalize(item.name),
      serving_size: (item.serving_size || '').trim(),
      serving_size_original: (item.serving_size || '').trim(),
      reference_grams: grams,
      calories: item.calories || 0,
      protein_g: item.protein_g || 0,
      carbs_g: item.carbs_g || 0,
      fat_g: item.fat_g || 0,
      fiber_g: item.fiber_g || 0,
      sugar_g: item.sugar_g || 0,
    }
  })

  const { error } = await supabase
    .from('nutrition_cache')
    .upsert(rows, { onConflict: 'food_name_normalized' })

  if (error) {
    console.error('[NutritionCache] Save error:', error.message)
  } else {
    console.log(`[NutritionCache] Saved ${rows.length} items to cache`)
  }
}

const EDAMAM_APP_ID = process.env.EDAMAM_APP_ID
const EDAMAM_APP_KEY = process.env.EDAMAM_APP_KEY
const BASE_URL = 'https://api.edamam.com/api/recipes/v2'

// Edamam signs image URLs with a 1-hour expiry — cached responses must die
// before their images do, or clients render broken pictures
const SEARCH_CACHE_TTL_MS = 45 * 60 * 1000 // 45 minutes
const DETAIL_CACHE_TTL_MS = 45 * 60 * 1000 // 45 minutes
const MAX_STALE_MS = 55 * 60 * 1000 // never serve stale data older than this
const MAX_CACHE_ENTRIES = 300
const RECIPES_PER_SHELF = 10

// Fields requested from Edamam to keep payloads slim
const FIELDS = [
  'uri', 'label', 'image', 'images', 'source', 'url', 'yield', 'calories',
  'totalNutrients', 'totalTime', 'cuisineType', 'mealType',
  'dietLabels', 'healthLabels', 'ingredientLines',
]

// In-memory response cache (Edamam license forbids persistent storage of recipe data)
const cache = new Map()
// Coalesce concurrent cold requests for the same key into one upstream call
const inFlight = new Map()
// Negative cache: after a 429, hold off retrying the same query upstream
const rateLimitedUntil = new Map()
const RATE_LIMIT_BACKOFF_MS = 30 * 1000

const CUISINE_ROTATION = ['Italian', 'Mexican', 'Indian', 'Japanese', 'Mediterranean', 'Middle Eastern', 'Chinese']

/**
 * Shelf definitions, personalized per request from lightweight client signals:
 * local hour (meal shelf + copy), remaining protein (gap shelf title), and
 * the user's fitness goals (one tailored shelf). Params stay bucketed so
 * different users still share cache entries.
 */
// Dish types that count as "actual food" — keeps drinks, teas, sauces,
// desserts and preps out of the meal shelves
const MEAL_DISHES = ['main course', 'salad', 'soup', 'sandwiches']
const BREAKFAST_DISHES = ['egg', 'pancake', 'cereals', 'bread', 'main course']

function resolveShelves({ maxCalories, proteinLeft, goals, cuisines, health, ingredients } = {}) {
  const ingredientList = (typeof ingredients === 'string' ? ingredients.split(',') : ingredients || [])
    .map((i) => i.trim())
    .filter(Boolean)

  // Every shelf is SCOPED to the user's pantry — but each shelf takes ONE
  // rotating ingredient, not the whole list. Querying all items at once makes
  // every shelf the same all-ingredients mash; one-per-shelf gives beans-only
  // lunches, chicken dinners, etc. "From Your Kitchen" keeps the full combo,
  // and boost-ranking still floats multi-ingredient matches everywhere.
  const pantryPick = (slot) =>
    ingredientList.length > 0 ? ingredientList[(slot + dayOfYear()) % ingredientList.length] : null
  const withPantry = (params, slot = 0) => {
    const item = pantryPick(slot)
    return item ? { ...params, q: params.q ? `${params.q} ${item}` : item } : params
  }

  // Preferred cuisines each get their own shelf (capped); without preferences a
  // single spotlight rotates daily through the generic list. 'African' is
  // app-only — Edamam has no african cuisineType, so it maps to a keyword query.
  const cuisineList = (typeof cuisines === 'string' ? cuisines.split(',') : cuisines || []).filter(Boolean)
  const cuisineParams = (c) =>
    c.toLowerCase() === 'african'
      ? withPantry({ q: 'african', dishType: ['main course'] }, 6)
      : withPantry({ cuisineType: c, dishType: ['main course'] }, 6)

  let cuisineShelves
  if (cuisineList.length > 0) {
    // First 3 in the user's saved order; if they picked more, the extras rotate
    // through the third slot daily
    let ordered = cuisineList
    if (cuisineList.length > 3) {
      const extras = cuisineList.slice(2)
      ordered = [...cuisineList.slice(0, 2), extras[dayOfYear() % extras.length]]
    }
    cuisineShelves = ordered.slice(0, 3).map((c) => ({
      key: `cuisine_${c.toLowerCase().replace(/[^a-z]+/g, '_')}`,
      title: `Taste of ${c}`,
      params: cuisineParams(c),
    }))
  } else {
    const cuisine = CUISINE_ROTATION[dayOfYear() % CUISINE_ROTATION.length]
    cuisineShelves = [{ key: 'cuisine_spotlight', title: `Taste of ${cuisine}`, params: cuisineParams(cuisine) }]
  }

  const healthList = (typeof health === 'string' ? health.split(',') : health || []).filter(Boolean)

  const shelves = []

  // Recipes built around what the user says is in their kitchen
  if (ingredientList.length > 0) {
    shelves.push({
      key: 'my_kitchen',
      title: 'From Your Kitchen',
      params: { q: ingredientList.slice(0, 6).join(' '), dishType: MEAL_DISHES },
    })
  }

  shelves.push(
    {
      key: 'high_protein',
      // Food-first name; the personal protein-gap number lives in the hero overline
      title: 'Protein-Packed',
      // Absolute >=20g protein per serving — diet=high-protein alone is a
      // calorie *ratio*, which lets near-zero-calorie drinks qualify
      params: withPantry({ diet: 'high-protein', 'nutrients[PROCNT]': '20+', dishType: MEAL_DISHES }, 0),
    },
    {
      key: 'best_breakfast',
      title: 'Best for Breakfast',
      params: withPantry({ mealType: 'Breakfast', dishType: BREAKFAST_DISHES }, 1),
    },
    {
      key: 'best_lunch',
      title: 'Best for Lunch',
      // Edamam merges lunch/dinner into one mealType — differentiate by dish
      params: withPantry({ mealType: 'Lunch', dishType: ['salad', 'sandwiches', 'soup'] }, 2),
    },
    {
      key: 'best_dinner',
      title: 'Best for Dinner',
      params: withPantry({ mealType: 'Dinner', dishType: ['main course'] }, 3),
    },
    {
      key: 'under_500',
      title: 'Under 500 Cal',
      params: withPantry({ calories: '0-500', dishType: MEAL_DISHES }, 4),
    },
    {
      key: 'quick_easy',
      title: 'Quick & Easy',
      params: withPantry({ time: '1-30', dishType: ['main course', 'salad', 'sandwiches'] }, 5),
    },
    ...cuisineShelves
  )

  // One goal-tailored shelf, highest-priority goal wins
  const goalList = typeof goals === 'string' ? goals.split(',') : Array.isArray(goals) ? goals : []
  if (goalList.includes('weight_loss')) {
    shelves.push({
      key: 'for_goal',
      title: 'Light & Filling',
      params: withPantry({ diet: 'high-fiber', calories: '0-450', dishType: MEAL_DISHES }, 7),
    })
  } else if (goalList.includes('muscle_building') || goalList.includes('strength')) {
    shelves.push({
      key: 'for_goal',
      title: 'Fuel for Muscle',
      params: withPantry({ diet: 'high-protein', calories: '450-800', dishType: MEAL_DISHES }, 7),
    })
  } else if (goalList.includes('endurance')) {
    shelves.push({
      key: 'for_goal',
      title: 'Endurance Fuel',
      params: withPantry({ diet: 'balanced', calories: '450-800', dishType: MEAL_DISHES }, 7),
    })
  }

  const budget = Number(maxCalories)
  if (Number.isFinite(budget) && budget >= 150) {
    // Floor to nearest 50 so many users share one cache entry and results never exceed budget
    const bucket = Math.floor(budget / 50) * 50
    shelves.push({
      key: 'fits_budget',
      title: 'Fits Your Remaining Calories',
      params: withPantry({ calories: `0-${bucket}`, dishType: MEAL_DISHES }, 8),
    })
  }

  // Dietary needs apply to every shelf
  if (healthList.length > 0) {
    shelves.forEach((shelf) => {
      shelf.params.health = healthList
    })
  }

  return shelves
}

/**
 * Convert Edamam shelf params to the client-facing search filter shape,
 * so "SEE ALL" can pre-seed the browse screen.
 */
function toClientFilters(params) {
  const filters = {}
  if (params.diet) filters.diet = params.diet
  if (params.mealType) filters.mealType = params.mealType
  if (params.cuisineType) filters.cuisineType = params.cuisineType
  if (params.time) filters.time = params.time
  if (params.dishType) {
    filters.dishType = Array.isArray(params.dishType) ? params.dishType.join(',') : params.dishType
  }
  if (params.health) {
    filters.health = Array.isArray(params.health) ? params.health.join(',') : params.health
  }
  if (params.q) filters.q = params.q
  if (params.calories) {
    const [min, max] = params.calories.split('-')
    if (min && min !== '0') filters.caloriesMin = Number(min)
    if (max) filters.caloriesMax = Number(max)
  }
  return filters
}

function dayOfYear() {
  const now = new Date()
  return Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)
}

function buildSearchUrl(params) {
  const url = new URL(BASE_URL)
  url.searchParams.set('type', 'public')
  url.searchParams.set('app_id', EDAMAM_APP_ID)
  url.searchParams.set('app_key', EDAMAM_APP_KEY)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, v))
    } else {
      url.searchParams.set(key, value)
    }
  }
  FIELDS.forEach((f) => url.searchParams.append('field', f))
  return url.toString()
}

function cacheKeyFor(url) {
  // Strip credentials so logs/keys never include them
  return url.replace(/app_id=[^&]*&app_key=[^&]*&?/, '')
}

function getCached(key, ttl) {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.timestamp < ttl) return entry.data
  return null
}

function getStale(key) {
  const entry = cache.get(key)
  // A stale response older than the image-URL lifetime is worse than nothing
  if (entry && Date.now() - entry.timestamp < MAX_STALE_MS) return entry.data
  return null
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() })
  if (cache.size > MAX_CACHE_ENTRIES) {
    const now = Date.now()
    for (const [k, v] of cache) {
      if (now - v.timestamp > DETAIL_CACHE_TTL_MS) cache.delete(k)
    }
  }
}

/**
 * Convert an Edamam recipe hit (whole-recipe nutrients) to a slim per-serving shape.
 */
export function toPerServing(recipe, { includeIngredients = false } = {}) {
  const servings = Math.max(1, Math.round(recipe.yield || 1))
  const nutrient = (code) => {
    const n = recipe.totalNutrients?.[code]
    return n ? parseFloat((n.quantity / servings).toFixed(1)) : 0
  }

  const id = recipe.uri?.split('#recipe_')[1] || null

  const slim = {
    id,
    uri: recipe.uri,
    label: recipe.label,
    image: recipe.image || null,
    imageLarge: recipe.images?.LARGE?.url || recipe.images?.REGULAR?.url || recipe.image || null,
    source: recipe.source || null,
    url: recipe.url || null,
    servings,
    totalTime: recipe.totalTime || 0,
    cuisineType: recipe.cuisineType || [],
    mealType: recipe.mealType || [],
    dietLabels: recipe.dietLabels || [],
    healthLabels: recipe.healthLabels || [],
    perServing: {
      calories: Math.round((recipe.calories || 0) / servings),
      protein_g: nutrient('PROCNT'),
      carbs_g: nutrient('CHOCDF'),
      fat_g: nutrient('FAT'),
      fiber_g: nutrient('FIBTG'),
      sugar_g: nutrient('SUGAR'),
    },
  }

  if (includeIngredients) {
    slim.ingredientLines = recipe.ingredientLines || []
  }

  return slim
}

/**
 * Extract the _cont pagination token from an Edamam next link.
 */
function extractCont(links) {
  const href = links?.next?.href
  if (!href) return null
  try {
    return new URL(href).searchParams.get('_cont')
  } catch {
    return null
  }
}

async function fetchEdamam(url, cacheKey, ttl, { cacheOnly = false } = {}) {
  const cached = getCached(cacheKey, ttl)
  if (cached) return { success: true, data: cached, source: 'cache' }
  if (cacheOnly) {
    const stale = getStale(cacheKey)
    if (stale) return { success: true, data: stale, source: 'stale-cache' }
    return { success: false, error: 'cold' }
  }

  // Back off queries that just got rate-limited instead of hammering upstream
  const blockedUntil = rateLimitedUntil.get(cacheKey)
  if (blockedUntil && Date.now() < blockedUntil) {
    const stale = getStale(cacheKey)
    if (stale) return { success: true, data: stale, source: 'stale-cache' }
    return { success: false, error: 'rate_limited' }
  }
  rateLimitedUntil.delete(cacheKey)

  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)

  const promise = (async () => {
    try {
      const response = await fetch(url, {
        // NOTE: no Edamam-Account-User header — the Enterprise Basic plan rejects it with 401
        headers: { 'User-Agent': 'StepMode/1.0 (fitness app)' },
      })

      if (!response.ok) {
        console.error('[Recipes] Edamam error:', response.status, cacheKey)
        if (response.status === 404) {
          return { success: false, error: 'not_found' }
        }
        if (response.status === 429) {
          rateLimitedUntil.set(cacheKey, Date.now() + RATE_LIMIT_BACKOFF_MS)
        }
        // Serve stale cache on upstream failure if we have anything
        const stale = getStale(cacheKey)
        if (stale) return { success: true, data: stale, source: 'stale-cache' }
        if (response.status === 429) return { success: false, error: 'rate_limited' }
        return { success: false, error: 'upstream' }
      }

      const json = await response.json()
      setCached(cacheKey, json)
      return { success: true, data: json, source: 'edamam' }
    } catch (error) {
      console.error('[Recipes] Fetch error:', error.message)
      const stale = getStale(cacheKey)
      if (stale) return { success: true, data: stale, source: 'stale-cache' }
      return { success: false, error: 'upstream' }
    } finally {
      inFlight.delete(cacheKey)
    }
  })()

  inFlight.set(cacheKey, promise)
  return promise
}

/**
 * Search recipes. Whitelisted params: q, diet, health, cuisineType, mealType,
 * dishType, calories, time, cont.
 */
/**
 * Count how many of the user's pantry ingredients appear in a recipe's
 * ingredient lines. Used to float "cook with what you have" matches to the
 * top of every shelf without narrowing the underlying queries.
 */
function pantryScore(recipe, pantry) {
  const text = (recipe.ingredientLines || []).join(' ').toLowerCase()
  return pantry.reduce((score, item) => (text.includes(item) ? score + 1 : score), 0)
}

export async function searchRecipes(params = {}, { cacheOnly = false, rankIngredients } = {}) {
  if (!EDAMAM_APP_ID || !EDAMAM_APP_KEY) {
    return { success: false, error: 'not_configured' }
  }

  const allowed = {}
  const WHITELIST = ['q', 'diet', 'health', 'cuisineType', 'mealType', 'dishType', 'calories', 'time', 'nutrients[PROCNT]']
  for (const key of WHITELIST) {
    if (params[key] !== undefined) allowed[key] = params[key]
  }
  if (params.cont) allowed._cont = params.cont

  // 'African' has no Edamam cuisineType — fold it into the keyword query.
  // cuisineType is repeatable (OR), so multiple selections pass straight through.
  if (allowed.cuisineType) {
    const list = Array.isArray(allowed.cuisineType) ? allowed.cuisineType : [allowed.cuisineType]
    const rest = list.filter((c) => c.toLowerCase() !== 'african')
    if (rest.length !== list.length) {
      allowed.q = allowed.q ? `${allowed.q} african` : 'african'
    }
    if (rest.length === 0) delete allowed.cuisineType
    else allowed.cuisineType = rest.length === 1 ? rest[0] : rest
  }

  const url = buildSearchUrl(allowed)
  const key = cacheKeyFor(url)
  const result = await fetchEdamam(url, key, SEARCH_CACHE_TTL_MS, { cacheOnly })
  if (!result.success) return result

  let hits = result.data.hits || []
  const pantry = (rankIngredients || []).map((i) => i.toLowerCase()).filter(Boolean)
  if (pantry.length > 0) {
    // Stable sort: pantry matches first, original relevance order otherwise
    hits = hits
      .map((h, i) => ({ h, i, score: pantryScore(h.recipe, pantry) }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
    return {
      success: true,
      source: result.source,
      data: {
        recipes: hits.map(({ h, score }) => ({ ...toPerServing(h.recipe), pantryMatches: score })),
        nextCont: extractCont(result.data._links),
      },
    }
  }
  return {
    success: true,
    source: result.source,
    data: {
      recipes: hits.map((h) => toPerServing(h.recipe)),
      nextCont: extractCont(result.data._links),
    },
  }
}

/**
 * Fetch a single recipe by its Edamam id (hex fragment of the URI).
 */
export async function getRecipeById(id) {
  if (!EDAMAM_APP_ID || !EDAMAM_APP_KEY) {
    return { success: false, error: 'not_configured' }
  }
  if (!/^[a-f0-9]+$/i.test(id)) {
    return { success: false, error: 'not_found' }
  }

  const url = new URL(`${BASE_URL}/${id}`)
  url.searchParams.set('type', 'public')
  url.searchParams.set('app_id', EDAMAM_APP_ID)
  url.searchParams.set('app_key', EDAMAM_APP_KEY)
  FIELDS.forEach((f) => url.searchParams.append('field', f))

  const fullUrl = url.toString()
  const key = cacheKeyFor(fullUrl)
  const result = await fetchEdamam(fullUrl, key, DETAIL_CACHE_TTL_MS)
  if (!result.success) return result

  const recipe = result.data.recipe
  if (!recipe) return { success: false, error: 'not_found' }

  return {
    success: true,
    source: result.source,
    data: toPerServing(recipe, { includeIngredients: true }),
  }
}

/**
 * Build the shelves feed. One cached search per shelf; failures/empties are dropped.
 */
export async function getShelves(options = {}) {
  if (!EDAMAM_APP_ID || !EDAMAM_APP_KEY) {
    return { success: false, error: 'not_configured' }
  }

  const shelves = resolveShelves(options)
  const pantry = (typeof options.ingredients === 'string'
    ? options.ingredients.split(',')
    : options.ingredients || []
  )
    .map((i) => i.trim())
    .filter(Boolean)
  const searchOpts = pantry.length > 0 ? { rankIngredients: pantry } : {}

  // Edamam allows 10 requests/min — a fully cold load must not spend the whole
  // allowance. Serve warm/stale shelves for free, live-fetch the most important
  // cold ones up to a budget, and background-fill the rest after the window.
  const MAX_COLD_FETCHES = 6
  const PRIORITY = ['fits_budget', 'my_kitchen', 'high_protein', 'best_breakfast', 'best_lunch', 'best_dinner', 'for_goal', 'under_500', 'quick_easy']
  // Cuisine shelves rank between meals and the generic extras
  const priorityOf = (key) => {
    const p = PRIORITY.indexOf(key)
    if (p !== -1) return p
    return key.startsWith('cuisine_') ? 5.5 : PRIORITY.length
  }

  const warm = await Promise.all(shelves.map((s) => searchRecipes(s.params, { cacheOnly: true, ...searchOpts })))
  const coldIdx = shelves
    .map((_, i) => i)
    .filter((i) => !warm[i].success)
    .sort((a, b) => priorityOf(shelves[a].key) - priorityOf(shelves[b].key))
  const fetchNow = new Set(coldIdx.slice(0, MAX_COLD_FETCHES))
  const deferred = coldIdx.slice(MAX_COLD_FETCHES)

  const results = await Promise.allSettled(
    shelves.map((shelf, i) => {
      if (warm[i].success) return Promise.resolve(warm[i])
      if (fetchNow.has(i)) return searchRecipes(shelf.params, searchOpts)
      return Promise.resolve({ success: false, error: 'deferred' })
    })
  )

  // Warm the deferred shelves once the rate window has passed, staggered,
  // so the user's next visit finds them cached
  if (deferred.length > 0) {
    deferred.forEach((i, j) => {
      setTimeout(() => {
        searchRecipes(shelves[i].params).catch(() => {})
      }, 65000 + j * 7000)
    })
  }

  const data = []
  results.forEach((result, i) => {
    if (result.status !== 'fulfilled' || !result.value.success) return
    const recipes = result.value.data.recipes.slice(0, RECIPES_PER_SHELF)
    if (recipes.length === 0) return
    data.push({
      key: shelves[i].key,
      title: shelves[i].title,
      filters: toClientFilters(shelves[i].params),
      recipes,
    })
  })

  if (data.length === 0) {
    return { success: false, error: 'upstream' }
  }

  return { success: true, data }
}

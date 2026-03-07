import { supabase } from '../config/supabase.js'

const CACHE_MAX_AGE_DAYS = 90

/**
 * Look up a product by barcode — checks cache first, then Open Food Facts
 * @param {string} barcode - UPC/EAN barcode string
 * @returns {{ success: boolean, data?: object, error?: string, source?: 'cache'|'api' }}
 */
export async function lookupBarcode(barcode) {
  try {
    // 1. Check cache
    const cached = await getFromCache(barcode)
    if (cached) {
      // Update hit count in background
      updateCacheHit(barcode).catch(() => {})
      return { success: true, data: cached, source: 'cache' }
    }

    // 2. Fetch from Open Food Facts API (free, no API key required)
    console.log(`[Barcode] Cache miss — fetching from Open Food Facts: ${barcode}`)
    const product = await fetchFromOpenFoodFacts(barcode)

    if (!product) {
      return { success: false, error: 'Product not found for this barcode' }
    }

    // 3. Save to cache in background
    saveToCache(barcode, product).catch(() => {})

    return { success: true, data: product, source: 'api' }
  } catch (error) {
    console.error('[Barcode] Lookup error:', error.message)
    return { success: false, error: 'Failed to look up barcode' }
  }
}

/**
 * Fetch product data from Open Food Facts API
 */
async function fetchFromOpenFoodFacts(barcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,serving_size,nutriments,image_front_small_url`

  const response = await fetch(url, {
    headers: { 'User-Agent': 'StepMode/1.0 (fitness app)' },
  })

  if (!response.ok) {
    console.error(`[Barcode] Open Food Facts returned ${response.status}`)
    return null
  }

  const json = await response.json()

  if (json.status !== 1 || !json.product) {
    return null
  }

  const p = json.product
  const n = p.nutriments || {}

  // Open Food Facts stores per-100g values; also has per-serving if available
  // Prefer per-serving values when available
  const hasServing = n['energy-kcal_serving'] !== undefined

  return {
    product_name: p.product_name || 'Unknown Product',
    brand: p.brands || null,
    serving_size: p.serving_size || (hasServing ? null : '100g'),
    calories: Math.round(hasServing ? (n['energy-kcal_serving'] || 0) : (n['energy-kcal_100g'] || 0)),
    protein_g: parseFloat((hasServing ? (n.proteins_serving || 0) : (n.proteins_100g || 0)).toFixed(1)),
    carbs_g: parseFloat((hasServing ? (n.carbohydrates_serving || 0) : (n.carbohydrates_100g || 0)).toFixed(1)),
    fat_g: parseFloat((hasServing ? (n.fat_serving || 0) : (n.fat_100g || 0)).toFixed(1)),
    fiber_g: parseFloat((hasServing ? (n.fiber_serving || 0) : (n.fiber_100g || 0)).toFixed(1)),
    sugar_g: parseFloat((hasServing ? (n.sugars_serving || 0) : (n.sugars_100g || 0)).toFixed(1)),
    image_url: p.image_front_small_url || null,
    raw_response: { product_name: p.product_name, brands: p.brands, nutriments: n, serving_size: p.serving_size },
  }
}

/**
 * Check barcode cache
 */
async function getFromCache(barcode) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - CACHE_MAX_AGE_DAYS)

  const { data, error } = await supabase
    .from('barcode_cache')
    .select('*')
    .eq('barcode', barcode)
    .gt('last_used_at', cutoff.toISOString())
    .single()

  if (error || !data) return null

  console.log(`[Barcode] Cache hit for ${barcode}: ${data.product_name}`)

  return {
    product_name: data.product_name,
    brand: data.brand,
    serving_size: data.serving_size,
    calories: data.calories,
    protein_g: parseFloat(data.protein_g),
    carbs_g: parseFloat(data.carbs_g),
    fat_g: parseFloat(data.fat_g),
    fiber_g: parseFloat(data.fiber_g),
    sugar_g: parseFloat(data.sugar_g),
    image_url: data.image_url,
  }
}

/**
 * Save product to barcode cache
 */
async function saveToCache(barcode, product) {
  const { error } = await supabase
    .from('barcode_cache')
    .upsert({
      barcode,
      product_name: product.product_name,
      brand: product.brand,
      serving_size: product.serving_size,
      calories: product.calories,
      protein_g: product.protein_g,
      carbs_g: product.carbs_g,
      fat_g: product.fat_g,
      fiber_g: product.fiber_g,
      sugar_g: product.sugar_g,
      image_url: product.image_url,
      raw_response: product.raw_response || null,
    }, { onConflict: 'barcode' })

  if (error) {
    console.error('[Barcode] Cache save error:', error.message)
  } else {
    console.log(`[Barcode] Cached product: ${product.product_name}`)
  }
}

/**
 * Update hit count and last_used_at for cached barcode
 */
async function updateCacheHit(barcode) {
  const { data } = await supabase
    .from('barcode_cache')
    .select('hit_count')
    .eq('barcode', barcode)
    .single()

  if (data) {
    await supabase
      .from('barcode_cache')
      .update({
        hit_count: (data.hit_count || 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('barcode', barcode)
  }
}

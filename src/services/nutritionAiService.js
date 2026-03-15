import { createHash } from 'crypto'
import OpenAI from 'openai'
import { supabase } from '../config/supabase.js'
import { lookupCache, saveToCache } from './nutritionCacheService.js'

const PHOTO_CACHE_MAX_AGE_DAYS = 30

// OpenAI GPT-4o for food identification from images (handles base64 directly)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Perplexity Sonar for nutrition data lookup (web-searched, accurate)
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai'
})

/**
 * Helper to parse JSON from AI responses (handles markdown code blocks)
 */
function parseJsonResponse(text) {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1].trim())
  }

  const objStart = text.indexOf('{')
  const objEnd = text.lastIndexOf('}')
  if (objStart !== -1 && objEnd !== -1) {
    return JSON.parse(text.substring(objStart, objEnd + 1))
  }

  const arrStart = text.indexOf('[')
  const arrEnd = text.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd !== -1) {
    return JSON.parse(text.substring(arrStart, arrEnd + 1))
  }

  throw new Error('No valid JSON found in response')
}

/**
 * Step 1: OpenAI GPT-4o identifies food from image (base64)
 * Highly accurate vision model — handles any image format via base64
 * @param {Buffer} imageBuffer - Raw image data
 * @param {string} mimeType - e.g. 'image/jpeg', 'image/png'
 * @returns {object} - { is_food, items: [{ name, serving_size, category }], meal_description }
 */
async function identifyFoodFromImage(imageBuffer, mimeType) {
  const base64 = imageBuffer.toString('base64')
  const dataUri = `data:${mimeType};base64,${base64}`

  console.log('👁️ OpenAI GPT-4o identifying food from image...')

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert food identification specialist. Given a photo of food, you identify every item with maximum specificity. Return ONLY valid JSON, no extra text.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: dataUri, detail: 'high' }
          },
          {
            type: 'text',
            text: `Identify all food items in this photo. You MUST list each component SEPARATELY — never combine items into one entry.

Return a JSON object with this exact structure:
{
  "is_food": true,
  "meal_description": "brief overall description of the meal",
  "items": [
    {
      "name": "highly specific food name with cooking method",
      "serving_size": "estimated portion size with weight estimate",
      "category": "protein/carb/vegetable/fruit/dairy/fat/beverage/dessert/mixed"
    }
  ]
}

If this is NOT a photo of food, return: { "is_food": false, "items": [], "meal_description": "" }

CRITICAL — BREAK DOWN EVERY DISH INTO COMPONENTS:
- "Egusi soup with fish" is WRONG — list "egusi soup" and the specific fish as SEPARATE items
- "Rice with chicken" is WRONG — list "jollof rice" and "grilled chicken thigh" as SEPARATE items
- Every visible protein, starch, vegetable, sauce, and side MUST be its own item
- A plate with soup, fish, and rice = at minimum 3 separate items

CRITICAL — IDENTIFY EXACT PROTEIN SPECIES:
- NEVER say just "fish" — identify the species: tilapia, catfish, mackerel, croaker, stockfish, dried fish, smoked catfish, etc.
- Look at the fish closely: flat and round = tilapia, long and dark = catfish, small and silvery = mackerel/sardine, dried/hard = stockfish
- NEVER say just "meat" — specify: goat meat, beef, chicken thigh, turkey, oxtail, cow foot, etc.
- If you cannot determine the exact species, pick the MOST LIKELY one based on visual cues and the dish context (e.g., egusi soup commonly has catfish, tilapia, or stockfish)

COOKING METHOD RULES:
- Identify the EXACT cooking method visible (air-fried, deep-fried, roasted, grilled, steamed, baked, boiled, stewed, sautéed)
- Look for visual cues: oil sheen = fried, char marks = grilled, dry crisp = air-fried/roasted, wet/soft = steamed/boiled
- Air-fried food looks dry and crispy with minimal oil — do NOT call it "fried" or "deep-fried"
- Roasted food has dry browning — do NOT call it "fried"

NAMING CONSISTENCY (CRITICAL for caching — same food must always get the same name):
- Use the SIMPLEST, most common name for each food. Do NOT add extra descriptors that vary between scans.
- ALWAYS use singular form: "boiled egg" not "boiled eggs", "carrot" not "carrots"
- Format: "[cooking method] [food name]" — e.g., "boiled egg", "grilled beef", "steamed rice"
- For pasta/noodle dishes: name the dish itself, e.g., "spaghetti", "pad thai", "jollof rice" — do NOT append variable descriptions like "with tomato sauce" or "with mixed vegetables" unless the sauce/topping is the defining characteristic of the dish
- List visible vegetables, proteins, and sides as SEPARATE items — do NOT bundle them into the main dish name
- For dishes with cultural origins, use the proper name (e.g., "egusi soup", "jollof rice", "pad thai")

OTHER RULES:
- Estimate realistic portion sizes with weight in grams using plate/bowl as reference
- Return ONLY the JSON object`
          }
        ]
      }
    ],
    temperature: 0,
    seed: 42,
    max_tokens: 1000
  })

  const text = response.choices[0]?.message?.content || ''
  console.log('👁️ OpenAI identification response:', text.substring(0, 300))

  return parseJsonResponse(text)
}

/**
 * Step 2: Get nutrition data with caching layer
 * Checks cache first, only calls Perplexity for uncached items, then saves results
 * @param {Array} foodItems - [{ name, serving_size, category }]
 * @returns {Array} - [{ name, serving_size, calories, protein_g, carbs_g, fat_g, fiber_g, category }]
 */
async function getNutritionData(foodItems) {
  try {
    const { cached, uncached } = await lookupCache(foodItems)

    if (cached.size > 0) {
      console.log(`[NutritionCache] ${cached.size} cache hits, ${uncached.length} misses`)
    }

    // If everything was cached, return immediately
    if (uncached.length === 0) {
      console.log('[NutritionCache] 100% cache hit — skipping Perplexity API call')
      return foodItems.map((item, i) => ({
        ...cached.get(i),
        category: item.category || 'mixed'
      }))
    }

    // Call Perplexity only for uncached items
    const uncachedItems = uncached.map(u => foodItems[u.index])
    const freshResults = await fetchNutritionFromPerplexity(uncachedItems)

    // Save fresh results to cache in background
    saveToCache(freshResults).catch(() => {})

    // Merge cached + fresh results in original order
    const results = []
    let freshIndex = 0
    for (let i = 0; i < foodItems.length; i++) {
      if (cached.has(i)) {
        results.push({ ...cached.get(i), category: foodItems[i].category || 'mixed' })
      } else {
        results.push(freshResults[freshIndex] || {})
        freshIndex++
      }
    }

    return results
  } catch (error) {
    console.error('[NutritionCache] Cache layer error, falling back to direct API:', error.message)
    return fetchNutritionFromPerplexity(foodItems)
  }
}

/**
 * Fetch nutrition data from Perplexity Sonar (raw API call, no caching)
 * @param {Array} foodItems - [{ name, serving_size, category }]
 * @returns {Array}
 */
async function fetchNutritionFromPerplexity(foodItems) {
  const itemList = foodItems.map((item, i) =>
    `${i + 1}. ${item.name} — ${item.serving_size}`
  ).join('\n')

  console.log('🔬 Perplexity Sonar looking up nutrition for:', itemList)

  const response = await perplexity.chat.completions.create({
    model: 'sonar',
    messages: [
      {
        role: 'system',
        content: `You are a clinical-grade nutrition calculator. Search across nutrition databases (USDA FoodData Central, Nutritionix, MyFitnessPal, CalorieKing, national food databases) and food packaging data to find the most accurate nutrition values. Prioritize published database entries over estimates. For regional, ethnic, or restaurant-specific foods, search for those specific entries rather than approximating from generic ingredients. Return ONLY valid JSON.`
      },
      {
        role: 'user',
        content: `Look up precise nutrition data for each item. Search broadly across nutrition databases and food sources:

${itemList}

Return this exact JSON structure:
{
  "items": [
    {
      "name": "food name exactly as listed above",
      "serving_size": "portion size as listed above",
      "calories": 250,
      "protein_g": 30.0,
      "carbs_g": 0.0,
      "fat_g": 14.0,
      "fiber_g": 0.0,
      "sugar_g": 5.0
    }
  ]
}

Strict rules:
- Search multiple nutrition sources. Prefer published database entries (USDA, Nutritionix, food labels) over estimates.
- For ethnic/regional foods (e.g. jollof rice, dal makhani, bibimbap), search for those specific dishes — do not approximate from generic Western equivalents.
- For restaurant/brand items (e.g. "Chick-fil-A nuggets"), use the published nutrition from that brand.
- Preserve the exact name and serving_size from the input — do not rename or re-estimate portions.
- Scale nutrition values proportionally to the stated serving size. Example: if a source lists per 100g and user says 200g, double all values.
- Cooking method matters: grilled, fried, baked, raw, boiled have different nutrition profiles. Match the correct one.
- For composite/mixed dishes, search for the whole dish entry, not individual ingredients.
- Calories must be an integer. Macros must have exactly 1 decimal place.
- Cross-check: (protein_g × 4) + (carbs_g × 4) + (fat_g × 9) should be within 10% of calories.
- Return ONLY the JSON object. No markdown, no explanation, no sources.`
      }
    ],
    temperature: 0,
    max_tokens: 1500
  })

  const text = response.choices[0]?.message?.content || ''
  console.log('🔬 Perplexity nutrition response:', text.substring(0, 300))

  const parsed = parseJsonResponse(text)
  return parsed.items || []
}

/**
 * Look up a cached photo analysis result by image hash
 */
async function lookupPhotoCache(imageHash) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - PHOTO_CACHE_MAX_AGE_DAYS)

  const { data, error } = await supabase
    .from('photo_analysis_cache')
    .select('*')
    .eq('image_hash', imageHash)
    .gt('last_used_at', cutoff.toISOString())
    .single()

  if (error || !data) return null

  // Update hit_count in background
  supabase
    .from('photo_analysis_cache')
    .update({ hit_count: data.hit_count + 1, last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})
    .catch(() => {})

  return data.result
}

/**
 * Save a photo analysis result to cache
 */
async function savePhotoCache(imageHash, result) {
  const { error } = await supabase
    .from('photo_analysis_cache')
    .upsert({ image_hash: imageHash, result }, { onConflict: 'image_hash' })

  if (error) {
    console.error('[PhotoCache] Save error:', error.message)
  } else {
    console.log('[PhotoCache] Saved analysis result to cache')
  }
}

/**
 * Analyze a food photo: OpenAI identifies → Perplexity gets nutrition
 * Results are cached by image hash — same photo always returns identical values
 * @param {Buffer} imageBuffer - Raw image data
 * @param {string} mimeType - e.g. 'image/jpeg'
 * @returns {object} - { is_food, items, meal_description, ai_raw }
 */
export async function analyzeFoodPhoto(imageBuffer, mimeType) {
  try {
    // Check photo-level cache first (same image = same result, always)
    const imageHash = createHash('sha256').update(imageBuffer).digest('hex')
    const cachedResult = await lookupPhotoCache(imageHash)

    if (cachedResult) {
      console.log(`📸 [PhotoCache] Cache hit — returning identical result (hash: ${imageHash.substring(0, 12)}...)`)
      return cachedResult
    }

    // Step 1: OpenAI identifies food from image
    const identification = await identifyFoodFromImage(imageBuffer, mimeType)

    if (!identification.is_food || !identification.items || identification.items.length === 0) {
      return {
        is_food: false,
        items: [],
        error: 'No food detected in the image'
      }
    }

    console.log(`✅ OpenAI identified ${identification.items.length} food items`)

    // Step 2: Perplexity gets accurate nutrition data (with per-item cache)
    const nutritionItems = await getNutritionData(identification.items)

    // Merge: keep category from OpenAI, nutrition from Perplexity
    const mergedItems = identification.items.map((idItem, i) => {
      const nutritionItem = nutritionItems[i] || {}
      return {
        name: idItem.name,
        serving_size: idItem.serving_size,
        calories: nutritionItem.calories || 0,
        protein_g: nutritionItem.protein_g || 0,
        carbs_g: nutritionItem.carbs_g || 0,
        fat_g: nutritionItem.fat_g || 0,
        fiber_g: nutritionItem.fiber_g || 0,
        sugar_g: nutritionItem.sugar_g || 0,
        category: idItem.category || 'mixed'
      }
    })

    const result = {
      is_food: true,
      items: mergedItems,
      meal_description: identification.meal_description || '',
      ai_raw: { openai: identification, perplexity: { items: nutritionItems } }
    }

    // Save to photo cache in background (same photo = same result next time)
    savePhotoCache(imageHash, result).catch(() => {})

    // Also save individual items to nutrition cache (for text lookups & different photos with same foods)
    // This is already handled inside getNutritionData → saveToCache

    return result
  } catch (error) {
    console.error('❌ Food photo analysis error:', error)
    return { is_food: false, items: [], error: 'Failed to analyze food photo' }
  }
}

/**
 * Analyze food from a text/voice description using Perplexity Sonar
 * @param {string} textDescription - e.g. "grilled chicken breast 200g with rice and broccoli"
 * @returns {object} - { items, original_text, ai_raw }
 */
export async function analyzeFoodText(textDescription) {
  try {
    console.log('📝 Analyzing food text:', textDescription)

    // Step 1: Parse text into food items (names + portions only)
    const response = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: `You are a food parser. Given a text description, identify individual food items and their portions. Return ONLY valid JSON, no extra text.`
        },
        {
          role: 'user',
          content: `Parse this food description into individual items with portions:

"${textDescription}"

Return a JSON object with this exact structure:
{
  "items": [
    {
      "name": "specific food name (e.g. grilled chicken wing)",
      "serving_size": "portion (use stated amount or estimate typical serving, e.g. 3 pieces, 200g, 1 cup)"
    }
  ]
}

Rules:
- Split into individual food items
- Include cooking method in the name if mentioned (grilled, fried, baked, etc.)
- If quantity is stated, use it; otherwise estimate a typical single serving
- Return ONLY the JSON object, no markdown or explanation`
        }
      ],
      temperature: 0,
      max_tokens: 500
    })

    const text = response.choices[0]?.message?.content || ''
    console.log('📝 Parsed food items:', text.substring(0, 300))

    let parsed
    try {
      parsed = parseJsonResponse(text)
    } catch (parseError) {
      console.error('❌ Failed to parse text response:', parseError.message)
      return { items: [], error: 'Failed to parse food description' }
    }

    if (!parsed.items || parsed.items.length === 0) {
      return { items: [], error: 'Could not identify food items from the description' }
    }

    console.log(`✅ Parsed ${parsed.items.length} food items from text`)

    // Step 2: Get nutrition data via cache-first pipeline (same as photo flow)
    const nutritionItems = await getNutritionData(parsed.items)

    // Merge parsed names with nutrition data
    const mergedItems = parsed.items.map((item, i) => {
      const nutrition = nutritionItems[i] || {}
      return {
        name: item.name,
        serving_size: item.serving_size,
        calories: nutrition.calories || 0,
        protein_g: nutrition.protein_g || 0,
        carbs_g: nutrition.carbs_g || 0,
        fat_g: nutrition.fat_g || 0,
        fiber_g: nutrition.fiber_g || 0,
        sugar_g: nutrition.sugar_g || 0,
      }
    })

    return {
      items: mergedItems,
      original_text: textDescription,
      ai_raw: { parsed_items: parsed, nutrition: nutritionItems }
    }
  } catch (error) {
    console.error('❌ Food text analysis error:', error)
    return { items: [], error: 'Failed to get nutrition data from text' }
  }
}

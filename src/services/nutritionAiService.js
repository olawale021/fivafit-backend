import OpenAI from 'openai'
import { lookupCache, saveToCache } from './nutritionCacheService.js'

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

OTHER RULES:
- For dishes with cultural origins, use the proper name (e.g., "egusi soup", "jollof rice", "pad thai")
- Estimate realistic portion sizes with weight in grams using plate/bowl as reference
- Return ONLY the JSON object`
          }
        ]
      }
    ],
    temperature: 0.1,
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
        content: `You are a precise nutrition database. Given a list of food items with portions, return accurate calorie and macronutrient data using USDA values. Return ONLY valid JSON, no extra text.`
      },
      {
        role: 'user',
        content: `Provide accurate nutrition data for each of these food items:

${itemList}

Return a JSON object with this exact structure:
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

Rules:
- Match each item by name — keep the same name from the input
- Use accurate USDA/nutrition database values for the stated portion
- calories is an integer, macros are decimals with 1 decimal place
- Air-fried and roasted foods have LESS fat than deep-fried — get this right
- Account for the actual cooking method in the name, not an assumed method
- Return ONLY the JSON object, no markdown or explanation`
      }
    ],
    temperature: 0.1,
    max_tokens: 1500
  })

  const text = response.choices[0]?.message?.content || ''
  console.log('🔬 Perplexity nutrition response:', text.substring(0, 300))

  const parsed = parseJsonResponse(text)
  return parsed.items || []
}

/**
 * Analyze a food photo: OpenAI identifies → Perplexity gets nutrition
 * @param {Buffer} imageBuffer - Raw image data
 * @param {string} mimeType - e.g. 'image/jpeg'
 * @returns {object} - { is_food, items, meal_description, ai_raw }
 */
export async function analyzeFoodPhoto(imageBuffer, mimeType) {
  try {
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

    // Step 2: Perplexity gets accurate nutrition data
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

    return {
      is_food: true,
      items: mergedItems,
      meal_description: identification.meal_description || '',
      ai_raw: { openai: identification, perplexity: { items: nutritionItems } }
    }
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
    console.log('📝 Analyzing food text with Perplexity Sonar:', textDescription)

    const response = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: `You are a precise nutrition database and food parser. Given a text description of food, identify individual food items, estimate portions if not specified, and return accurate calorie and macronutrient data. Return ONLY valid JSON, no extra text.`
        },
        {
          role: 'user',
          content: `Parse this food description and provide nutrition data for each item:

"${textDescription}"

Return a JSON object with this exact structure:
{
  "items": [
    {
      "name": "specific food name",
      "serving_size": "portion size (use the stated amount or estimate a typical serving)",
      "calories": 250,
      "protein_g": 30.0,
      "carbs_g": 0.0,
      "fat_g": 14.0,
      "fiber_g": 0.0,
      "sugar_g": 5.0
    }
  ]
}

Rules:
- Parse the description into individual food items
- If a portion is specified (e.g., "200g"), use that; otherwise estimate a typical serving
- Use accurate USDA/nutrition database values
- calories is an integer, macros are decimals with 1 decimal place
- Return ONLY the JSON object, no markdown or explanation`
        }
      ],
      temperature: 0.1,
      max_tokens: 1000
    })

    const text = response.choices[0]?.message?.content || ''
    console.log('📝 Perplexity text response:', text.substring(0, 300))

    let parsed
    try {
      parsed = parseJsonResponse(text)
    } catch (parseError) {
      console.error('❌ Failed to parse Perplexity text response:', parseError.message)
      return { items: [], error: 'Failed to parse nutrition data from text' }
    }

    if (!parsed.items || parsed.items.length === 0) {
      return { items: [], error: 'Could not identify food items from the description' }
    }

    console.log(`✅ Perplexity parsed ${parsed.items.length} items from text`)

    // Cache the nutrition results for future lookups
    saveToCache(parsed.items).catch(() => {})

    return {
      items: parsed.items,
      original_text: textDescription,
      ai_raw: { perplexity: parsed }
    }
  } catch (error) {
    console.error('❌ Perplexity text analysis error:', error)
    return { items: [], error: 'Failed to get nutrition data from text' }
  }
}

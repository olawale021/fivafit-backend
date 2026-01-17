import OpenAI from 'openai'
import crypto from 'crypto'
import NodeCache from 'node-cache'
import { getAllExercises } from './exerciseService.js'

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Cache for AI recommendations (24 hour TTL)
const recommendationCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 })

/**
 * Generate a cache key based on user profile
 */
function generateCacheKey(user) {
  const profileData = {
    id: user.id,
    goals: user.fitness_goal || [],
    levels: user.fitness_levels || [],
    bodyFocus: user.body_focus || [],
    gender: user.gender
  }
  const hash = crypto.createHash('md5').update(JSON.stringify(profileData)).digest('hex')
  return `ai_rec_${hash}`
}

/**
 * Pre-filter exercises based on user's body focus to reduce token usage
 */
function preFilterExercises(exercises, user) {
  const bodyFocus = user.body_focus || []
  const fitnessLevels = user.fitness_levels || []

  if (bodyFocus.length === 0 && fitnessLevels.length === 0) {
    // No filters, return random sample of 600
    return shuffleArray(exercises).slice(0, 600)
  }

  let filtered = exercises

  // Filter by body focus if set
  if (bodyFocus.length > 0) {
    filtered = exercises.filter(ex => {
      const bodyPart = ex.bodyPart?.toLowerCase() || ''
      const target = ex.target?.toLowerCase() || ''

      return bodyFocus.some(focus => {
        const f = focus.toLowerCase()

        // Handle common aliases
        if (f === 'arms') return bodyPart.includes('arm') || target.includes('bicep') || target.includes('tricep')
        if (f === 'abs') return bodyPart.includes('waist') || target.includes('abs')
        if (f === 'chest') return bodyPart.includes('chest') || target.includes('pectoral')
        if (f === 'back') return bodyPart.includes('back') || target.includes('lats') || target.includes('traps')
        if (f === 'legs') return bodyPart.includes('leg') || target.includes('quad') || target.includes('hamstring') || target.includes('calves')
        if (f === 'glutes') return target.includes('glute')
        if (f === 'shoulders') return bodyPart.includes('shoulder') || target.includes('delt')
        if (f === 'cardio') return ex.category === 'cardio'

        return bodyPart.includes(f) || target.includes(f)
      })
    })
  }

  // Filter by fitness level if set
  if (fitnessLevels.length > 0) {
    filtered = filtered.filter(ex =>
      !ex.difficulty || fitnessLevels.includes(ex.difficulty)
    )
  }

  // If we have too few, add some from the full list
  if (filtered.length < 450) {
    const remaining = exercises.filter(ex => !filtered.includes(ex))
    filtered = [...filtered, ...shuffleArray(remaining).slice(0, 600 - filtered.length)]
  }

  // Limit to 600 exercises max
  return shuffleArray(filtered).slice(0, 600)
}

/**
 * Shuffle array (Fisher-Yates)
 */
function shuffleArray(array) {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Build exercise summaries for AI (minimal data to reduce tokens)
 */
function buildExerciseSummaries(exercises) {
  return exercises.map(ex => ({
    id: ex.id,
    name: ex.name,
    bodyPart: ex.bodyPart,
    target: ex.target,
    equipment: ex.equipment,
    difficulty: ex.difficulty,
    category: ex.category
  }))
}

/**
 * Build the AI prompt for personalized recommendations
 */
function buildRecommendationPrompt(user, exerciseSummaries) {
  const goals = Array.isArray(user.fitness_goal) ? user.fitness_goal : []
  const levels = user.fitness_levels || []
  const bodyFocus = user.body_focus || []
  const gender = user.gender || 'unspecified'

  return `You are an expert personal trainer creating a personalized exercise recommendation for a user.

USER PROFILE:
- Gender: ${gender}
- Fitness Goals: ${goals.join(', ') || 'general fitness'}
- Fitness Levels: ${levels.join(', ') || 'all levels'}
- Body Focus Areas: ${bodyFocus.join(', ') || 'full body'}
${user.height_cm ? `- Height: ${user.height_cm} cm` : ''}
${user.weight_kg ? `- Weight: ${user.weight_kg} kg` : ''}

AVAILABLE EXERCISES (${exerciseSummaries.length} exercises to choose from):
${JSON.stringify(exerciseSummaries, null, 0)}

TASK:
Create exactly 8 personalized exercise categories for this user. Each category should:
1. Have a creative, motivating name
2. Include a brief reason why these exercises are perfect for this user
3. Contain 12-20 exercise IDs from the available exercises

Focus on:
- Exercises that match their fitness goals
- Appropriate difficulty for their fitness levels
- Targeting their selected body focus areas
- A good variety of equipment and movement patterns

Return ONLY valid JSON in this exact format:
{
  "categories": [
    {
      "name": "Category Name",
      "reason": "Why these exercises are perfect for you",
      "exercise_ids": ["id1", "id2", "id3", ...]
    }
  ],
  "personal_tip": "A motivating personal tip based on their goals"
}`
}

/**
 * Generate AI-powered exercise recommendations
 */
export async function generateAIRecommendations(user, forceRefresh = false) {
  const cacheKey = generateCacheKey(user)

  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = recommendationCache.get(cacheKey)
    if (cached) {
      console.log(`✅ AI Recommendations cache hit for user ${user.id}`)
      return { ...cached, cached: true }
    }
  }

  console.log(`🤖 Generating AI recommendations for user ${user.id}`)
  const startTime = Date.now()

  try {
    // Get all exercises
    const exercisesResult = await getAllExercises()
    if (!exercisesResult.success) {
      throw new Error('Failed to fetch exercises')
    }

    // Pre-filter exercises based on user profile
    const filteredExercises = preFilterExercises(exercisesResult.data, user)
    console.log(`📋 Pre-filtered to ${filteredExercises.length} exercises`)

    // Build summaries for AI
    const summaries = buildExerciseSummaries(filteredExercises)

    // Build prompt
    const prompt = buildRecommendationPrompt(user, summaries)

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert certified personal trainer. Always respond with valid JSON only, no markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 2000
    })

    // Parse response
    const aiResponse = JSON.parse(response.choices[0].message.content)

    // Map exercise IDs back to full exercise objects
    const exerciseMap = new Map(filteredExercises.map(ex => [ex.id, ex]))

    const categories = aiResponse.categories.map(cat => ({
      name: cat.name,
      reason: cat.reason,
      exercises: cat.exercise_ids
        .map(id => exerciseMap.get(id))
        .filter(ex => ex !== undefined) // Filter out any IDs that don't match
    }))

    const result = {
      categories,
      personal_tip: aiResponse.personal_tip,
      generated_at: new Date().toISOString(),
      generation_time_ms: Date.now() - startTime,
      cached: false
    }

    // Cache the result
    recommendationCache.set(cacheKey, result)

    console.log(`✅ AI Recommendations generated in ${result.generation_time_ms}ms (${categories.length} categories)`)

    return result

  } catch (error) {
    console.error('❌ AI Recommendation Error:', error)
    throw error
  }
}

/**
 * Clear recommendation cache for a user (call on profile update)
 */
export function clearUserRecommendationCache(userId) {
  // Since we use profile hash, we can't easily clear by userId
  // Instead, we'll clear all (simple approach for now)
  recommendationCache.flushAll()
  console.log(`🗑️ Cleared recommendation cache`)
}

/**
 * Get cache stats
 */
export function getRecommendationCacheStats() {
  return {
    keys: recommendationCache.keys().length,
    stats: recommendationCache.getStats()
  }
}

import OpenAI from 'openai'
import { supabase } from '../config/supabase.js'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Cache for keywords to avoid frequent DB queries
let keywordsCache = null
let cacheTimestamp = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get active filter keywords from database (with caching)
 */
export async function getActiveKeywords() {
  // Check cache
  if (keywordsCache && cacheTimestamp && (Date.now() - cacheTimestamp) < CACHE_TTL) {
    return keywordsCache
  }

  try {
    const { data, error } = await supabase
      .from('content_filter_keywords')
      .select('*')
      .eq('is_active', true)

    if (error) {
      console.error('Error fetching filter keywords:', error)
      return []
    }

    keywordsCache = data || []
    cacheTimestamp = Date.now()
    return keywordsCache
  } catch (error) {
    console.error('Error in getActiveKeywords:', error)
    return []
  }
}

/**
 * Clear the keywords cache (call after adding/updating keywords)
 */
export function clearKeywordsCache() {
  keywordsCache = null
  cacheTimestamp = null
}

/**
 * Filter content using OpenAI Moderation API
 * @param {string} text - The text to filter
 * @returns {Promise<{isClean: boolean, flaggedCategories: string[], scores: object}>}
 */
export async function filterWithOpenAI(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { isClean: true, flaggedCategories: [], scores: {} }
  }

  try {
    const response = await openai.moderations.create({
      input: text
    })

    const result = response.results[0]

    // Get flagged categories
    const flaggedCategories = []
    const categories = result.categories

    if (categories.hate) flaggedCategories.push('hate')
    if (categories['hate/threatening']) flaggedCategories.push('hate/threatening')
    if (categories.harassment) flaggedCategories.push('harassment')
    if (categories['harassment/threatening']) flaggedCategories.push('harassment/threatening')
    if (categories['self-harm']) flaggedCategories.push('self-harm')
    if (categories['self-harm/intent']) flaggedCategories.push('self-harm/intent')
    if (categories['self-harm/instructions']) flaggedCategories.push('self-harm/instructions')
    if (categories.sexual) flaggedCategories.push('sexual')
    if (categories['sexual/minors']) flaggedCategories.push('sexual/minors')
    if (categories.violence) flaggedCategories.push('violence')
    if (categories['violence/graphic']) flaggedCategories.push('violence/graphic')

    return {
      isClean: !result.flagged,
      flaggedCategories,
      scores: result.category_scores
    }
  } catch (error) {
    console.error('OpenAI Moderation API error:', error)
    // Fall back to keyword filter if API fails
    return null
  }
}

/**
 * Filter content using keyword matching (fallback)
 * @param {string} text - The text to filter
 * @returns {Promise<{isClean: boolean, flaggedWords: Array<{keyword: string, severity: string}>}>}
 */
export async function filterWithKeywords(text) {
  if (!text || typeof text !== 'string') {
    return { isClean: true, flaggedWords: [] }
  }

  const keywords = await getActiveKeywords()
  const lowerText = text.toLowerCase()

  const flaggedWords = keywords.filter(k => {
    // For exact word matching, use word boundaries
    if (k.match_type === 'exact') {
      const regex = new RegExp(`\\b${escapeRegex(k.keyword.toLowerCase())}\\b`, 'i')
      return regex.test(lowerText)
    }
    // Default to contains matching
    return lowerText.includes(k.keyword.toLowerCase())
  }).map(k => ({
    keyword: k.keyword,
    severity: k.severity
  }))

  return {
    isClean: flaggedWords.length === 0,
    flaggedWords
  }
}

/**
 * Main content filter function - uses OpenAI first, falls back to keywords
 * @param {string} text - The text to filter
 * @returns {Promise<{isClean: boolean, reason: string, details: object}>}
 */
export async function filterContent(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { isClean: true, reason: null, details: {} }
  }

  // Try OpenAI Moderation API first (more robust)
  const openAIResult = await filterWithOpenAI(text)

  if (openAIResult && !openAIResult.isClean) {
    const categoryMessages = {
      'hate': 'hate speech',
      'hate/threatening': 'threatening hate speech',
      'harassment': 'harassment',
      'harassment/threatening': 'threatening harassment',
      'self-harm': 'self-harm content',
      'self-harm/intent': 'self-harm intent',
      'self-harm/instructions': 'self-harm instructions',
      'sexual': 'sexual content',
      'sexual/minors': 'inappropriate content involving minors',
      'violence': 'violent content',
      'violence/graphic': 'graphic violence'
    }

    const reasons = openAIResult.flaggedCategories
      .map(cat => categoryMessages[cat] || cat)
      .join(', ')

    return {
      isClean: false,
      reason: `Content flagged for: ${reasons}`,
      details: {
        source: 'openai',
        categories: openAIResult.flaggedCategories,
        scores: openAIResult.scores
      }
    }
  }

  // Fall back to keyword filter if OpenAI didn't flag or failed
  const keywordResult = await filterWithKeywords(text)

  if (!keywordResult.isClean) {
    return {
      isClean: false,
      reason: 'Content contains prohibited language',
      details: {
        source: 'keywords',
        severity: getHighestSeverity(keywordResult.flaggedWords)
      }
    }
  }

  return { isClean: true, reason: null, details: {} }
}

/**
 * Get the highest severity level from flagged words
 */
export function getHighestSeverity(flaggedWords) {
  if (!flaggedWords || flaggedWords.length === 0) return null

  const severityOrder = ['low', 'moderate', 'high']
  let highest = 'low'

  for (const word of flaggedWords) {
    const currentIndex = severityOrder.indexOf(word.severity)
    const highestIndex = severityOrder.indexOf(highest)
    if (currentIndex > highestIndex) {
      highest = word.severity
    }
  }

  return highest
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Add a new keyword to the filter list
 */
export async function addKeyword(keyword, severity = 'moderate', matchType = 'contains') {
  try {
    const { data, error } = await supabase
      .from('content_filter_keywords')
      .insert({
        keyword: keyword.toLowerCase(),
        severity,
        match_type: matchType,
        is_active: true
      })
      .select()
      .single()

    if (error) throw error

    clearKeywordsCache()
    return data
  } catch (error) {
    console.error('Error adding keyword:', error)
    throw error
  }
}

/**
 * Remove a keyword from the filter list
 */
export async function removeKeyword(keywordId) {
  try {
    const { error } = await supabase
      .from('content_filter_keywords')
      .delete()
      .eq('id', keywordId)

    if (error) throw error

    clearKeywordsCache()
    return true
  } catch (error) {
    console.error('Error removing keyword:', error)
    throw error
  }
}

/**
 * Toggle keyword active status
 */
export async function toggleKeyword(keywordId, isActive) {
  try {
    const { data, error } = await supabase
      .from('content_filter_keywords')
      .update({ is_active: isActive })
      .eq('id', keywordId)
      .select()
      .single()

    if (error) throw error

    clearKeywordsCache()
    return data
  } catch (error) {
    console.error('Error toggling keyword:', error)
    throw error
  }
}

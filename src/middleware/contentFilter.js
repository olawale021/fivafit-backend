import { filterContent } from '../services/contentFilterService.js'

/**
 * Content filter middleware factory
 * Uses OpenAI Moderation API with keyword fallback
 * @param {string[]} fields - Array of field names to check in request body
 * @returns {Function} Express middleware
 */
export function contentFilterMiddleware(fields = []) {
  return async (req, res, next) => {
    try {
      for (const field of fields) {
        const value = getNestedValue(req.body, field)

        if (value && typeof value === 'string' && value.trim().length > 0) {
          const result = await filterContent(value)

          if (!result.isClean) {
            console.log(`Content filter triggered:`, {
              userId: req.user?.id,
              field: field,
              reason: result.reason,
              source: result.details?.source,
              categories: result.details?.categories
            })

            return res.status(400).json({
              success: false,
              message: 'Your content contains language that violates our community guidelines. Please revise and try again.',
              error: 'CONTENT_FILTERED',
              details: {
                reason: result.reason,
                field: field
              }
            })
          }
        }
      }

      next()
    } catch (error) {
      console.error('Content filter middleware error:', error)
      // Don't block content on filter errors, just log and continue
      next()
    }
  }
}

/**
 * Get nested value from object using dot notation
 * e.g., getNestedValue(obj, 'user.bio') returns obj.user.bio
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined

  const parts = path.split('.')
  let current = obj

  for (const part of parts) {
    if (current === undefined || current === null) return undefined
    current = current[part]
  }

  return current
}

/**
 * Pre-configured middleware for common use cases
 */

// For post creation - checks caption
export const filterPostContent = contentFilterMiddleware(['caption'])

// For comment creation - checks comment text
export const filterCommentContent = contentFilterMiddleware(['text', 'commentText', 'comment'])

// For profile updates - checks bio, display name, and username
export const filterProfileContent = contentFilterMiddleware(['bio', 'full_name', 'displayName', 'username'])

// For username updates
export const filterUsernameContent = contentFilterMiddleware(['username'])

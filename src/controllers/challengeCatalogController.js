import {
  getCatalog,
  getCatalogByCategory,
  getCatalogById,
  getCompletionCount,
  getCompleters,
  getUserProgress,
  syncUserCompletions,
} from '../services/challengeCatalogService.js'

/**
 * GET /api/challenge-catalog
 * Returns the full active catalog grouped by category.
 */
export const listCatalog = async (req, res) => {
  try {
    const items = await getCatalog()
    const grouped = { run: [], workout: [], streak: [], steps: [] }
    for (const item of items) {
      if (grouped[item.category]) grouped[item.category].push(item)
    }
    res.json({ success: true, data: grouped })
  } catch (error) {
    console.error('❌ listCatalog:', error)
    res.status(500).json({ success: false, error: 'Failed to load catalog', message: error.message })
  }
}

/**
 * GET /api/challenge-catalog/category/:category
 */
export const listByCategory = async (req, res) => {
  try {
    const { category } = req.params
    if (!['run', 'workout', 'streak', 'steps'].includes(category)) {
      return res.status(400).json({ success: false, error: 'Invalid category' })
    }
    const items = await getCatalogByCategory(category)
    res.json({ success: true, data: items })
  } catch (error) {
    console.error('❌ listByCategory:', error)
    res.status(500).json({ success: false, error: 'Failed to load category', message: error.message })
  }
}

/**
 * GET /api/challenge-catalog/:id
 * Returns the challenge plus current user's progress and completion count.
 */
export const getDetail = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const challenge = await getCatalogById(id)
    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Challenge not found' })
    }

    // Backfill before computing — guarantees the requesting user appears in
    // the completers list if they already qualify.
    await syncUserCompletions(userId)

    const [progressMap, count] = await Promise.all([
      getUserProgress(userId),
      getCompletionCount(id),
    ])

    res.json({
      success: true,
      data: {
        challenge,
        progress: progressMap[id] || { value: 0, isComplete: false },
        completion_count: count,
      },
    })
  } catch (error) {
    console.error('❌ getDetail:', error)
    res.status(500).json({ success: false, error: 'Failed to load challenge', message: error.message })
  }
}

/**
 * GET /api/challenge-catalog/:id/completers
 * Paginated list of users who completed the challenge.
 */
export const listCompleters = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id
    const cursor = req.query.cursor || null
    const limit = Math.min(parseInt(req.query.limit) || 30, 100)

    // Self-heal: insert this user's missing rows before listing.
    // No-op when there's nothing to backfill.
    if (!cursor) {
      await syncUserCompletions(userId)
    }

    const result = await getCompleters(id, { cursor, limit })

    res.json({
      success: true,
      data: result.completers,
      nextCursor: result.nextCursor,
    })
  } catch (error) {
    console.error('❌ listCompleters:', error)
    res.status(500).json({ success: false, error: 'Failed to load completers', message: error.message })
  }
}

/**
 * GET /api/challenge-catalog/me/progress
 * Returns { [challengeId]: { value, isComplete } } for the authenticated user.
 */
export const myProgress = async (req, res) => {
  try {
    const userId = req.user.id
    // Backfill existing-activity completions before reading
    await syncUserCompletions(userId)
    const progress = await getUserProgress(userId)
    res.json({ success: true, data: progress })
  } catch (error) {
    console.error('❌ myProgress:', error)
    res.status(500).json({ success: false, error: 'Failed to load progress', message: error.message })
  }
}

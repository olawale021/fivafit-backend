import {
  getUserScanHistory,
  getScanById,
  deleteScan,
  getUserScanStats,
  searchUserScans,
  clearUserScanHistory,
  saveScanToHistory
} from '../services/scanHistoryService.js'

/**
 * Scan History Controller
 * Handles scan history HTTP requests
 */

/**
 * POST /api/scan-history
 * Save a new scan to history
 */
export async function createScan(req, res) {
  try {
    const userId = req.user.id
    const scanData = req.body

    if (!scanData || !scanData.name) {
      return res.status(400).json({
        error: 'Invalid scan data',
        message: 'Scan data with equipment name is required'
      })
    }

    const result = await saveScanToHistory(userId, scanData)

    if (!result) {
      return res.status(500).json({
        error: 'Failed to save scan',
        message: 'Internal server error while saving scan'
      })
    }

    res.json({
      success: true,
      data: result
    })

    console.log(`✅ Saved scan "${scanData.name}" for user: ${req.user.email}`)
  } catch (error) {
    console.error('❌ Create scan error:', error)
    res.status(500).json({
      error: 'Failed to save scan',
      message: 'Internal server error while saving scan'
    })
  }
}

/**
 * GET /api/scan-history
 * Get user's scan history with pagination
 */
export async function getHistory(req, res) {
  try {
    const userId = req.user.id
    const limit = parseInt(req.query.limit) || 20
    const offset = parseInt(req.query.offset) || 0

    const result = await getUserScanHistory(userId, limit, offset)

    res.json({
      success: true,
      data: result.scans,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: result.hasMore
      }
    })

    console.log(`✅ Fetched ${result.scans.length} scans for user: ${req.user.email}`)
  } catch (error) {
    console.error('❌ Get history error:', error)
    res.status(500).json({
      error: 'Failed to fetch scan history',
      message: 'Internal server error while fetching scan history'
    })
  }
}

/**
 * GET /api/scan-history/:id
 * Get a specific scan by ID
 */
export async function getScan(req, res) {
  try {
    const userId = req.user.id
    const scanId = req.params.id

    const scan = await getScanById(scanId, userId)

    if (!scan) {
      return res.status(404).json({
        error: 'Scan not found',
        message: 'The requested scan was not found or you do not have permission to view it'
      })
    }

    res.json({
      success: true,
      data: scan
    })

    console.log(`✅ Fetched scan ${scanId} for user: ${req.user.email}`)
  } catch (error) {
    console.error('❌ Get scan error:', error)
    res.status(500).json({
      error: 'Failed to fetch scan',
      message: 'Internal server error while fetching scan'
    })
  }
}

/**
 * DELETE /api/scan-history/:id
 * Delete a scan from history
 */
export async function deleteScanFromHistory(req, res) {
  try {
    const userId = req.user.id
    const scanId = req.params.id

    const success = await deleteScan(scanId, userId)

    if (!success) {
      return res.status(404).json({
        error: 'Scan not found',
        message: 'The scan could not be deleted or was not found'
      })
    }

    res.json({
      success: true,
      message: 'Scan deleted successfully'
    })

    console.log(`✅ Deleted scan ${scanId} for user: ${req.user.email}`)
  } catch (error) {
    console.error('❌ Delete scan error:', error)
    res.status(500).json({
      error: 'Failed to delete scan',
      message: 'Internal server error while deleting scan'
    })
  }
}

/**
 * GET /api/scan-history/stats
 * Get scan statistics for user
 */
export async function getStats(req, res) {
  try {
    const userId = req.user.id

    const stats = await getUserScanStats(userId)

    if (!stats) {
      return res.status(500).json({
        error: 'Failed to calculate stats',
        message: 'Internal server error while calculating statistics'
      })
    }

    res.json({
      success: true,
      data: stats
    })

    console.log(`✅ Fetched stats for user: ${req.user.email}`)
  } catch (error) {
    console.error('❌ Get stats error:', error)
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: 'Internal server error while fetching statistics'
    })
  }
}

/**
 * GET /api/scan-history/search
 * Search user's scan history
 */
export async function searchScans(req, res) {
  try {
    const userId = req.user.id
    const searchTerm = req.query.q || ''
    const limit = parseInt(req.query.limit) || 20

    if (!searchTerm) {
      return res.status(400).json({
        error: 'Missing search term',
        message: 'Please provide a search query parameter (q)'
      })
    }

    const scans = await searchUserScans(userId, searchTerm, limit)

    res.json({
      success: true,
      data: scans,
      query: searchTerm
    })

    console.log(`✅ Searched "${searchTerm}" for user: ${req.user.email}, found ${scans.length} results`)
  } catch (error) {
    console.error('❌ Search scans error:', error)
    res.status(500).json({
      error: 'Failed to search scans',
      message: 'Internal server error while searching scans'
    })
  }
}

/**
 * DELETE /api/scan-history
 * Clear all scan history for user
 */
export async function clearHistory(req, res) {
  try {
    const userId = req.user.id

    const success = await clearUserScanHistory(userId)

    if (!success) {
      return res.status(500).json({
        error: 'Failed to clear history',
        message: 'Internal server error while clearing history'
      })
    }

    res.json({
      success: true,
      message: 'Scan history cleared successfully'
    })

    console.log(`✅ Cleared all scan history for user: ${req.user.email}`)
  } catch (error) {
    console.error('❌ Clear history error:', error)
    res.status(500).json({
      error: 'Failed to clear history',
      message: 'Internal server error while clearing history'
    })
  }
}

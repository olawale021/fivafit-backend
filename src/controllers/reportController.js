import { createReport, getUserReports } from '../services/reportService.js'

/**
 * POST /api/reports
 * Submit a content report
 */
export const submitReport = async (req, res) => {
  try {
    const reporterId = req.user.id
    const { report_type, description, post_id, comment_id, reported_user_id, also_block } = req.body

    if (!report_type) {
      return res.status(400).json({
        success: false,
        message: 'Report type is required'
      })
    }

    const result = await createReport(reporterId, {
      report_type,
      description,
      post_id,
      comment_id,
      reported_user_id
    }, also_block !== false) // Default to true

    return res.json({
      success: true,
      message: 'Report submitted successfully. Thank you for helping keep our community safe.',
      reportId: result.report.id,
      blocked: result.blocked
    })
  } catch (error) {
    console.error('Error submitting report:', error)

    if (error.message === 'MISSING_TARGET') {
      return res.status(400).json({
        success: false,
        message: 'Please specify what you are reporting (post, comment, or user)'
      })
    }

    if (error.message === 'INVALID_REPORT_TYPE') {
      return res.status(400).json({
        success: false,
        message: 'Invalid report type'
      })
    }

    if (error.message === 'ALREADY_REPORTED') {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this content'
      })
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to submit report. Please try again.'
    })
  }
}

/**
 * GET /api/reports/my-reports
 * Get user's submitted reports
 */
export const getMyReports = async (req, res) => {
  try {
    const userId = req.user.id
    const reports = await getUserReports(userId)

    return res.json({
      success: true,
      reports
    })
  } catch (error) {
    console.error('Error fetching reports:', error)

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch reports'
    })
  }
}

import {
  getCurrentEulaVersion,
  hasUserAcceptedEula,
  acceptEula
} from '../services/eulaService.js'

/**
 * GET /api/auth/eula-status
 * Check if user has accepted the current EULA
 */
export const getEulaStatus = async (req, res) => {
  try {
    const userId = req.user.id

    const status = await hasUserAcceptedEula(userId)

    return res.json({
      success: true,
      ...status
    })
  } catch (error) {
    console.error('Error getting EULA status:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to get EULA status'
    })
  }
}

/**
 * POST /api/auth/accept-eula
 * Accept the EULA/Terms of Service
 */
export const acceptEulaHandler = async (req, res) => {
  try {
    const userId = req.user.id
    const { version, deviceInfo } = req.body

    // Get IP address from request
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] ||
                      req.connection?.remoteAddress ||
                      req.ip

    const result = await acceptEula(userId, version, ipAddress, deviceInfo)

    return res.json({
      success: true,
      message: 'EULA accepted successfully',
      ...result
    })
  } catch (error) {
    console.error('Error accepting EULA:', error)

    if (error.message === 'EULA_ACCEPTANCE_FAILED') {
      return res.status(500).json({
        success: false,
        message: 'Failed to record EULA acceptance'
      })
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred while accepting the EULA'
    })
  }
}

/**
 * GET /api/auth/eula-version
 * Get the current EULA version (public endpoint)
 */
export const getEulaVersion = async (req, res) => {
  try {
    const currentVersion = getCurrentEulaVersion()

    return res.json({
      success: true,
      currentVersion
    })
  } catch (error) {
    console.error('Error getting EULA version:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to get EULA version'
    })
  }
}

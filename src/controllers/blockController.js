import {
  blockUser,
  unblockUser,
  getBlockStatus,
  getBlockedUsers
} from '../services/blockService.js'

/**
 * POST /api/users/:userId/block
 * Block a user
 */
export const blockUserHandler = async (req, res) => {
  try {
    const blockerId = req.user.id
    const blockedId = req.params.userId

    const result = await blockUser(blockerId, blockedId)

    return res.json({
      success: true,
      message: 'User blocked successfully',
      ...result
    })
  } catch (error) {
    console.error('Error blocking user:', error)

    if (error.message === 'CANNOT_BLOCK_SELF') {
      return res.status(400).json({
        success: false,
        message: 'You cannot block yourself'
      })
    }

    if (error.message === 'ALREADY_BLOCKED') {
      return res.status(400).json({
        success: false,
        message: 'User is already blocked'
      })
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to block user'
    })
  }
}

/**
 * DELETE /api/users/:userId/block
 * Unblock a user
 */
export const unblockUserHandler = async (req, res) => {
  try {
    const blockerId = req.user.id
    const blockedId = req.params.userId

    const result = await unblockUser(blockerId, blockedId)

    return res.json({
      success: true,
      message: 'User unblocked successfully',
      ...result
    })
  } catch (error) {
    console.error('Error unblocking user:', error)

    return res.status(500).json({
      success: false,
      message: 'Failed to unblock user'
    })
  }
}

/**
 * GET /api/users/:userId/block-status
 * Check if a user is blocked
 */
export const getBlockStatusHandler = async (req, res) => {
  try {
    const userId = req.user.id
    const targetId = req.params.userId

    const status = await getBlockStatus(userId, targetId)

    return res.json({
      success: true,
      ...status
    })
  } catch (error) {
    console.error('Error getting block status:', error)

    return res.status(500).json({
      success: false,
      message: 'Failed to get block status'
    })
  }
}

/**
 * GET /api/users/me/blocked
 * Get list of blocked users
 */
export const getBlockedUsersHandler = async (req, res) => {
  try {
    const userId = req.user.id

    const blockedUsers = await getBlockedUsers(userId)

    return res.json({
      success: true,
      blockedUsers
    })
  } catch (error) {
    console.error('Error getting blocked users:', error)

    return res.status(500).json({
      success: false,
      message: 'Failed to get blocked users'
    })
  }
}

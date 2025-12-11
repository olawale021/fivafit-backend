import express from 'express'
import {
  getUserStats,
  getUserProfile,
  followUser,
  unfollowUser,
  getUserFollowers,
  getUserFollowing,
  getFollowStatus,
  searchUsers,
  getSuggestedUsers
} from '../controllers/authController.js'
import { getSavedPosts, getLikedPosts } from '../controllers/postsController.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

/**
 * GET /api/users/search
 * Search for users by name or username
 * Note: This must come before /:userId to avoid conflicts
 */
router.get('/search', searchUsers)

/**
 * GET /api/users/suggested
 * Get suggested/random users for discovery
 */
router.get('/suggested', getSuggestedUsers)

/**
 * GET /api/users/me/saved
 * Get saved posts for the current user (requires authentication)
 */
router.get('/me/saved', authenticateToken, getSavedPosts)

/**
 * GET /api/users/me/liked
 * Get liked posts for the current user (requires authentication)
 */
router.get('/me/liked', authenticateToken, getLikedPosts)

/**
 * GET /api/users/:userId
 * Get user profile by ID
 */
router.get('/:userId', getUserProfile)

/**
 * GET /api/users/:userId/stats
 * Get user statistics (total workouts, streak, posts count)
 */
router.get('/:userId/stats', getUserStats)

/**
 * POST /api/users/:userId/follow
 * Follow a user (requires authentication)
 */
router.post('/:userId/follow', authenticateToken, followUser)

/**
 * DELETE /api/users/:userId/follow
 * Unfollow a user (requires authentication)
 */
router.delete('/:userId/follow', authenticateToken, unfollowUser)

/**
 * GET /api/users/:userId/followers
 * Get list of users following this user
 */
router.get('/:userId/followers', getUserFollowers)

/**
 * GET /api/users/:userId/following
 * Get list of users this user is following
 */
router.get('/:userId/following', getUserFollowing)

/**
 * GET /api/users/:userId/follow-status
 * Check if current user is following this user (requires authentication)
 */
router.get('/:userId/follow-status', authenticateToken, getFollowStatus)

export default router

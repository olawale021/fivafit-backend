import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import {
  getMyGroups,
  getGroup,
  create,
  update,
  deleteGroupById,
  invite,
  join,
  leave,
  removeMemberFromGroup,
  getMembers,
  getGroupFeed,
  getGroupChallenges,
  approveJoin,
  browse,
  getByCode,
  joinByCode,
  getLeaderboard
} from '../controllers/groupsController.js'

const router = express.Router()

/**
 * GET /api/groups
 * Get user's groups
 * Query params: status (optional, default: 'active')
 */
router.get('/', authenticateToken, getMyGroups)

/**
 * POST /api/groups
 * Create a new group
 */
router.post('/', authenticateToken, create)

/**
 * Specific paths must come BEFORE the parameterized /:id to avoid being shadowed.
 */

/**
 * GET /api/groups/browse?category=steps&cursor=…
 * List public groups for the discovery screen.
 */
router.get('/browse', authenticateToken, browse)

/**
 * GET /api/groups/by-code/:code
 * Look up a group by its invite_code (preview before joining).
 */
router.get('/by-code/:code', authenticateToken, getByCode)

/**
 * POST /api/groups/join-by-code/:code
 * Join (or request to join) a group via its invite_code.
 */
router.post('/join-by-code/:code', authenticateToken, joinByCode)

/**
 * GET /api/groups/:id
 * Get group details by ID
 */
router.get('/:id', authenticateToken, getGroup)

/**
 * PUT /api/groups/:id
 * Update group details (admin only)
 */
router.put('/:id', authenticateToken, update)

/**
 * DELETE /api/groups/:id
 * Delete group (creator only)
 */
router.delete('/:id', authenticateToken, deleteGroupById)

/**
 * POST /api/groups/:id/invite
 * Invite user to group (admin/moderator only)
 */
router.post('/:id/invite', authenticateToken, invite)

/**
 * POST /api/groups/:id/join
 * Join or request to join group
 */
router.post('/:id/join', authenticateToken, join)

/**
 * DELETE /api/groups/:id/leave
 * Leave group
 */
router.delete('/:id/leave', authenticateToken, leave)

/**
 * POST /api/groups/:id/approve/:userId
 * Approve join request (admin/moderator only)
 */
router.post('/:id/approve/:userId', authenticateToken, approveJoin)

/**
 * DELETE /api/groups/:id/members/:userId
 * Remove member from group (admin only)
 */
router.delete('/:id/members/:userId', authenticateToken, removeMemberFromGroup)

/**
 * GET /api/groups/:id/members
 * Get group members
 * Query params: status (optional, default: 'active')
 */
router.get('/:id/members', authenticateToken, getMembers)

/**
 * GET /api/groups/:id/feed
 * Get group feed (posts from group members)
 * Query params: limit, cursor
 */
router.get('/:id/feed', authenticateToken, getGroupFeed)

/**
 * GET /api/groups/:id/challenges
 * Get group challenges
 */
router.get('/:id/challenges', authenticateToken, getGroupChallenges)

/**
 * GET /api/groups/:id/leaderboard?period=week|month|all
 * Category-aware leaderboard.
 */
router.get('/:id/leaderboard', authenticateToken, getLeaderboard)

export default router

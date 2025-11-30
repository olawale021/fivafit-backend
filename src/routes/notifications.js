import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  registerPushToken,
  getPreferences,
  updatePreferences
} from '../controllers/notificationsController.js'

const router = express.Router()

/**
 * GET /api/notifications
 * Get notifications for the current user (paginated)
 */
router.get('/', authenticateToken, getNotifications)

/**
 * GET /api/notifications/unread-count
 * Get unread notifications count
 */
router.get('/unread-count', authenticateToken, getUnreadCount)

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read (must be before /:notificationId to avoid conflict)
 */
router.put('/read-all', authenticateToken, markAllAsRead)

/**
 * PUT /api/notifications/:notificationId/read
 * Mark a notification as read
 */
router.put('/:notificationId/read', authenticateToken, markAsRead)

/**
 * POST /api/notifications/register-push-token
 * Register or update user's push notification token
 */
router.post('/register-push-token', authenticateToken, registerPushToken)

/**
 * GET /api/notifications/preferences
 * Get user's notification preferences
 */
router.get('/preferences', authenticateToken, getPreferences)

/**
 * PUT /api/notifications/preferences
 * Update user's notification preferences
 */
router.put('/preferences', authenticateToken, updatePreferences)

export default router

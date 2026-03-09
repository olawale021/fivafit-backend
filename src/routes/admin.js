import express from 'express'
import { supabase } from '../config/supabase.js'
import { sendPushNotification, sendBatchPushNotifications } from '../services/pushNotificationService.js'

const router = express.Router()

// Simple admin auth middleware using a secret key
const authenticateAdmin = (req, res, next) => {
  const adminKey = req.headers['x-admin-key']
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }
  next()
}

/**
 * GET /api/admin/users
 * Get all users for the notification dashboard
 */
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, full_name, username, push_notifications_enabled, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      return res.status(500).json({ success: false, error: error.message })
    }

    // Get push token status for each user
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('user_id, is_active')
      .eq('is_active', true)

    const activeTokenUsers = new Set((tokens || []).map(t => t.user_id))

    const usersWithStatus = (users || []).map(user => ({
      ...user,
      has_push_token: activeTokenUsers.has(user.id),
    }))

    res.json({ success: true, data: usersWithStatus })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * POST /api/admin/send-notification
 * Send notification to specific users or all users
 */
router.post('/send-notification', authenticateAdmin, async (req, res) => {
  try {
    const { title, body, userIds, sendToAll } = req.body

    if (!title || !body) {
      return res.status(400).json({ success: false, error: 'Title and body are required' })
    }

    let targetUserIds = userIds || []

    if (sendToAll) {
      const { data: users, error } = await supabase
        .from('users')
        .select('id')
        .eq('push_notifications_enabled', true)

      if (error) {
        return res.status(500).json({ success: false, error: error.message })
      }
      targetUserIds = (users || []).map(u => u.id)
    }

    if (targetUserIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No users to send to' })
    }

    console.log(`[Admin] Sending notification to ${targetUserIds.length} user(s): "${title}"`)

    let sent = 0
    let failed = 0
    let skipped = 0

    for (const userId of targetUserIds) {
      try {
        const tickets = await sendPushNotification(userId, {
          title,
          body,
          data: { type: 'admin_broadcast' },
        })
        if (tickets.length > 0) {
          sent++
        } else {
          skipped++
        }
      } catch (err) {
        failed++
        console.error(`[Admin] Failed to send to ${userId}:`, err)
      }
    }

    console.log(`[Admin] Notification complete: ${sent} sent, ${skipped} skipped, ${failed} failed`)

    res.json({
      success: true,
      data: {
        total: targetUserIds.length,
        sent,
        skipped,
        failed,
      },
    })
  } catch (error) {
    console.error('[Admin] Send notification error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router

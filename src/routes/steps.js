import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { syncUserCompletions } from '../services/challengeCatalogService.js'
import { maybeNotifyStepGoalReached } from '../services/notificationService.js'

const router = express.Router()

/**
 * POST /api/steps/daily
 * Upsert a daily step record for the authenticated user, then evaluate step
 * challenges. Used by the mobile client to mirror HealthKit's "today" total.
 *
 * Body: { date: 'YYYY-MM-DD', step_count: number, source?: string }
 */
router.post('/daily', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { date, step_count, source } = req.body || {}

    if (!date || typeof step_count !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'date (YYYY-MM-DD) and step_count (number) are required',
      })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: 'date must be YYYY-MM-DD' })
    }
    if (step_count < 0 || step_count > 200000) {
      return res.status(400).json({ success: false, error: 'step_count out of range' })
    }

    const rounded = Math.round(step_count)

    // Read existing row so we never decrease a previously-stored higher count
    // (HealthKit sometimes returns partial intra-day values).
    const { data: existing } = await supabase
      .from('daily_steps')
      .select('step_count')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle()

    const finalCount = existing ? Math.max(existing.step_count || 0, rounded) : rounded

    const { error } = await supabase
      .from('daily_steps')
      .upsert(
        {
          user_id: userId,
          date,
          step_count: finalCount,
          source: source || 'healthkit',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,date' }
      )

    if (error) {
      console.error('❌ daily_steps upsert:', error)
      return res.status(500).json({ success: false, error: 'Failed to save step record' })
    }

    // Re-evaluate step challenges (also re-evaluates everything else cheaply).
    syncUserCompletions(userId).catch((err) =>
      console.error('❌ step sync after daily save:', err)
    )

    // Notify on crossing the daily step goal (non-blocking; only fires today's
    // record and only the moment the goal is crossed).
    if (date === new Date().toISOString().split('T')[0]) {
      maybeNotifyStepGoalReached(userId, existing?.step_count || 0, finalCount).catch((err) =>
        console.error('❌ step goal notify:', err)
      )
    }

    res.json({ success: true, data: { date, step_count: finalCount } })
  } catch (error) {
    console.error('❌ POST /api/steps/daily:', error)
    res.status(500).json({ success: false, error: 'Failed to save step record' })
  }
})

/**
 * POST /api/steps/daily/bulk
 * Bulk upsert daily step records — used to backfill historical days from
 * HealthKit on app launch. Idempotent: any (user, date) already present is
 * kept at MAX(stored, incoming) so a partial-day reading never decreases an
 * already-completed day.
 *
 * Body: { days: [{ date: 'YYYY-MM-DD', step_count: number, source?: string }, ...] }
 */
router.post('/daily/bulk', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const days = Array.isArray(req.body?.days) ? req.body.days : null
    if (!days || days.length === 0) {
      return res.status(400).json({ success: false, error: 'days array is required' })
    }
    if (days.length > 400) {
      return res.status(400).json({ success: false, error: 'days array too large (max 400)' })
    }

    // Validate + normalize
    const normalized = []
    for (const d of days) {
      if (!d || typeof d !== 'object') continue
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue
      const n = Math.round(Number(d.step_count))
      if (!Number.isFinite(n) || n < 0 || n > 200000) continue
      normalized.push({
        date: d.date,
        step_count: n,
        source: typeof d.source === 'string' ? d.source : 'healthkit',
      })
    }
    if (normalized.length === 0) {
      return res.status(400).json({ success: false, error: 'no valid days in payload' })
    }

    // Read existing rows for these dates so we can MAX merge
    const dates = normalized.map((d) => d.date)
    const { data: existing, error: readErr } = await supabase
      .from('daily_steps')
      .select('date, step_count')
      .eq('user_id', userId)
      .in('date', dates)
    if (readErr) throw readErr

    const existingByDate = new Map(
      (existing || []).map((r) => [r.date, r.step_count || 0])
    )

    const rows = normalized.map((d) => ({
      user_id: userId,
      date: d.date,
      step_count: Math.max(existingByDate.get(d.date) || 0, d.step_count),
      source: d.source,
      updated_at: new Date().toISOString(),
    }))

    const { error: upErr } = await supabase
      .from('daily_steps')
      .upsert(rows, { onConflict: 'user_id,date' })
    if (upErr) throw upErr

    res.json({ success: true, data: { inserted: rows.length } })
  } catch (error) {
    console.error('❌ POST /api/steps/daily/bulk:', error)
    res.status(500).json({ success: false, error: 'Failed to bulk save steps' })
  }
})

/**
 * GET /api/steps/recent
 * Returns the authenticated user's daily step history, most-recent first.
 */
router.get('/recent', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const limit = Math.min(parseInt(req.query.limit) || 60, 365)

    const { data, error } = await supabase
      .from('daily_steps')
      .select('date, step_count')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(limit)

    if (error) throw error
    res.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('❌ GET /api/steps/recent:', error)
    res.status(500).json({ success: false, error: 'Failed to load step history' })
  }
})

export default router

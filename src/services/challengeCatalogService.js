import { supabase } from '../config/supabase.js'

// =============================================================================
// Catalog reads
// =============================================================================

export const getCatalog = async () => {
  const { data, error } = await supabase
    .from('challenge_catalog')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) throw error
  return data || []
}

export const getCatalogByCategory = async (category) => {
  const { data, error } = await supabase
    .from('challenge_catalog')
    .select('*')
    .eq('is_active', true)
    .eq('category', category)
    .order('display_order', { ascending: true })

  if (error) throw error
  return data || []
}

export const getCatalogById = async (id) => {
  const { data, error } = await supabase
    .from('challenge_catalog')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}

// =============================================================================
// Run aggregations (shared between getUserProgress and evaluateRunChallenges)
// =============================================================================

const RUNS_SELECT_FIELDS =
  'distance_meters, activity_type, status, started_at, calories_burned, steps, ' +
  'elevation_gain_m, avg_pace_sec_km, duration_seconds, splits'

const monthKey = (date) => {
  const d = new Date(date)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// ISO week key, e.g. "2026-W19"
const isoWeekKey = (date) => {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  const dayNum = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const thursday = d.getTime()
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const yearStartDayNum = (yearStart.getUTCDay() + 6) % 7
  yearStart.setUTCDate(yearStart.getUTCDate() - yearStartDayNum + 3)
  const week = 1 + Math.round((thursday - yearStart.getTime()) / 604800000)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// Get the next ISO week key (handles year rollover)
const nextWeekKey = (key) => {
  const [yearStr, wkStr] = key.split('-W')
  const year = Number(yearStr)
  const week = Number(wkStr)
  // Monday of that ISO week
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayNum = (jan4.getUTCDay() + 6) % 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - dayNum)
  const target = new Date(week1Monday)
  target.setUTCDate(week1Monday.getUTCDate() + week * 7) // next week's Monday
  return isoWeekKey(target)
}

const aggregateRuns = (runs) => {
  const byMonth = {}
  const byWeek = {}
  const weekDayHits = {}
  let bestSpeedster = Infinity
  let bestSundayDistance = 0
  let maxElevation = 0
  let totalCalories = 0
  let totalSteps = 0
  let totalDistance = 0
  let maxSingleRun = 0
  let negativeSplitDist = 0

  for (const r of runs) {
    if ((r.activity_type || 'run') !== 'run') continue
    totalDistance += r.distance_meters || 0
    totalCalories += r.calories_burned || 0
    totalSteps += r.steps || 0
    maxSingleRun = Math.max(maxSingleRun, r.distance_meters || 0)
    maxElevation = Math.max(maxElevation, r.elevation_gain_m || 0)

    if (r.started_at) {
      const d = new Date(r.started_at)
      const mk = monthKey(d)
      byMonth[mk] = (byMonth[mk] || 0) + (r.distance_meters || 0)
      const wk = isoWeekKey(d)
      byWeek[wk] = (byWeek[wk] || 0) + 1
      const dow = d.getUTCDay()
      if (!weekDayHits[wk]) weekDayHits[wk] = new Set()
      weekDayHits[wk].add(dow)
      if (dow === 0 && (r.distance_meters || 0) > bestSundayDistance) {
        bestSundayDistance = r.distance_meters || 0
      }
    }

    if ((r.distance_meters || 0) >= 5000 && r.avg_pace_sec_km && r.avg_pace_sec_km < bestSpeedster) {
      bestSpeedster = r.avg_pace_sec_km
    }

    if (Array.isArray(r.splits) && r.splits.length >= 2 && (r.distance_meters || 0) >= 3000) {
      const mid = Math.floor(r.splits.length / 2)
      const firstHalf = r.splits
        .slice(0, mid)
        .reduce((s, sp) => s + (sp?.duration_seconds || sp?.duration || 0), 0)
      const secondHalf = r.splits
        .slice(mid)
        .reduce((s, sp) => s + (sp?.duration_seconds || sp?.duration || 0), 0)
      if (firstHalf > 0 && secondHalf > 0 && secondHalf < firstHalf) {
        negativeSplitDist = Math.max(negativeSplitDist, r.distance_meters || 0)
      }
    }
  }

  const bestMonthlyDistance = Object.values(byMonth).reduce((m, v) => Math.max(m, v), 0)
  const bestRunsPerWeek = Object.values(byWeek).reduce((m, v) => Math.max(m, v), 0)

  // Best consecutive run weeks
  const weekKeys = Object.keys(byWeek).sort()
  let bestConsecWeeks = 0
  let curConsec = 0
  let prev = null
  for (const wk of weekKeys) {
    if (prev === null) curConsec = 1
    else if (nextWeekKey(prev) === wk) curConsec += 1
    else curConsec = 1
    if (curConsec > bestConsecWeeks) bestConsecWeeks = curConsec
    prev = wk
  }

  // Weekday warrior (Mon-Fri = 1..5 in UTC)
  let weekdayWarrior = 0
  for (const set of Object.values(weekDayHits)) {
    if ([1, 2, 3, 4, 5].every((d) => set.has(d))) {
      weekdayWarrior = 1
      break
    }
  }

  return {
    runCount: runs.filter((r) => (r.activity_type || 'run') === 'run').length,
    totalDistance: Math.round(totalDistance),
    maxSingleRun,
    totalCalories: Math.round(totalCalories),
    totalSteps,
    maxElevation,
    bestSpeedster: bestSpeedster === Infinity ? null : bestSpeedster,
    bestMonthlyDistance,
    bestRunsPerWeek,
    bestConsecWeeks,
    bestSundayDistance,
    weekdayWarrior,
    negativeSplitDist,
  }
}

const fetchAllRuns = async (userId) => {
  // Include id for unlock-event attribution, ordered ASC for chronological walks
  const { data, error } = await supabase
    .from('runs')
    .select('id, ' + RUNS_SELECT_FIELDS)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('started_at', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Fetch all daily step records, sorted ASC by date.
 * Returns [{ date: 'YYYY-MM-DD', step_count }, ...]
 */
const fetchDailySteps = async (userId) => {
  const { data, error } = await supabase
    .from('daily_steps')
    .select('date, step_count')
    .eq('user_id', userId)
    .order('date', { ascending: true })
  if (error) {
    console.error('❌ fetchDailySteps:', error)
    return []
  }
  return data || []
}

/**
 * Aggregate daily-step metrics for step-based challenges.
 */
const aggregateSteps = (dailySteps, goal) => {
  let maxSingleDay = 0
  let lifetime = 0
  const dateSet = new Set()

  for (const row of dailySteps) {
    maxSingleDay = Math.max(maxSingleDay, row.step_count || 0)
    lifetime += row.step_count || 0
    if (row.date) dateSet.add(row.date)
  }

  // Goal streak — N consecutive calendar days hitting `goal`
  let bestGoalStreak = 0
  if (goal && goal > 0) {
    let cur = 0
    let prev = null
    for (const row of dailySteps) {
      const met = (row.step_count || 0) >= goal
      if (!met) {
        cur = 0
        prev = null
        continue
      }
      if (prev && isNextDay(prev, row.date)) {
        cur += 1
      } else {
        cur = 1
      }
      bestGoalStreak = Math.max(bestGoalStreak, cur)
      prev = row.date
    }
  }

  return {
    maxSingleDay,
    lifetime,
    bestGoalStreak,
    daysWithRecords: dateSet.size,
  }
}

const isNextDay = (prevIso, nextIso) => {
  if (!prevIso || !nextIso) return false
  const a = new Date(prevIso + 'T00:00:00Z').getTime()
  const b = new Date(nextIso + 'T00:00:00Z').getTime()
  return b - a === 24 * 60 * 60 * 1000
}

const fetchPersonalBests = async (userId) => {
  const { data, error } = await supabase
    .from('personal_bests')
    .select('distance_type, time_seconds, achieved_at, run_id')
    .eq('user_id', userId)
  if (error) return {}
  const map = {}
  for (const pb of data || []) {
    map[pb.distance_type] = pb
  }
  return map
}

// =============================================================================
// User progress
// =============================================================================

/**
 * Compute the user's current value for a single catalog challenge,
 * given pre-aggregated inputs. Pure function — easy to unit-test.
 */
const computeValueForChallenge = (c, { agg, pbs, streakBest, targetCounts, stepsAgg }) => {
  switch (c.threshold_type) {
    case 'run_distance_m_single':
      return agg.maxSingleRun
    case 'run_distance_m_lifetime':
      return agg.totalDistance
    case 'run_count':
      return agg.runCount
    case 'workout_count_by_target':
      return targetCounts[c.workout_target] || 0
    case 'streak_days_any_activity':
      return streakBest
    case 'run_pace_subx': {
      // Lower is better — qualified means PB time is <= threshold_value
      const pb = pbs[c.workout_target]
      return pb && pb.time_seconds <= c.threshold_value ? c.threshold_value : 0
    }
    case 'run_pace_speedster':
      return agg.bestSpeedster && agg.bestSpeedster <= c.threshold_value ? c.threshold_value : 0
    case 'run_monthly_distance':
      return agg.bestMonthlyDistance
    case 'run_elevation_single':
      return agg.maxElevation
    case 'run_calories_lifetime':
      return agg.totalCalories
    case 'run_steps_lifetime':
      return agg.totalSteps
    case 'run_runs_per_week':
      return agg.bestRunsPerWeek
    case 'run_consecutive_weeks':
      return agg.bestConsecWeeks
    case 'run_sunday_distance':
      return agg.bestSundayDistance
    case 'run_weekday_warrior':
      return agg.weekdayWarrior ? c.threshold_value : 0
    case 'run_negative_splits':
      return agg.negativeSplitDist >= c.threshold_value ? c.threshold_value : 0
    case 'step_count_daily_single':
      return stepsAgg?.maxSingleDay || 0
    case 'step_count_lifetime_daily':
      return stepsAgg?.lifetime || 0
    case 'step_count_goal_streak':
      return stepsAgg?.bestGoalStreak || 0
    default:
      return 0
  }
}

/**
 * Fetch and pre-compute everything the value/sync logic needs.
 * Avoids duplicating the parallel-fetch dance across callers.
 */
const buildUserContext = async (userId) => {
  const [runs, streakRow, completionsRes, pbs, workouts, dailySteps, userRow] = await Promise.all([
    fetchAllRuns(userId), // sorted ASC by started_at
    supabase
      .from('user_streaks')
      .select('current_count, best_count, last_activity_date')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('user_challenge_completions')
      .select('challenge_id')
      .eq('user_id', userId),
    fetchPersonalBests(userId),
    fetchSortedWorkouts(userId), // sorted ASC by completed_at, with target
    fetchDailySteps(userId),
    supabase
      .from('users')
      .select('daily_step_goal')
      .eq('id', userId)
      .maybeSingle(),
  ])

  const dailyStepGoal = userRow.data?.daily_step_goal || 0
  const stepsAgg = aggregateSteps(dailySteps, dailyStepGoal)

  return {
    sortedRuns: runs,
    sortedWorkouts: workouts,
    agg: aggregateRuns(runs),
    pbs,
    streakBest: streakRow.data?.best_count || 0,
    streakLastDate: streakRow.data?.last_activity_date || null,
    targetCounts: tallyByTarget(workouts),
    doneIds: new Set((completionsRes.data || []).map((c) => c.challenge_id)),
    dailySteps,
    dailyStepGoal,
    stepsAgg,
  }
}

/**
 * Determine the activity timestamp + reference id that first qualified the
 * user for a given catalog challenge. Walks chronologically through
 * ctx.sortedRuns / ctx.sortedWorkouts so the resulting completed_at matches
 * the real activity date, not "now".
 *
 * Returns { completed_at, run_id?, workout_id? } or null if the user does
 * not yet qualify.
 */
const computeUnlockEvent = (c, ctx) => {
  const { sortedRuns, sortedWorkouts, pbs, streakLastDate, streakBest } = ctx

  switch (c.threshold_type) {
    case 'run_distance_m_single': {
      const r = sortedRuns.find(
        (r) => (r.activity_type || 'run') === 'run' && (r.distance_meters || 0) >= c.threshold_value
      )
      return r ? { completed_at: r.started_at, run_id: r.id } : null
    }
    case 'run_distance_m_lifetime': {
      let sum = 0
      for (const r of sortedRuns) {
        if ((r.activity_type || 'run') !== 'run') continue
        sum += r.distance_meters || 0
        if (sum >= c.threshold_value) return { completed_at: r.started_at, run_id: r.id }
      }
      return null
    }
    case 'run_count': {
      const runs = sortedRuns.filter((r) => (r.activity_type || 'run') === 'run')
      const r = runs[c.threshold_value - 1]
      return r ? { completed_at: r.started_at, run_id: r.id } : null
    }
    case 'workout_count_by_target': {
      const filtered = sortedWorkouts.filter((w) => w.target === c.workout_target)
      const w = filtered[c.threshold_value - 1]
      return w ? { completed_at: w.completed_at, workout_id: w.id } : null
    }
    case 'streak_days_any_activity': {
      if (streakBest < c.threshold_value) return null
      // We only know the most recent activity date; use it as a best-effort
      // attribution for retroactive streak unlocks.
      return streakLastDate ? { completed_at: streakLastDate } : null
    }
    case 'run_pace_subx': {
      const pb = pbs[c.workout_target]
      if (!pb || pb.time_seconds > c.threshold_value) return null
      return { completed_at: pb.achieved_at, run_id: pb.run_id }
    }
    case 'run_pace_speedster': {
      const r = sortedRuns.find(
        (r) =>
          (r.activity_type || 'run') === 'run' &&
          (r.distance_meters || 0) >= 5000 &&
          r.avg_pace_sec_km &&
          r.avg_pace_sec_km <= c.threshold_value
      )
      return r ? { completed_at: r.started_at, run_id: r.id } : null
    }
    case 'run_monthly_distance': {
      const byMonth = {}
      for (const r of sortedRuns) {
        if ((r.activity_type || 'run') !== 'run' || !r.started_at) continue
        const mk = monthKey(r.started_at)
        byMonth[mk] = (byMonth[mk] || 0) + (r.distance_meters || 0)
        if (byMonth[mk] >= c.threshold_value) {
          return { completed_at: r.started_at, run_id: r.id }
        }
      }
      return null
    }
    case 'run_elevation_single': {
      const r = sortedRuns.find(
        (r) =>
          (r.activity_type || 'run') === 'run' && (r.elevation_gain_m || 0) >= c.threshold_value
      )
      return r ? { completed_at: r.started_at, run_id: r.id } : null
    }
    case 'run_calories_lifetime': {
      let sum = 0
      for (const r of sortedRuns) {
        if ((r.activity_type || 'run') !== 'run') continue
        sum += r.calories_burned || 0
        if (sum >= c.threshold_value) return { completed_at: r.started_at, run_id: r.id }
      }
      return null
    }
    case 'run_steps_lifetime': {
      let sum = 0
      for (const r of sortedRuns) {
        if ((r.activity_type || 'run') !== 'run') continue
        sum += r.steps || 0
        if (sum >= c.threshold_value) return { completed_at: r.started_at, run_id: r.id }
      }
      return null
    }
    case 'run_runs_per_week': {
      const counts = {}
      for (const r of sortedRuns) {
        if ((r.activity_type || 'run') !== 'run' || !r.started_at) continue
        const wk = isoWeekKey(r.started_at)
        counts[wk] = (counts[wk] || 0) + 1
        if (counts[wk] === c.threshold_value) {
          return { completed_at: r.started_at, run_id: r.id }
        }
      }
      return null
    }
    case 'run_consecutive_weeks': {
      const weekKeys = Array.from(
        new Set(
          sortedRuns
            .filter((r) => (r.activity_type || 'run') === 'run' && r.started_at)
            .map((r) => isoWeekKey(r.started_at))
        )
      ).sort()
      let cur = 0
      let prev = null
      for (const wk of weekKeys) {
        cur = prev === null ? 1 : nextWeekKey(prev) === wk ? cur + 1 : 1
        prev = wk
        if (cur >= c.threshold_value) {
          // Use the last run of the qualifying week so the badge date is when
          // it actually crossed the threshold.
          const inWeek = sortedRuns.filter(
            (r) =>
              (r.activity_type || 'run') === 'run' &&
              r.started_at &&
              isoWeekKey(r.started_at) === wk
          )
          const last = inWeek[inWeek.length - 1]
          return last ? { completed_at: last.started_at, run_id: last.id } : null
        }
      }
      return null
    }
    case 'run_sunday_distance': {
      const r = sortedRuns.find((r) => {
        if ((r.activity_type || 'run') !== 'run' || !r.started_at) return false
        const dow = new Date(r.started_at).getUTCDay()
        return dow === 0 && (r.distance_meters || 0) >= c.threshold_value
      })
      return r ? { completed_at: r.started_at, run_id: r.id } : null
    }
    case 'run_weekday_warrior': {
      const seen = {}
      for (const r of sortedRuns) {
        if ((r.activity_type || 'run') !== 'run' || !r.started_at) continue
        const wk = isoWeekKey(r.started_at)
        const dow = new Date(r.started_at).getUTCDay()
        if (!seen[wk]) seen[wk] = new Set()
        seen[wk].add(dow)
        if ([1, 2, 3, 4, 5].every((d) => seen[wk].has(d))) {
          return { completed_at: r.started_at, run_id: r.id }
        }
      }
      return null
    }
    case 'run_negative_splits': {
      const r = sortedRuns.find((r) => {
        if ((r.activity_type || 'run') !== 'run') return false
        if (!Array.isArray(r.splits) || r.splits.length < 2) return false
        if ((r.distance_meters || 0) < c.threshold_value) return false
        const mid = Math.floor(r.splits.length / 2)
        const f = r.splits
          .slice(0, mid)
          .reduce((s, sp) => s + (sp?.duration_seconds || sp?.duration || 0), 0)
        const s2 = r.splits
          .slice(mid)
          .reduce((s, sp) => s + (sp?.duration_seconds || sp?.duration || 0), 0)
        return f > 0 && s2 > 0 && s2 < f
      })
      return r ? { completed_at: r.started_at, run_id: r.id } : null
    }
    case 'step_count_daily_single': {
      const row = ctx.dailySteps.find((d) => (d.step_count || 0) >= c.threshold_value)
      return row ? { completed_at: dateOnlyToTimestamp(row.date) } : null
    }
    case 'step_count_lifetime_daily': {
      let sum = 0
      for (const row of ctx.dailySteps) {
        sum += row.step_count || 0
        if (sum >= c.threshold_value) {
          return { completed_at: dateOnlyToTimestamp(row.date) }
        }
      }
      return null
    }
    case 'step_count_goal_streak': {
      const goal = ctx.dailyStepGoal
      if (!goal || goal <= 0) return null
      let cur = 0
      let prev = null
      for (const row of ctx.dailySteps) {
        const met = (row.step_count || 0) >= goal
        if (!met) {
          cur = 0
          prev = null
          continue
        }
        if (prev && isNextDay(prev, row.date)) cur += 1
        else cur = 1
        if (cur >= c.threshold_value) {
          return { completed_at: dateOnlyToTimestamp(row.date) }
        }
        prev = row.date
      }
      return null
    }
    default:
      return null
  }
}

const dateOnlyToTimestamp = (dateOnly) => {
  if (!dateOnly) return null
  // Anchor to noon UTC so the day shows correctly in any tz
  return `${dateOnly}T12:00:00.000Z`
}

/**
 * Insert any missing user_challenge_completions rows for challenges the user
 * has already qualified for (retroactive backfill). Safe to call repeatedly —
 * the unique index drops duplicates.
 *
 * Each inserted row uses the ACTUAL date the activity earned the challenge,
 * not "now", via computeUnlockEvent.
 */
export const syncUserCompletions = async (userId) => {
  try {
    const catalog = await getCatalog()
    const ctx = await buildUserContext(userId)

    const toInsert = []
    for (const c of catalog) {
      if (ctx.doneIds.has(c.id)) continue
      const value = computeValueForChallenge(c, ctx)
      if (value < c.threshold_value) continue

      const event = computeUnlockEvent(c, ctx)
      // Always set completed_at explicitly — Supabase batch upsert doesn't
      // honor column defaults consistently when some rows in the batch omit
      // the key. Fall back to NOW when we can't pinpoint the historical date.
      toInsert.push({
        user_id: userId,
        challenge_id: c.id,
        final_value: toIntOrNull(value),
        completed_at: event?.completed_at || new Date().toISOString(),
        trigger_run_id: event?.run_id || null,
        trigger_workout_id: event?.workout_id || null,
      })
    }

    if (toInsert.length === 0) return 0

    const { error } = await supabase
      .from('user_challenge_completions')
      .upsert(toInsert, { onConflict: 'user_id,challenge_id', ignoreDuplicates: true })

    if (error && error.code !== '23505') {
      console.error('❌ syncUserCompletions insert:', error)
    }
    return toInsert.length
  } catch (err) {
    console.error('❌ syncUserCompletions:', err)
    return 0
  }
}

/**
 * Pure read of the user's current progress against the catalog.
 * Callers that need backfill (so existing activity counts as completed) must
 * call syncUserCompletions(userId) BEFORE invoking this.
 */
export const getUserProgress = async (userId) => {
  const catalog = await getCatalog()
  const ctx = await buildUserContext(userId)

  const out = {}
  for (const c of catalog) {
    const value = computeValueForChallenge(c, ctx)
    out[c.id] = {
      value,
      isComplete: ctx.doneIds.has(c.id) || value >= c.threshold_value,
    }
  }
  return out
}

// =============================================================================
// Workout target classification
// =============================================================================

/**
 * Map a daily_workouts.focus_area string (or majority exercise.target) to a
 * normalized workout_target slug used in the catalog.
 */
const normalizeTarget = (raw) => {
  if (!raw) return null
  const t = String(raw).toLowerCase().trim()
  if (t.includes('ab') || t === 'core' || t === 'waist') return 'abs'
  if (t.includes('leg') || t.includes('quad') || t.includes('glute') || t.includes('hamstring') || t.includes('calve')) return 'legs'
  if (t.includes('full')) return 'full_body'
  if (t.includes('cardio') || t.includes('endurance') || t.includes('hiit')) return 'cardio'
  if (t.includes('chest') || t.includes('pec')) return 'chest'
  if (t.includes('back') || t.includes('lat')) return 'back'
  if (t.includes('arm') || t.includes('bicep') || t.includes('tricep') || t.includes('forearm')) return 'arms'
  if (t.includes('shoulder') || t.includes('delt') || t.includes('trap')) return 'shoulders'
  if (t.includes('mobility') || t.includes('stretch') || t.includes('yoga') || t.includes('flexibility')) return 'mobility'
  if (t.includes('upper')) return 'upper_body'
  return null
}

/**
 * Resolve the dominant target for a single workout completion.
 * Strategy:
 *   1. Use daily_workouts.focus_area when available.
 *   2. Otherwise tally exercises_completed by target and take the mode.
 */
const resolveWorkoutTarget = async (completion, dailyWorkoutFocusArea) => {
  const fromFocus = normalizeTarget(dailyWorkoutFocusArea)
  if (fromFocus) return fromFocus

  const exercises = Array.isArray(completion?.exercises_completed)
    ? completion.exercises_completed
    : []
  if (exercises.length === 0) return null

  const counts = {}
  for (const ex of exercises) {
    const t = normalizeTarget(ex?.target || ex?.body_part || ex?.bodyPart)
    if (t) counts[t] = (counts[t] || 0) + 1
  }
  let best = null
  let bestN = 0
  for (const [k, v] of Object.entries(counts)) {
    if (v > bestN) { best = k; bestN = v }
  }
  return best
}

/**
 * Fetch all completed workouts, sorted ASC, with normalized target attached.
 * Returns [{ id, completed_at, target }, ...]
 */
const fetchSortedWorkouts = async (userId) => {
  const { data, error } = await supabase
    .from('workout_completions')
    .select('id, completed_at, exercises_completed, daily_workouts(focus_area)')
    .eq('user_id', userId)
    .order('completed_at', { ascending: true })

  if (error) {
    console.error('❌ fetchSortedWorkouts:', error)
    return []
  }

  const out = []
  for (const row of data || []) {
    const focus = row?.daily_workouts?.focus_area
    const target = await resolveWorkoutTarget(row, focus)
    if (!target) continue
    out.push({ id: row.id, completed_at: row.completed_at, target })
  }
  return out
}

/**
 * Count completed workouts per normalized target.
 */
const tallyByTarget = (sortedWorkouts) => {
  const counts = {}
  for (const w of sortedWorkouts) {
    counts[w.target] = (counts[w.target] || 0) + 1
  }
  return counts
}

// Kept for backwards compatibility (used by getUserProgress path)
const getWorkoutCountsByTarget = async (userId) => {
  return tallyByTarget(await fetchSortedWorkouts(userId))
}

// =============================================================================
// Completion insertion (idempotent)
// =============================================================================

const toIntOrNull = (v) => {
  if (v === null || v === undefined) return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? n : null
}

const insertCompletion = async ({ userId, challengeId, finalValue, runId = null, workoutId = null }) => {
  const { error } = await supabase
    .from('user_challenge_completions')
    .insert({
      user_id: userId,
      challenge_id: challengeId,
      final_value: toIntOrNull(finalValue),
      trigger_run_id: runId,
      trigger_workout_id: workoutId,
    })

  if (error && error.code !== '23505') {
    // 23505 = unique violation → already completed, swallow
    console.error(`❌ insertCompletion ${challengeId}:`, error)
  }
}

// =============================================================================
// Evaluators
// =============================================================================

/**
 * Evaluate run-based challenges after a new run is saved.
 * Delegates to syncUserCompletions so attribution (completed_at, trigger_run_id)
 * always reflects the actual qualifying run — useful when a single save unlocks
 * challenges that were earned by older runs predating the feature.
 */
export const evaluateRunChallenges = async (userId, _run) => {
  await syncUserCompletions(userId)
}

/**
 * Evaluate workout-based challenges after a workout_completion is inserted.
 * Delegates to syncUserCompletions for accurate per-workout attribution.
 */
export const evaluateWorkoutChallenges = async (userId, _completion, _dailyWorkout = null) => {
  await syncUserCompletions(userId)
}

/**
 * Update user_streaks and evaluate streak-tier challenges.
 * activityDate is a JS Date or ISO string — we work in UTC calendar days.
 */
export const evaluateStreak = async (userId, activityDate) => {
  try {
    const today = toDateOnly(activityDate)

    const { data: existing } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    let current = 1
    let best = 1

    if (existing) {
      const last = existing.last_activity_date // 'YYYY-MM-DD'
      if (last === today) {
        // Same calendar day — no change
        current = existing.current_count
        best = existing.best_count
      } else if (isYesterday(last, today)) {
        current = existing.current_count + 1
        best = Math.max(existing.best_count, current)
      } else {
        // Gap — reset
        current = 1
        best = Math.max(existing.best_count, 1)
      }

      const { error: upErr } = await supabase
        .from('user_streaks')
        .update({
          current_count: current,
          best_count: best,
          last_activity_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
      if (upErr) throw upErr
    } else {
      const { error: insErr } = await supabase
        .from('user_streaks')
        .insert({
          user_id: userId,
          current_count: 1,
          best_count: 1,
          last_activity_date: today,
        })
      if (insErr) throw insErr
    }

    // syncUserCompletions handles the streak-tier inserts using the freshly-
    // written last_activity_date for accurate completed_at attribution.
    await syncUserCompletions(userId)
  } catch (err) {
    console.error('❌ evaluateStreak:', err)
  }
}

const toDateOnly = (dateLike) => {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now())
  // Use UTC date for consistency
  return d.toISOString().slice(0, 10)
}

const isYesterday = (lastIso, todayIso) => {
  if (!lastIso) return false
  const last = new Date(lastIso + 'T00:00:00Z').getTime()
  const today = new Date(todayIso + 'T00:00:00Z').getTime()
  const dayMs = 24 * 60 * 60 * 1000
  return today - last === dayMs
}

// =============================================================================
// Public reads — counts and completer lists
// =============================================================================

export const getCompletionCount = async (challengeId) => {
  const { count, error } = await supabase
    .from('user_challenge_completions')
    .select('*', { count: 'exact', head: true })
    .eq('challenge_id', challengeId)

  if (error) throw error
  return count || 0
}

/**
 * Paginated list of users who completed a challenge, newest first.
 * Returns { completers, nextCursor }
 */
export const getCompleters = async (challengeId, { cursor = null, limit = 30 } = {}) => {
  let query = supabase
    .from('user_challenge_completions')
    .select('user_id, completed_at, final_value, users(id, username, full_name, profile_photo_url)')
    .eq('challenge_id', challengeId)
    .order('completed_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) {
    query = query.lt('completed_at', cursor)
  }

  const { data, error } = await query
  if (error) throw error

  const rows = data || []
  const hasMore = rows.length > limit
  const slice = hasMore ? rows.slice(0, limit) : rows
  const completers = slice
    .filter(r => r.users) // drop rows whose user was deleted
    .map(r => ({
      id: r.users.id,
      username: r.users.username,
      full_name: r.users.full_name,
      profile_photo_url: r.users.profile_photo_url,
      completed_at: r.completed_at,
      final_value: r.final_value,
    }))

  return {
    completers,
    nextCursor: hasMore ? slice[slice.length - 1].completed_at : null,
  }
}

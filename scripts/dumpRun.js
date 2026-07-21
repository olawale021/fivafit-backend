// Dev tool: dump a run as RunReplay3D inputProps JSON.
// Usage: node scripts/dumpRun.js <runId> | tail -1 > props.json
// (tail -1 strips the supabase client's startup log lines from stdout)
// Requires backend .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// optionally MAPBOX_RENDER_TOKEN).
import dotenv from 'dotenv'
dotenv.config()

const { supabase } = await import('../src/config/supabase.js')

const runId = process.argv[2]
if (!runId) {
  console.error('Usage: node scripts/dumpRun.js <runId>')
  process.exit(1)
}

const { data: run, error } = await supabase
  .from('runs')
  .select('*')
  .eq('id', runId)
  .single()

if (error || !run) {
  console.error('Run not found:', error?.message)
  process.exit(1)
}

const props = {
  route: run.route_polyline ?? [],
  stats: {
    distanceMeters: run.distance_meters ?? 0,
    durationSeconds: run.duration_seconds ?? 0,
    avgPaceSecKm: run.avg_pace_sec_km ?? 0,
    elevationGainM: run.elevation_gain_m ?? 0,
    startedAt: run.started_at,
    activityType: run.activity_type ?? 'run',
  },
  mapboxToken: process.env.MAPBOX_RENDER_TOKEN ?? '',
}

console.log(JSON.stringify(props))

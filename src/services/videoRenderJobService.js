import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { supabase } from '../config/supabase.js'
import { sendPushNotification } from './pushNotificationService.js'
import { uploadRunVideo } from './storageService.js'

/**
 * Video Render Job Service
 * Async 3D run replay video rendering (Remotion + Mapbox in a child process).
 * Mirrors generationJobService's job/poll/push pattern, plus a strict FIFO
 * queue (concurrency 1) — renders are heavy, the instance is small.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RENDER_SCRIPT = path.resolve(__dirname, '../../scripts/renderReplay.js')
const BUNDLE_DIR = path.resolve(__dirname, '../../remotion-bundle')

const RENDER_TIMEOUT_MS = parseInt(process.env.VIDEO_RENDER_TIMEOUT_MS || '2700000', 10) // 45 min
const RENDER_SCALE = parseFloat(process.env.VIDEO_RENDER_SCALE || '0.6667') // 720×1280 default
const MIN_ROUTE_POINTS = 10

class VideoRenderJobService {
  constructor() {
    this.queue = []
    this.isRendering = false
  }

  isEnabled() {
    return (
      process.env.VIDEO_RENDER_ENABLED === 'true' &&
      !!process.env.MAPBOX_RENDER_TOKEN &&
      fs.existsSync(BUNDLE_DIR)
    )
  }

  /**
   * Create a render job for a run (or return the existing one — dedupe).
   * `run` must already be ownership-checked by the caller.
   */
  async createJob(userId, run) {
    // Dedupe: reuse latest completed job, or the active one
    const { data: existing } = await supabase
      .from('video_jobs')
      .select('*')
      .eq('run_id', run.id)
      .in('status', ['pending', 'processing', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)

    const latest = existing?.[0]
    if (latest && latest.status !== 'failed') {
      return { job: latest, created: false }
    }

    const { data: job, error } = await supabase
      .from('video_jobs')
      .insert({
        user_id: userId,
        run_id: run.id,
        status: 'pending',
        request_data: { distance_meters: run.distance_meters },
      })
      .select()
      .single()

    if (error) {
      // Unique partial index race: another active job beat us — return it
      if (error.code === '23505') {
        const { data: raced } = await supabase
          .from('video_jobs')
          .select('*')
          .eq('run_id', run.id)
          .in('status', ['pending', 'processing'])
          .limit(1)
        if (raced?.[0]) return { job: raced[0], created: false }
      }
      throw error
    }

    console.log(`🎬 Created video job ${job.id} for run ${run.id}`)
    this.enqueue(job.id)
    return { job, created: true }
  }

  enqueue(jobId) {
    this.queue.push(jobId)
    this.processNext()
  }

  async processNext() {
    if (this.isRendering) return
    const jobId = this.queue.shift()
    if (!jobId) return
    this.isRendering = true
    try {
      await this.processJob(jobId)
    } catch (err) {
      console.error(`❌ Video job ${jobId} crashed:`, err)
    } finally {
      this.isRendering = false
      this.processNext()
    }
  }

  queuePosition(jobId) {
    const idx = this.queue.indexOf(jobId)
    return idx === -1 ? null : idx + 1
  }

  async getJob(jobId, userId) {
    const { data: job, error } = await supabase
      .from('video_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single()

    if (error || !job) throw new Error('Job not found')

    return {
      id: job.id,
      run_id: job.run_id,
      status: job.status,
      progress: job.progress ?? 0,
      queuePosition: this.queuePosition(job.id),
      created_at: job.created_at,
      completed_at: job.completed_at,
      result_data: job.result_data,
      error_message: job.error_message,
    }
  }

  async processJob(jobId) {
    let job
    const specPath = path.join(os.tmpdir(), `replay-job-${jobId}.json`)
    const outputPath = path.join(os.tmpdir(), `replay-${jobId}.mp4`)

    try {
      const { data: fetched, error: fetchError } = await supabase
        .from('video_jobs')
        .select('*')
        .eq('id', jobId)
        .single()
      if (fetchError) throw fetchError
      job = fetched
      if (job.status !== 'pending') return // already handled (e.g. boot recovery raced)

      await supabase
        .from('video_jobs')
        .update({ status: 'processing', started_at: new Date().toISOString(), progress: 0 })
        .eq('id', jobId)

      const { data: run, error: runError } = await supabase
        .from('runs')
        .select('*')
        .eq('id', job.run_id)
        .single()
      if (runError || !run) throw new Error('Run not found for video job')
      const route = run.route_polyline ?? []
      if (route.length < MIN_ROUTE_POINTS) throw new Error('Route too short for video')

      console.log(`🎬 Rendering video job ${jobId} (run ${job.run_id}, ${route.length} pts)...`)

      const spec = {
        jobId,
        serveUrl: BUNDLE_DIR,
        compositionId: 'RunReplay3D',
        inputProps: {
          route,
          stats: {
            distanceMeters: run.distance_meters ?? 0,
            durationSeconds: run.duration_seconds ?? 0,
            avgPaceSecKm: run.avg_pace_sec_km ?? 0,
            elevationGainM: run.elevation_gain_m ?? 0,
            startedAt: run.started_at,
            activityType: run.activity_type ?? 'run',
          },
          mapboxToken: process.env.MAPBOX_RENDER_TOKEN,
        },
        outputPath,
        scale: RENDER_SCALE,
        timeoutInMilliseconds: 120000,
        crf: 23,
        x264Preset: 'veryfast',
        jpegQuality: 80,
      }
      fs.writeFileSync(specPath, JSON.stringify(spec))

      const result = await this.runRenderChild(jobId, specPath)

      const videoUrl = await uploadRunVideo(outputPath, job.user_id, job.run_id)
      if (!videoUrl) throw new Error('Video upload failed')

      const followS = Math.round((result.durationInFrames ?? 0) / 30)
      await supabase
        .from('video_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          progress: 100,
          result_data: {
            video_url: videoUrl,
            size_bytes: result.sizeBytes,
            width: result.width,
            height: result.height,
            duration_seconds: followS,
          },
        })
        .eq('id', jobId)

      console.log(`✅ Video job ${jobId} completed: ${videoUrl}`)
      await this.sendCompletionNotification(job.user_id, jobId, job.run_id)
    } catch (error) {
      console.error(`❌ Video job ${jobId} failed:`, error)
      await supabase
        .from('video_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error.message || 'Render failed',
        })
        .eq('id', jobId)
      if (job?.user_id) {
        await this.sendFailureNotification(job.user_id, jobId, job.run_id)
      }
    } finally {
      for (const f of [specPath, outputPath]) {
        try { fs.unlinkSync(f) } catch { /* already gone */ }
      }
    }
  }

  /**
   * Spawn the render child and stream its progress into the job row.
   * Resolves with the child's final result line; rejects on nonzero exit
   * or hard timeout (SIGKILL).
   */
  runRenderChild(jobId, specPath) {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [RENDER_SCRIPT, specPath], {
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=256' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let result = null
      let stderrTail = ''
      let stdoutBuf = ''

      const killTimer = setTimeout(() => {
        console.error(`⏱️ Video job ${jobId} exceeded ${RENDER_TIMEOUT_MS}ms — killing child`)
        child.kill('SIGKILL')
      }, RENDER_TIMEOUT_MS)

      child.stdout.on('data', (chunk) => {
        stdoutBuf += chunk.toString()
        let nl
        while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
          const line = stdoutBuf.slice(0, nl)
          stdoutBuf = stdoutBuf.slice(nl + 1)
          try {
            const msg = JSON.parse(line)
            if (msg.type === 'progress' && msg.totalFrames > 0) {
              const pct = Math.min(99, Math.round((msg.renderedFrames / msg.totalFrames) * 100))
              supabase
                .from('video_jobs')
                .update({ progress: pct })
                .eq('id', jobId)
                .then(() => {})
            } else if (msg.type === 'result') {
              result = msg
            }
          } catch { /* non-JSON noise on stdout */ }
        }
      })

      child.stderr.on('data', (chunk) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-2000)
      })

      child.on('error', (err) => {
        clearTimeout(killTimer)
        reject(err)
      })

      child.on('close', (code, signal) => {
        clearTimeout(killTimer)
        if (code === 0 && result) {
          resolve(result)
        } else if (signal === 'SIGKILL') {
          reject(new Error('Render timed out'))
        } else {
          reject(new Error(`Render process exited ${code ?? signal}: ${stderrTail.trim().split('\n').pop() || 'unknown error'}`))
        }
      })
    })
  }

  /**
   * On boot: fail jobs orphaned mid-render by a restart, re-enqueue pending.
   */
  async recoverOnBoot() {
    try {
      await supabase
        .from('video_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: 'Server restarted during render',
        })
        .eq('status', 'processing')

      const { data: pending } = await supabase
        .from('video_jobs')
        .select('id')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      for (const row of pending ?? []) {
        this.enqueue(row.id)
      }
      if (pending?.length) {
        console.log(`🎬 Re-enqueued ${pending.length} pending video job(s) after boot`)
      }
    } catch (error) {
      console.error('Error recovering video jobs on boot:', error)
    }
  }

  async cleanupOldJobs(daysOld = 7) {
    try {
      const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('video_jobs')
        .delete()
        .lt('created_at', cutoff)
        .in('status', ['completed', 'failed'])
        .select('id')
      if (error) throw error
      if (data?.length) console.log(`🧹 Cleaned up ${data.length} old video job(s)`)
    } catch (error) {
      console.error('Error cleaning up video jobs:', error)
    }
  }

  async sendCompletionNotification(userId, jobId, runId) {
    try {
      await sendPushNotification(userId, {
        title: 'Your 3D Run Replay is ready! 🎬',
        body: 'Your flyover video has been rendered. Tap to watch and share it.',
        data: {
          type: 'replay_video_complete',
          job_id: jobId,
          run_id: runId,
          screen: `run/${runId}`,
        },
        channelId: 'workout-notifications',
      })
      await supabase
        .from('video_jobs')
        .update({ notification_sent: true })
        .eq('id', jobId)
      console.log(`📲 Sent video-ready notification for job ${jobId}`)
    } catch (error) {
      console.error('Error sending video completion notification:', error)
    }
  }

  async sendFailureNotification(userId, jobId, runId) {
    try {
      await sendPushNotification(userId, {
        title: 'Video render failed',
        body: "We couldn't render your run replay. Open the run to try again.",
        data: {
          type: 'replay_video_failed',
          job_id: jobId,
          run_id: runId,
          screen: `run/${runId}`,
        },
        channelId: 'workout-notifications',
      })
    } catch (error) {
      console.error('Error sending video failure notification:', error)
    }
  }
}

export const videoRenderJobService = new VideoRenderJobService()

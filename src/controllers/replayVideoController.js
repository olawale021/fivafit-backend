import { getRunById } from '../services/runService.js'
import { videoRenderJobService } from '../services/videoRenderJobService.js'

const MIN_ROUTE_POINTS = 10

/**
 * POST /api/runs/:id/replay-video
 * Request a 3D replay video render for a run (dedupes per run).
 */
export const createReplayVideo = async (req, res) => {
  try {
    if (!videoRenderJobService.isEnabled()) {
      return res.status(503).json({
        success: false,
        error: 'Video rendering is not available right now'
      })
    }

    let run
    try {
      run = await getRunById(req.params.id, req.user.id)
    } catch {
      return res.status(404).json({ success: false, error: 'Run not found' })
    }

    const route = run.route_polyline ?? []
    if (!Array.isArray(route) || route.length < MIN_ROUTE_POINTS) {
      return res.status(422).json({
        success: false,
        error: 'This run has no GPS route to render'
      })
    }

    const { job } = await videoRenderJobService.createJob(req.user.id, run)

    res.json({
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        progress: job.progress ?? 0,
        videoUrl: job.result_data?.video_url ?? null,
        queuePosition: videoRenderJobService.queuePosition(job.id)
      }
    })
  } catch (error) {
    console.error('Error creating replay video job:', error)
    res.status(500).json({ success: false, error: 'Failed to create video job' })
  }
}

/**
 * GET /api/runs/replay-video/jobs/:jobId
 * Poll a replay video render job.
 */
export const getReplayVideoJob = async (req, res) => {
  try {
    const job = await videoRenderJobService.getJob(req.params.jobId, req.user.id)
    res.json({ success: true, data: job })
  } catch {
    res.status(404).json({ success: false, error: 'Job not found' })
  }
}

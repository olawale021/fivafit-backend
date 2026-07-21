// Child render process for 3D run replay videos.
// Runs in its own process so a Chromium OOM kills this, not the API server.
//
// Usage: node scripts/renderReplay.js <specFile.json>
// Spec: { jobId, serveUrl, compositionId, inputProps, outputPath,
//         scale, timeoutInMilliseconds, crf, x264Preset, jpegQuality }
//
// stdout protocol (line-delimited JSON):
//   {"type":"progress","renderedFrames":n,"totalFrames":m}
//   {"type":"result","outputPath":"...","sizeBytes":N,"width":W,"height":H,"durationInFrames":F}
// Exit 0 = success. Nonzero = failure, message on stderr.
import fs from 'fs'
import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer'

const specFile = process.argv[2]
if (!specFile) {
  console.error('Usage: node scripts/renderReplay.js <specFile.json>')
  process.exit(1)
}

const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'))
const {
  serveUrl,
  compositionId,
  inputProps,
  outputPath,
  scale = 1,
  timeoutInMilliseconds = 120000,
  crf = 23,
  x264Preset = 'veryfast',
  jpegQuality = 80,
  frameRange = null, // e.g. [0, 60] — testing only
} = spec

try {
  await ensureBrowser()

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
    timeoutInMilliseconds,
    // SwiftShader: Mapbox GL needs WebGL and the server has no GPU
    chromiumOptions: { gl: 'swangle' },
  })

  let lastReported = -1
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    concurrency: 1,
    scale,
    crf,
    x264Preset,
    jpegQuality,
    timeoutInMilliseconds,
    chromiumOptions: { gl: 'swangle' },
    ...(frameRange ? { frameRange } : {}),
    onProgress: ({ renderedFrames }) => {
      // Throttle to ~5% steps to keep stdout parsing cheap
      const pct = Math.floor((renderedFrames / composition.durationInFrames) * 20)
      if (pct > lastReported) {
        lastReported = pct
        process.stdout.write(
          JSON.stringify({
            type: 'progress',
            renderedFrames,
            totalFrames: composition.durationInFrames,
          }) + '\n'
        )
      }
    },
  })

  const { size } = fs.statSync(outputPath)
  process.stdout.write(
    JSON.stringify({
      type: 'result',
      outputPath,
      sizeBytes: size,
      width: Math.round(composition.width * scale),
      height: Math.round(composition.height * scale),
      durationInFrames: composition.durationInFrames,
    }) + '\n'
  )
  process.exit(0)
} catch (error) {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
}

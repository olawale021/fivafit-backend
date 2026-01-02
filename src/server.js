import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import session from 'express-session'
import passport from 'passport'
import { supabase } from './config/supabase.js'
import { startCronJobs, stopCronJobs } from './services/cronService.js'
import { startAffirmationCronJobs } from './services/affirmationCronService.js'
import authRoutes from './routes/auth.js'
import aiRoutes from './routes/ai.js'
import scanHistoryRoutes from './routes/scanHistory.js'
import exerciseRoutes from './routes/exerciseRoutes.js'
import workoutPlannerRoutes from './routes/workoutPlanner.js'
import postsRoutes from './routes/posts.js'
import usersRoutes from './routes/users.js'
import notificationsRoutes from './routes/notifications.js'
import challengesRoutes from './routes/challenges.js'
import groupsRoutes from './routes/groups.js'
import savedWorkoutsRoutes from './routes/savedWorkouts.js'
import progressRoutes from './routes/progress.js'
import userActivityRoutes from './routes/userActivity.js'
import affirmationsRoutes from './routes/affirmations.js'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:8081',
    'exp://localhost:8081',
    // Add your Expo development URLs here
    'exp://192.168.1.100:8081', // Replace with your local IP
  ],
  credentials: true,
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Session configuration for Passport
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}))

// Initialize Passport
app.use(passport.initialize())
app.use(passport.session())

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString()
  console.log(`📝 [${timestamp}] ${req.method} ${req.url}`)

  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📦 Request body:`, req.body)
  }

  next()
})

// Health check endpoint
app.get('/', (req, res) => {
  console.log('🏥 Health check endpoint accessed')
  res.json({
    message: 'STEPMODE Backend API is running! 🚀',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

// Test Supabase connection endpoint
app.get('/api/health/supabase', async (req, res) => {
  try {
    console.log('🔍 Testing Supabase connection...')

    // Test the connection by checking if Supabase client is configured
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1
    })

    if (error) {
      console.error('❌ Supabase connection test failed:', error.message)
      return res.status(500).json({
        status: 'error',
        message: 'Supabase connection failed',
        error: error.message
      })
    }

    console.log('✅ Supabase connection test successful!')
    res.json({
      status: 'healthy',
      message: 'Supabase connection successful',
      timestamp: new Date().toISOString(),
      supabase_url: process.env.SUPABASE_URL
    })
  } catch (error) {
    console.error('❌ Supabase health check error:', error)
    res.status(500).json({
      status: 'error',
      message: 'Supabase health check failed',
      error: error.message
    })
  }
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/scan-history', scanHistoryRoutes)
app.use('/api/exercises', exerciseRoutes)
app.use('/api/workout-planner', workoutPlannerRoutes)
app.use('/api/posts', postsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/challenges', challengesRoutes)
app.use('/api/groups', groupsRoutes)
app.use('/api/saved-workouts', savedWorkoutsRoutes)
app.use('/api/progress', progressRoutes)
app.use('/api/user-activity', userActivityRoutes)
app.use('/api/affirmations', affirmationsRoutes)

// 404 handler
app.use('*', (req, res) => {
  console.log(`❓ 404 - Route not found: ${req.method} ${req.originalUrl}`)
  res.status(404).json({
    error: 'Route not found',
    message: `The route ${req.method} ${req.originalUrl} does not exist`,
    availableRoutes: [
      'GET /',
      'GET /api/health/supabase',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/auth/google',
      'POST /api/auth/setup-username',
      'GET /api/auth/profile',
      'PUT /api/auth/profile',
      'POST /api/auth/verify',
      'POST /api/auth/refresh'
    ]
  })
})

// Global error handler
app.use((error, req, res, next) => {
  console.error('🚨 Unhandled error:', error)
  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong on the server',
    timestamp: new Date().toISOString()
  })
})

// Start the server
app.listen(PORT, () => {
  console.log('\n🚀 ======================================')
  console.log('🚀      StepFit Backend Server Started')
  console.log('🚀 ======================================')
  console.log(`📍 Server running on: http://localhost:${PORT}`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)

  // Test Supabase connection on startup
  console.log('🔍 Testing initial Supabase connection...')
  supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1
  })
    .then(({ data, error }) => {
      if (error) {
        console.error('❌ Initial Supabase connection failed:', error.message)
        console.error('⚠️  Please check your environment variables')
      } else {
        console.log('✅ Initial Supabase connection successful!')
      }
    })
    .catch(err => {
      console.error('❌ Supabase connection error:', err.message)
    })

  // Start cron jobs for workout notifications (Phase 1 & 2 active)
  // Set to 'phase1', 'phase2', 'phase3', or 'all'
  // For development, you might want to skip cron jobs
  if (process.env.NODE_ENV !== 'development' || process.env.ENABLE_CRON_JOBS === 'true') {
    // Using 'all' to enable Phase 1 & Phase 2 cron jobs
    // Phase 3 cron jobs are placeholders and will log warnings
    startCronJobs('all')

    // Start affirmation cron jobs (daily 10am & 9pm, re-engagement every 6 hours)
    startAffirmationCronJobs()
  } else {
    console.log('⏸️  Cron jobs disabled in development mode')
    console.log('   Set ENABLE_CRON_JOBS=true in .env to enable them')
  }
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT. Shutting down gracefully...')
  stopCronJobs()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM. Shutting down gracefully...')
  stopCronJobs()
  process.exit(0)
})
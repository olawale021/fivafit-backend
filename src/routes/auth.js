import express from 'express'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import multer from 'multer'
import { authenticateJWT } from '../middleware/customAuth.js'
import { handleGoogleOAuth } from '../services/authService.js'
import { findUserById } from '../services/userService.js'
import {
  register,
  login,
  googleCallback,
  appleSignIn,
  handleSetupUsername,
  getProfile,
  updateProfile,
  uploadProfilePhoto,
  getOnboardingStatus,
  verifyToken,
  refreshToken,
  checkUsername,
  changePassword,
  deleteAccount,
  forgotPassword,
  resetPassword
} from '../controllers/authController.js'
import {
  getEulaStatus,
  acceptEulaHandler,
  getEulaVersion
} from '../controllers/eulaController.js'
import { filterProfileContent, filterUsernameContent } from '../middleware/contentFilter.js'

// Configure multer for memory storage
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false)
    }
    cb(null, true)
  }
})

const router = express.Router()

// Configure Passport Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = await handleGoogleOAuth(profile)
    return done(null, user)
  } catch (error) {
    return done(error, null)
  }
}))

passport.serializeUser((user, done) => {
  done(null, user.id)
})

passport.deserializeUser(async (id, done) => {
  try {
    const user = await findUserById(id)
    done(null, user)
  } catch (error) {
    done(error, null)
  }
})

/**
 * POST /api/auth/register
 * Register a new user with username/email and password
 */
router.post('/register', register)

/**
 * POST /api/auth/login
 * Login with username/email and password
 */
router.post('/login', login)

/**
 * GET /api/auth/google
 * Initiate Google OAuth
 */
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}))

/**
 * GET /api/auth/google/callback
 * Google OAuth callback
 */
router.get('/google/callback',
  passport.authenticate('google', { session: false }),
  googleCallback
)

/**
 * POST /api/auth/apple
 * Apple Sign-In
 */
router.post('/apple', appleSignIn)

/**
 * POST /api/auth/setup-username
 * Set up username for Google users (with content filtering)
 */
router.post('/setup-username', authenticateJWT, filterUsernameContent, handleSetupUsername)

/**
 * GET /api/auth/profile
 * Get current user profile (requires authentication)
 */
router.get('/profile', authenticateJWT, getProfile)

/**
 * PUT /api/auth/profile
 * Update user profile (with content filtering)
 */
router.put('/profile', authenticateJWT, filterProfileContent, updateProfile)

/**
 * POST /api/auth/upload-profile-photo
 * Upload profile photo
 */
router.post('/upload-profile-photo', authenticateJWT, upload.single('photo'), uploadProfilePhoto)

/**
 * GET /api/auth/onboarding-status
 * Check if user has completed onboarding
 */
router.get('/onboarding-status', authenticateJWT, getOnboardingStatus)

/**
 * POST /api/auth/verify
 * Verify if a JWT token is valid
 */
router.post('/verify', verifyToken)

/**
 * POST /api/auth/refresh
 * Refresh an access token (handled by Supabase client-side usually)
 */
router.post('/refresh', refreshToken)

/**
 * POST /api/auth/check-username
 * Check if a username is available
 */
router.post('/check-username', checkUsername)

/**
 * PUT /api/auth/change-password
 * Change user password (requires authentication)
 */
router.put('/change-password', authenticateJWT, changePassword)

/**
 * DELETE /api/auth/delete-account
 * Delete user account permanently (requires authentication)
 */
router.delete('/delete-account', authenticateJWT, deleteAccount)

/**
 * POST /api/auth/forgot-password
 * Send password reset email
 */
router.post('/forgot-password', forgotPassword)

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', resetPassword)

/**
 * GET /api/auth/eula-status
 * Check if user has accepted the current EULA (requires authentication)
 */
router.get('/eula-status', authenticateJWT, getEulaStatus)

/**
 * POST /api/auth/accept-eula
 * Accept the EULA/Terms of Service (requires authentication)
 */
router.post('/accept-eula', authenticateJWT, acceptEulaHandler)

/**
 * GET /api/auth/eula-version
 * Get the current EULA version (public)
 */
router.get('/eula-version', getEulaVersion)

export default router
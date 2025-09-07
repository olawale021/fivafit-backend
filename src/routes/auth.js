import express from 'express'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { supabase } from '../config/supabase.js'
import { authenticateToken } from '../middleware/auth.js'
import { authenticateJWT } from '../middleware/customAuth.js'
import { generateJWT } from '../utils/auth.js'
import {
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserById,
  findUserByGoogleId,
  updateUser,
  updateLastLogin,
  verifyPassword,
  checkUsernameAvailability,
  checkEmailAvailability
} from '../services/userService.js'

const router = express.Router()

// Configure Passport Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await findUserByGoogleId(profile.id)
    
    if (!user) {
      user = await findUserByEmail(profile.emails[0].value)
      
      if (user) {
        user = await updateUser(user.id, { google_id: profile.id })
      } else {
        user = await createUser({
          google_id: profile.id,
          email: profile.emails[0].value,
          full_name: profile.displayName,
          profile_photo_url: profile.photos[0]?.value,
        })
      }
    }
    
    await updateLastLogin(user.id)
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
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, full_name } = req.body

    if (!username || !email || !password || !full_name) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Username, email, password, and full name are required'
      })
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password too short',
        message: 'Password must be at least 8 characters long'
      })
    }

    const isUsernameAvailable = await checkUsernameAvailability(username)
    if (!isUsernameAvailable) {
      return res.status(409).json({
        error: 'Username taken',
        message: 'This username is already taken'
      })
    }

    const isEmailAvailable = await checkEmailAvailability(email)
    if (!isEmailAvailable) {
      return res.status(409).json({
        error: 'Email taken',
        message: 'This email is already registered'
      })
    }

    const user = await createUser({
      username,
      email,
      password,
      full_name
    })

    const token = generateJWT({ userId: user.id, email: user.email })

    const userResponse = {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      profile_photo_url: user.profile_photo_url,
      created_at: user.created_at
    }

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: userResponse
    })

    console.log(`✅ User registered: ${user.email}`)
  } catch (error) {
    console.error('❌ Registration error:', error)
    res.status(500).json({
      error: 'Registration failed',
      message: 'Internal server error during registration'
    })
  }
})

/**
 * POST /api/auth/login
 * Login with username/email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Username/email and password are required'
      })
    }

    let user = await findUserByUsername(username)
    if (!user) {
      user = await findUserByEmail(username)
    }

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username/email or password is incorrect'
      })
    }

    if (!user.password_hash) {
      return res.status(401).json({
        error: 'No password set',
        message: 'This account was created with Google. Please sign in with Google or contact support.'
      })
    }

    const isPasswordValid = await verifyPassword(password, user.password_hash)
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username/email or password is incorrect'
      })
    }

    await updateLastLogin(user.id)

    const token = generateJWT({ userId: user.id, email: user.email })

    const userResponse = {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      profile_photo_url: user.profile_photo_url,
      bio: user.bio,
      created_at: user.created_at
    }

    res.json({
      message: 'Login successful',
      token,
      user: userResponse
    })

    console.log(`✅ User logged in: ${user.email}`)
  } catch (error) {
    console.error('❌ Login error:', error)
    res.status(500).json({
      error: 'Login failed',
      message: 'Internal server error during login'
    })
  }
})

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
  async (req, res) => {
    try {
      const user = req.user
      const token = generateJWT({ userId: user.id, email: user.email })

      // Check if request is from mobile app
      const userAgent = req.headers['user-agent'] || '';
      const isMobileRequest = req.query.mobile === 'true' || 
                              userAgent.includes('Expo') ||
                              userAgent.includes('Mobile') ||
                              userAgent.includes('Android') ||
                              userAgent.includes('iPhone');
      
      const redirectUrl = isMobileRequest 
        ? `exp://192.168.1.102:8083/--/auth/callback?token=${token}&needsUsername=${!user.username}`
        : `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/success?token=${token}&needsUsername=${!user.username}`
      
      
      res.redirect(redirectUrl)
      console.log(`✅ Google OAuth successful: ${user.email}`)
    } catch (error) {
      console.error('❌ Google OAuth callback error:', error)
      const userAgent = req.headers['user-agent'] || '';
      const isMobileRequest = req.query.mobile === 'true' || 
                              userAgent.includes('Expo') ||
                              userAgent.includes('Mobile') ||
                              userAgent.includes('Android') ||
                              userAgent.includes('iPhone');
      const errorUrl = isMobileRequest
        ? `exp://192.168.1.102:8083/--/step3`
        : `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error`
      res.redirect(errorUrl)
    }
  }
)

/**
 * POST /api/auth/setup-username
 * Set up username for Google users
 */
router.post('/setup-username', authenticateJWT, async (req, res) => {
  try {
    const { username } = req.body
    const user = req.user

    if (!username) {
      return res.status(400).json({
        error: 'Username required',
        message: 'Please provide a username'
      })
    }

    if (user.username) {
      return res.status(400).json({
        error: 'Username already set',
        message: 'This user already has a username'
      })
    }

    const isUsernameAvailable = await checkUsernameAvailability(username)
    if (!isUsernameAvailable) {
      return res.status(409).json({
        error: 'Username taken',
        message: 'This username is already taken'
      })
    }

    const updatedUser = await updateUser(user.id, { username })

    const userResponse = {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      full_name: updatedUser.full_name,
      profile_photo_url: updatedUser.profile_photo_url,
      bio: updatedUser.bio,
      created_at: updatedUser.created_at
    }

    res.json({
      message: 'Username set successfully',
      user: userResponse
    })

    console.log(`✅ Username set for user: ${updatedUser.email} -> @${username}`)
  } catch (error) {
    console.error('❌ Setup username error:', error)
    res.status(500).json({
      error: 'Setup failed',
      message: 'Internal server error during username setup'
    })
  }
})

/**
 * GET /api/auth/profile
 * Get current user profile (requires authentication)
 */
router.get('/profile', authenticateJWT, async (req, res) => {
  try {
    const user = req.user

    const userResponse = {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      profile_photo_url: user.profile_photo_url,
      bio: user.bio,
      date_of_birth: user.date_of_birth,
      gender: user.gender,
      height_cm: user.height_cm,
      weight_kg: user.weight_kg,
      target_weight_kg: user.target_weight_kg,
      fitness_goal: user.fitness_goal,
      daily_step_goal: user.daily_step_goal,
      daily_calorie_goal: user.daily_calorie_goal,
      privacy_level: user.privacy_level,
      created_at: user.created_at,
      last_login: user.last_login
    }

    res.json({
      user: userResponse
    })

    console.log(`✅ Profile accessed by: ${user.email}`)
  } catch (error) {
    console.error('❌ Profile fetch error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Internal server error while fetching profile'
    })
  }
})

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authenticateJWT, async (req, res) => {
  try {
    const user = req.user
    const allowedUpdates = [
      'full_name', 'bio', 'date_of_birth', 'gender', 
      'height_cm', 'weight_kg', 'target_weight_kg', 'fitness_goal',
      'daily_step_goal', 'daily_calorie_goal', 'privacy_level'
    ]

    const updates = {}
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key]
      }
    })

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid updates provided',
        message: 'Please provide valid fields to update'
      })
    }

    // Validation for onboarding profile data
    if (updates.gender && !['male', 'female'].includes(updates.gender)) {
      return res.status(400).json({
        error: 'Invalid gender',
        message: 'Gender must be either "male" or "female"'
      })
    }

    if (updates.date_of_birth) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(updates.date_of_birth)) {
        return res.status(400).json({
          error: 'Invalid date format',
          message: 'Date of birth must be in YYYY-MM-DD format'
        })
      }
    }

    if (updates.height_cm && (updates.height_cm < 50 || updates.height_cm > 300)) {
      return res.status(400).json({
        error: 'Invalid height',
        message: 'Height must be between 50-300 cm'
      })
    }

    if (updates.weight_kg && (updates.weight_kg < 20 || updates.weight_kg > 500)) {
      return res.status(400).json({
        error: 'Invalid weight',
        message: 'Weight must be between 20-500 kg'
      })
    }

    if (updates.fitness_goal) {
      const validGoals = ['lose_weight', 'gain_muscle', 'improve_endurance', 'general_fitness']
      const goals = updates.fitness_goal.split(',')
      const invalidGoals = goals.filter(goal => !validGoals.includes(goal.trim()))
      if (invalidGoals.length > 0) {
        return res.status(400).json({
          error: 'Invalid fitness goals',
          message: `Invalid goals: ${invalidGoals.join(', ')}. Valid goals are: ${validGoals.join(', ')}`
        })
      }
    }

    const updatedUser = await updateUser(user.id, updates)

    const userResponse = {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      full_name: updatedUser.full_name,
      profile_photo_url: updatedUser.profile_photo_url,
      bio: updatedUser.bio,
      date_of_birth: updatedUser.date_of_birth,
      gender: updatedUser.gender,
      height_cm: updatedUser.height_cm,
      weight_kg: updatedUser.weight_kg,
      target_weight_kg: updatedUser.target_weight_kg,
      fitness_goal: updatedUser.fitness_goal,
      daily_step_goal: updatedUser.daily_step_goal,
      daily_calorie_goal: updatedUser.daily_calorie_goal,
      privacy_level: updatedUser.privacy_level,
      created_at: updatedUser.created_at,
      updated_at: updatedUser.updated_at
    }

    res.json({
      message: 'Profile updated successfully',
      user: userResponse
    })

    // Log onboarding completion if user is setting up profile for first time
    const isOnboardingComplete = updates.gender && updates.date_of_birth && 
                                updates.height_cm && updates.weight_kg && updates.fitness_goal
    
    if (isOnboardingComplete) {
      console.log(`🎉 Onboarding completed for: ${updatedUser.email}`)
      console.log(`   - Gender: ${updatedUser.gender}`)
      console.log(`   - Age: ${new Date().getFullYear() - new Date(updatedUser.date_of_birth).getFullYear()} years`)
      console.log(`   - Height: ${updatedUser.height_cm}cm, Weight: ${updatedUser.weight_kg}kg`)
      console.log(`   - Goals: ${updatedUser.fitness_goal}`)
    } else {
      console.log(`✅ Profile updated for: ${updatedUser.email}`)
    }
  } catch (error) {
    console.error('❌ Profile update error:', error)
    res.status(500).json({
      error: 'Update failed',
      message: 'Internal server error during profile update'
    })
  }
})

/**
 * GET /api/auth/onboarding-status
 * Check if user has completed onboarding
 */
router.get('/onboarding-status', authenticateJWT, async (req, res) => {
  try {
    const user = req.user

    const isOnboardingComplete = !!(user.username && user.gender && user.date_of_birth && 
                                   user.height_cm && user.weight_kg && user.fitness_goal)

    const missingFields = []
    if (!user.username) missingFields.push('username')
    if (!user.gender) missingFields.push('gender')
    if (!user.date_of_birth) missingFields.push('date_of_birth')
    if (!user.height_cm) missingFields.push('height_cm')
    if (!user.weight_kg) missingFields.push('weight_kg')
    if (!user.fitness_goal) missingFields.push('fitness_goal')

    res.json({
      isComplete: isOnboardingComplete,
      missingFields,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        hasBasicProfile: !!(user.gender && user.date_of_birth),
        hasPhysicalProfile: !!(user.height_cm && user.weight_kg),
        hasGoals: !!user.fitness_goal
      }
    })

    console.log(`🔍 Onboarding status checked for: ${user.email} - Complete: ${isOnboardingComplete}`)
  } catch (error) {
    console.error('❌ Onboarding status error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Internal server error while checking onboarding status'
    })
  }
})

/**
 * POST /api/auth/verify
 * Verify if a JWT token is valid
 */
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body

    if (!token) {
      return res.status(400).json({
        error: 'Token required',
        message: 'Please provide a token to verify'
      })
    }

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error) {
      return res.status(401).json({
        error: 'Invalid token',
        message: error.message
      })
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at,
        created_at: user.created_at
      }
    })

    console.log(`✅ Supabase token verified for user: ${user.email}`)
  } catch (error) {
    console.error('❌ Token verification error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Internal server error during token verification'
    })
  }
})

/**
 * POST /api/auth/refresh
 * Refresh an access token (handled by Supabase client-side usually)
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body

    if (!refresh_token) {
      return res.status(400).json({
        error: 'Refresh token required',
        message: 'Please provide a refresh token'
      })
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    })

    if (error) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: error.message
      })
    }

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at
    })

    console.log(`✅ Supabase token refreshed for user: ${data.user?.email}`)
  } catch (error) {
    console.error('❌ Token refresh error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Internal server error during token refresh'
    })
  }
})

export default router
import { supabase } from '../config/supabase.js'
import { generateJWT } from '../utils/auth.js'
import {
  validateRegistrationData,
  validateProfileUpdateData,
  registerUser,
  loginUser,
  setupUsername,
  updateUserProfile,
  checkOnboardingStatus,
  isOnboardingUpdate,
  formatUserResponse
} from '../services/authService.js'

/**
 * Auth Controller
 * Handles authentication HTTP requests
 */

/**
 * POST /api/auth/register
 * Register a new user with username/email and password
 */
export async function register(req, res) {
  try {
    const { username, email, password, full_name } = req.body

    // Validate input
    const validationErrors = validateRegistrationData(username, email, password, full_name)
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        message: validationErrors[0].message,
        errors: validationErrors
      })
    }

    // Register user
    const { user, token } = await registerUser({ username, email, password, full_name })

    const userResponse = formatUserResponse(user)

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: userResponse,
        token
      }
    })

    console.log(`✅ User registered: ${user.email}`)
  } catch (error) {
    console.error('❌ Registration error:', error)

    if (error.message === 'USERNAME_TAKEN') {
      return res.status(409).json({
        error: 'Username taken',
        message: 'This username is already taken'
      })
    }

    if (error.message === 'EMAIL_TAKEN') {
      return res.status(409).json({
        error: 'Email taken',
        message: 'This email is already registered'
      })
    }

    res.status(500).json({
      error: 'Registration failed',
      message: 'Internal server error during registration'
    })
  }
}

/**
 * POST /api/auth/login
 * Login with username/email and password
 */
export async function login(req, res) {
  try {
    const { username, identifier, password } = req.body
    const loginIdentifier = identifier || username

    // Validate input
    if (!loginIdentifier || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Username/email and password are required'
      })
    }

    // Login user
    const { user, token } = await loginUser(loginIdentifier, password)

    const userResponse = formatUserResponse(user, true)

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userResponse,
        token
      }
    })

    console.log(`✅ User logged in: ${user.email}`)
  } catch (error) {
    console.error('❌ Login error:', error)

    if (error.message === 'INVALID_CREDENTIALS') {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Username/email or password is incorrect'
      })
    }

    if (error.message === 'NO_PASSWORD') {
      return res.status(401).json({
        error: 'No password set',
        message: 'This account was created with Google. Please sign in with Google or contact support.'
      })
    }

    res.status(500).json({
      error: 'Login failed',
      message: 'Internal server error during login'
    })
  }
}

/**
 * GET /api/auth/google/callback
 * Handle Google OAuth callback
 */
export async function googleCallback(req, res) {
  try {
    const user = req.user
    const token = generateJWT({ userId: user.id, email: user.email })

    // Check if request is from mobile app
    const userAgent = req.headers['user-agent'] || ''
    const isMobileRequest = req.query.mobile === 'true' ||
                            userAgent.includes('Expo') ||
                            userAgent.includes('Mobile') ||
                            userAgent.includes('Android') ||
                            userAgent.includes('iPhone')

    const redirectUrl = isMobileRequest
      ? `${process.env.MOBILE_SUCCESS_URL || 'exp://192.168.1.185:8082/--/auth/callback'}?token=${token}&needsUsername=${!user.username}`
      : `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/success?token=${token}&needsUsername=${!user.username}`

    res.redirect(redirectUrl)
    console.log(`✅ Google OAuth successful: ${user.email}`)
  } catch (error) {
    console.error('❌ Google OAuth callback error:', error)
    const userAgent = req.headers['user-agent'] || ''
    const isMobileRequest = req.query.mobile === 'true' ||
                            userAgent.includes('Expo') ||
                            userAgent.includes('Mobile') ||
                            userAgent.includes('Android') ||
                            userAgent.includes('iPhone')
    const errorUrl = isMobileRequest
      ? `${process.env.MOBILE_ERROR_URL || 'exp://192.168.1.185:8082/--/step3'}`
      : `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error`
    res.redirect(errorUrl)
  }
}

/**
 * POST /api/auth/setup-username
 * Set up username for Google users
 */
export async function handleSetupUsername(req, res) {
  try {
    const { username } = req.body
    const user = req.user

    // Validate input
    if (!username) {
      return res.status(400).json({
        error: 'Username required',
        message: 'Please provide a username'
      })
    }

    // Setup username
    const updatedUser = await setupUsername(user.id, username, user)

    const userResponse = formatUserResponse(updatedUser, true)

    res.json({
      message: 'Username set successfully',
      user: userResponse
    })

    console.log(`✅ Username set for user: ${updatedUser.email} -> @${username}`)
  } catch (error) {
    console.error('❌ Setup username error:', error)

    if (error.message === 'USERNAME_ALREADY_SET') {
      return res.status(400).json({
        error: 'Username already set',
        message: 'This user already has a username'
      })
    }

    if (error.message === 'USERNAME_TAKEN') {
      return res.status(409).json({
        error: 'Username taken',
        message: 'This username is already taken'
      })
    }

    res.status(500).json({
      error: 'Setup failed',
      message: 'Internal server error during username setup'
    })
  }
}

/**
 * GET /api/auth/profile
 * Get current user profile
 */
export async function getProfile(req, res) {
  try {
    const user = req.user
    const userResponse = formatUserResponse(user, true)

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
}

/**
 * POST /api/auth/upload-profile-photo
 * Upload profile photo to Supabase Storage
 */
export async function uploadProfilePhoto(req, res) {
  try {
    const user = req.user

    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide a photo file'
      })
    }

    const file = req.file
    const fileExt = file.originalname.split('.').pop()
    const fileName = `${user.id}-${Date.now()}.${fileExt}`
    const filePath = `profile-photos/${fileName}`

    // Upload to Supabase Storage
    const { data, error} = await supabase.storage
      .from('profile-photos')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      })

    if (error) {
      console.error('❌ Supabase storage error:', error)
      return res.status(500).json({
        error: 'Upload failed',
        message: 'Failed to upload photo to storage'
      })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('profile-photos')
      .getPublicUrl(filePath)

    const photoUrl = urlData.publicUrl

    // Update user profile with photo URL
    const { data: updateData, error: updateError } = await supabase
      .from('users')
      .update({ profile_photo_url: photoUrl })
      .eq('id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('❌ Profile update error:', updateError)
      return res.status(500).json({
        error: 'Update failed',
        message: 'Failed to update profile with photo URL'
      })
    }

    res.json({
      success: true,
      message: 'Profile photo uploaded successfully',
      data: {
        profile_photo_url: photoUrl
      }
    })

    console.log(`✅ Profile photo uploaded for: ${user.email}`)
  } catch (error) {
    console.error('❌ Upload profile photo error:', error)
    res.status(500).json({
      error: 'Upload failed',
      message: 'Internal server error during photo upload'
    })
  }
}

/**
 * PUT /api/auth/profile
 * Update user profile
 */
export async function updateProfile(req, res) {
  try {
    const user = req.user

    // Validate updates
    const validationErrors = validateProfileUpdateData(req.body)
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        message: validationErrors[0].message,
        errors: validationErrors
      })
    }

    // Update profile
    const updatedUser = await updateUserProfile(user.id, req.body)

    const userResponse = formatUserResponse(updatedUser, true)

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: userResponse
    })

    // Log onboarding completion if applicable
    const isOnboarding = isOnboardingUpdate(req.body, updatedUser)

    if (isOnboarding) {
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

    if (error.message === 'NO_VALID_UPDATES') {
      return res.status(400).json({
        error: 'No valid updates provided',
        message: 'Please provide valid fields to update'
      })
    }

    res.status(500).json({
      error: 'Update failed',
      message: 'Internal server error during profile update'
    })
  }
}

/**
 * GET /api/auth/onboarding-status
 * Check if user has completed onboarding
 */
export async function getOnboardingStatus(req, res) {
  try {
    const user = req.user

    const status = checkOnboardingStatus(user)

    res.json({
      isComplete: status.isComplete,
      missingFields: status.missingFields,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        hasBasicProfile: status.hasBasicProfile,
        hasPhysicalProfile: status.hasPhysicalProfile,
        hasGoals: status.hasGoals
      }
    })

    console.log(`🔍 Onboarding status checked for: ${user.email} - Complete: ${status.isComplete}`)
  } catch (error) {
    console.error('❌ Onboarding status error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Internal server error while checking onboarding status'
    })
  }
}

/**
 * POST /api/auth/verify
 * Verify if a JWT token is valid
 */
export async function verifyToken(req, res) {
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
}

/**
 * POST /api/auth/refresh
 * Refresh an access token
 */
export async function refreshToken(req, res) {
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
}

import { supabase } from '../config/supabase.js'
import { generateJWT } from '../utils/auth.js'
import { createFollowNotification, deleteNotification } from '../services/notificationService.js'
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

/**
 * Get user statistics
 * GET /api/users/:userId/stats
 */
export async function getUserStats(req, res) {
  try {
    const { userId } = req.params

    console.log(`📊 Fetching stats for user: ${userId}`)

    // Get total workouts completed
    const { count: totalWorkouts, error: workoutsError } = await supabase
      .from('workout_completions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    if (workoutsError) {
      console.error('❌ Error fetching workouts count:', workoutsError)
    }

    // Get total posts count, followers, and following from user profile
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('posts_count, followers_count, following_count')
      .eq('id', userId)
      .single()

    if (userError) {
      console.error('❌ Error fetching user data:', userError)
    }

    // Calculate current streak
    const { data: recentCompletions, error: streakError } = await supabase
      .from('workout_completions')
      .select('completed_at')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(365) // Check up to 1 year

    let currentStreak = 0
    if (recentCompletions && recentCompletions.length > 0 && !streakError) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Check if there's a workout today or yesterday
      const mostRecent = new Date(recentCompletions[0].completed_at)
      mostRecent.setHours(0, 0, 0, 0)

      const daysDiff = Math.floor((today - mostRecent) / (1000 * 60 * 60 * 24))

      if (daysDiff <= 1) {
        // Start counting streak
        currentStreak = 1
        let prevDate = mostRecent

        for (let i = 1; i < recentCompletions.length; i++) {
          const currentDate = new Date(recentCompletions[i].completed_at)
          currentDate.setHours(0, 0, 0, 0)

          const diff = Math.floor((prevDate - currentDate) / (1000 * 60 * 60 * 24))

          if (diff === 1) {
            currentStreak++
            prevDate = currentDate
          } else if (diff === 0) {
            // Same day, continue
            continue
          } else {
            // Streak broken
            break
          }
        }
      }
    }

    const stats = {
      totalWorkouts: totalWorkouts || 0,
      currentStreak,
      postsCount: userData?.posts_count || 0,
      followersCount: userData?.followers_count || 0,
      followingCount: userData?.following_count || 0
    }

    console.log(`✅ Stats fetched for user ${userId}:`, stats)

    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('❌ Get user stats error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user stats',
      message: error.message
    })
  }
}

/**
 * Get user profile by ID
 * GET /api/users/:userId
 */
export async function getUserProfile(req, res) {
  try {
    const { userId } = req.params

    // Fetch user profile from Supabase
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, full_name, bio, profile_photo_url, created_at')
      .eq('id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        })
      }
      throw error
    }

    res.json({
      success: true,
      data: user
    })
  } catch (error) {
    console.error('❌ Get user profile error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile',
      message: error.message
    })
  }
}

/**
 * Follow a user
 * POST /api/users/:userId/follow
 */
export async function followUser(req, res) {
  try {
    const { userId } = req.params // User to follow
    const followerId = req.user.id // Current user (follower)

    // Prevent self-follow
    if (followerId === userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot follow yourself'
      })
    }

    // Check if already following
    const { data: existing } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('following_id', userId)
      .single()

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Already following this user'
      })
    }

    // Create follow relationship
    const { data: follow, error: followError } = await supabase
      .from('user_follows')
      .insert({
        follower_id: followerId,
        following_id: userId
      })
      .select()
      .single()

    if (followError) throw followError

    // Increment counts atomically using RPC
    const { error: countError } = await supabase.rpc('increment_follow_counts', {
      follower_user_id: followerId,
      following_user_id: userId
    })

    if (countError) {
      console.error('❌ RPC increment_follow_counts failed:', countError)
      throw new Error('Failed to update follow counts')
    }

    // Create notification for the followed user
    await createFollowNotification(userId, followerId)

    res.json({
      success: true,
      data: follow,
      message: 'User followed successfully'
    })
  } catch (error) {
    console.error('❌ Follow user error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to follow user',
      message: error.message
    })
  }
}

/**
 * Unfollow a user
 * DELETE /api/users/:userId/follow
 */
export async function unfollowUser(req, res) {
  try {
    const { userId } = req.params // User to unfollow
    const followerId = req.user.id // Current user (follower)

    // Delete follow relationship
    const { data: deleted, error: deleteError } = await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', userId)
      .select()

    if (deleteError) throw deleteError

    if (!deleted || deleted.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Follow relationship not found'
      })
    }

    // Decrement counts atomically using RPC
    const { error: countError } = await supabase.rpc('decrement_follow_counts', {
      follower_user_id: followerId,
      following_user_id: userId
    })

    if (countError) {
      console.error('❌ RPC decrement_follow_counts failed:', countError)
      throw new Error('Failed to update follow counts')
    }

    // Delete the follow notification
    await deleteNotification({
      actorId: followerId,
      type: 'follow'
    })

    res.json({
      success: true,
      message: 'User unfollowed successfully'
    })
  } catch (error) {
    console.error('❌ Unfollow user error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to unfollow user',
      message: error.message
    })
  }
}

/**
 * Get user's followers
 * GET /api/users/:userId/followers
 */
export async function getUserFollowers(req, res) {
  try {
    const { userId } = req.params
    const { limit = 20, cursor } = req.query

    let query = supabase
      .from('user_follows')
      .select(`
        id,
        created_at,
        follower:users!user_follows_follower_id_fkey(
          id,
          username,
          full_name,
          profile_photo_url
        )
      `)
      .eq('following_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit))

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: follows, error } = await query

    if (error) throw error

    // Extract follower user data
    const followers = follows.map(f => ({
      ...f.follower,
      followed_at: f.created_at
    }))

    res.json({
      success: true,
      data: {
        followers,
        nextCursor: follows.length === parseInt(limit) ? follows[follows.length - 1].created_at : null
      }
    })
  } catch (error) {
    console.error('❌ Get followers error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch followers',
      message: error.message
    })
  }
}

/**
 * Get users that a user is following
 * GET /api/users/:userId/following
 */
export async function getUserFollowing(req, res) {
  try {
    const { userId } = req.params
    const { limit = 20, cursor } = req.query

    let query = supabase
      .from('user_follows')
      .select(`
        id,
        created_at,
        following:users!user_follows_following_id_fkey(
          id,
          username,
          full_name,
          profile_photo_url
        )
      `)
      .eq('follower_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit))

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: follows, error } = await query

    if (error) throw error

    // Extract following user data
    const following = follows.map(f => ({
      ...f.following,
      followed_at: f.created_at
    }))

    res.json({
      success: true,
      data: {
        following,
        nextCursor: follows.length === parseInt(limit) ? follows[follows.length - 1].created_at : null
      }
    })
  } catch (error) {
    console.error('❌ Get following error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch following',
      message: error.message
    })
  }
}

/**
 * Check if current user is following another user
 * GET /api/users/:userId/follow-status
 */
export async function getFollowStatus(req, res) {
  try {
    const { userId } = req.params
    const currentUserId = req.user.id

    // Check if following
    const { data: follow, error } = await supabase
      .from('user_follows')
      .select('id, created_at')
      .eq('follower_id', currentUserId)
      .eq('following_id', userId)
      .single()

    res.json({
      success: true,
      data: {
        isFollowing: !!follow,
        followedAt: follow?.created_at || null
      }
    })
  } catch (error) {
    // Not following is not an error
    if (error.code === 'PGRST116') {
      return res.json({
        success: true,
        data: {
          isFollowing: false,
          followedAt: null
        }
      })
    }

    console.error('❌ Get follow status error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to check follow status',
      message: error.message
    })
  }
}

/**
 * Search for users by name or username
 * GET /api/users/search?q=query&limit=20
 */
export async function searchUsers(req, res) {
  try {
    const { q, limit = 20 } = req.query
    const currentUserId = req.user?.id

    if (!q || q.trim().length === 0) {
      return res.json({
        success: true,
        data: {
          users: []
        }
      })
    }

    const searchQuery = q.trim().toLowerCase()

    // Search by username or full_name (case-insensitive)
    let query = supabase
      .from('users')
      .select('id, username, full_name, profile_photo_url, bio')
      .or(`username.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`)
      .limit(parseInt(limit))

    // Exclude current user from results if authenticated
    if (currentUserId) {
      query = query.neq('id', currentUserId)
    }

    const { data: users, error } = await query

    if (error) throw error

    res.json({
      success: true,
      data: {
        users: users || []
      }
    })
  } catch (error) {
    console.error('❌ Search users error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to search users',
      message: error.message
    })
  }
}

/**
 * Get suggested/random users for discovery
 * GET /api/users/suggested?limit=20
 */
export async function getSuggestedUsers(req, res) {
  try {
    const { limit = 20 } = req.query
    const currentUserId = req.user?.id

    // Get random users, excluding current user
    let query = supabase
      .from('users')
      .select('id, username, full_name, profile_photo_url, bio, followers_count')
      .limit(parseInt(limit))

    // Exclude current user if authenticated
    if (currentUserId) {
      query = query.neq('id', currentUserId)
    }

    // Order by followers count to show more popular users first
    // Then randomize within that
    const { data: users, error } = await query
      .order('followers_count', { ascending: false })

    if (error) throw error

    // Shuffle the results to add randomness
    const shuffled = users?.sort(() => Math.random() - 0.5) || []

    res.json({
      success: true,
      data: {
        users: shuffled
      }
    })
  } catch (error) {
    console.error('❌ Get suggested users error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get suggested users',
      message: error.message
    })
  }
}

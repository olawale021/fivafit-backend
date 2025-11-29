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
} from './userService.js'

/**
 * Auth Service
 * Handles authentication business logic
 */

/**
 * Validate registration data
 */
export function validateRegistrationData(username, email, password, full_name) {
  const errors = []

  if (!username || !email || !password || !full_name) {
    errors.push({
      field: 'general',
      message: 'Username, email, password, and full name are required'
    })
  }

  if (password && password.length < 8) {
    errors.push({
      field: 'password',
      message: 'Password must be at least 8 characters long'
    })
  }

  return errors
}

/**
 * Validate profile update data
 */
export function validateProfileUpdateData(updates) {
  const errors = []

  if (updates.gender && !['male', 'female'].includes(updates.gender)) {
    errors.push({
      field: 'gender',
      message: 'Gender must be either "male" or "female"'
    })
  }

  if (updates.date_of_birth) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(updates.date_of_birth)) {
      errors.push({
        field: 'date_of_birth',
        message: 'Date of birth must be in YYYY-MM-DD format'
      })
    }
  }

  if (updates.height_cm && (updates.height_cm < 50 || updates.height_cm > 300)) {
    errors.push({
      field: 'height_cm',
      message: 'Height must be between 50-300 cm'
    })
  }

  if (updates.weight_kg && (updates.weight_kg < 20 || updates.weight_kg > 500)) {
    errors.push({
      field: 'weight_kg',
      message: 'Weight must be between 20-500 kg'
    })
  }

  if (updates.fitness_goal) {
    const validGoals = ['weight_loss', 'muscle_building', 'general_fitness', 'flexibility', 'athletic_performance', 'endurance', 'rehabilitation']

    // Handle both old format (string) and new format (array)
    let goals = []
    if (Array.isArray(updates.fitness_goal)) {
      goals = updates.fitness_goal
    } else if (typeof updates.fitness_goal === 'string') {
      goals = updates.fitness_goal.split(',').map(g => g.trim())
    }

    // Validate max 3 goals
    if (goals.length > 3) {
      errors.push({
        field: 'fitness_goal',
        message: 'Maximum 3 fitness goals allowed'
      })
    }

    const invalidGoals = goals.filter(goal => !validGoals.includes(goal))
    if (invalidGoals.length > 0) {
      errors.push({
        field: 'fitness_goal',
        message: `Invalid goals: ${invalidGoals.join(', ')}. Valid goals are: ${validGoals.join(', ')}`
      })
    }
  }

  if (updates.fitness_levels) {
    const validLevels = ['beginner', 'intermediate', 'advanced']

    // Ensure it's an array
    if (!Array.isArray(updates.fitness_levels)) {
      errors.push({
        field: 'fitness_levels',
        message: 'Fitness levels must be an array'
      })
    } else {
      // Validate max 3 levels
      if (updates.fitness_levels.length > 3) {
        errors.push({
          field: 'fitness_levels',
          message: 'Maximum 3 fitness levels allowed'
        })
      }

      const invalidLevels = updates.fitness_levels.filter(level => !validLevels.includes(level))
      if (invalidLevels.length > 0) {
        errors.push({
          field: 'fitness_levels',
          message: `Invalid levels: ${invalidLevels.join(', ')}. Valid levels are: ${validLevels.join(', ')}`
        })
      }
    }
  }

  if (updates.body_focus) {
    const validBodyParts = ['chest', 'back', 'shoulders', 'arms', 'abs', 'legs', 'glutes', 'cardio']

    // Ensure it's an array
    if (!Array.isArray(updates.body_focus)) {
      errors.push({
        field: 'body_focus',
        message: 'Body focus must be an array'
      })
    } else {
      // Validate max 3 body parts
      if (updates.body_focus.length > 3) {
        errors.push({
          field: 'body_focus',
          message: 'Maximum 3 body focus areas allowed'
        })
      }

      const invalidParts = updates.body_focus.filter(part => !validBodyParts.includes(part))
      if (invalidParts.length > 0) {
        errors.push({
          field: 'body_focus',
          message: `Invalid body parts: ${invalidParts.join(', ')}. Valid parts are: ${validBodyParts.join(', ')}`
        })
      }
    }
  }

  return errors
}

/**
 * Register a new user
 */
export async function registerUser(userData) {
  const { username, email, password, full_name } = userData

  // Check username availability
  const isUsernameAvailable = await checkUsernameAvailability(username)
  if (!isUsernameAvailable) {
    throw new Error('USERNAME_TAKEN')
  }

  // Check email availability
  const isEmailAvailable = await checkEmailAvailability(email)
  if (!isEmailAvailable) {
    throw new Error('EMAIL_TAKEN')
  }

  // Create user
  const user = await createUser({
    username,
    email,
    password,
    full_name
  })

  // Generate token
  const token = generateJWT({ userId: user.id, email: user.email })

  return { user, token }
}

/**
 * Login user with username/email and password
 */
export async function loginUser(identifier, password) {
  // Find user by username or email
  let user = await findUserByUsername(identifier)
  if (!user) {
    user = await findUserByEmail(identifier)
  }

  if (!user) {
    throw new Error('INVALID_CREDENTIALS')
  }

  // Check if user has password set
  if (!user.password_hash) {
    throw new Error('NO_PASSWORD')
  }

  // Verify password
  const isPasswordValid = await verifyPassword(password, user.password_hash)
  if (!isPasswordValid) {
    throw new Error('INVALID_CREDENTIALS')
  }

  // Update last login
  await updateLastLogin(user.id)

  // Generate token
  const token = generateJWT({ userId: user.id, email: user.email })

  return { user, token }
}

/**
 * Handle Google OAuth user
 */
export async function handleGoogleOAuth(profile) {
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
  return user
}

/**
 * Handle Apple Sign-In OAuth
 */
export async function handleAppleOAuth(appleData) {
  const { user: appleUserId, email, fullName } = appleData

  // Try to find user by Apple ID first
  let user = await findUserById(appleUserId)

  if (!user && email) {
    // Try to find by email
    user = await findUserByEmail(email)

    if (user) {
      // Link Apple ID to existing account
      user = await updateUser(user.id, { apple_id: appleUserId })
    } else {
      // Create new user
      const name = fullName
        ? `${fullName.givenName || ''} ${fullName.familyName || ''}`.trim()
        : null

      user = await createUser({
        apple_id: appleUserId,
        email: email,
        full_name: name || 'Apple User',
      })
    }
  }

  if (!user) {
    throw new Error('APPLE_AUTH_FAILED')
  }

  await updateLastLogin(user.id)
  return user
}

/**
 * Setup username for Google OAuth users
 */
export async function setupUsername(userId, username, currentUser) {
  if (currentUser.username) {
    throw new Error('USERNAME_ALREADY_SET')
  }

  const isUsernameAvailable = await checkUsernameAvailability(username)
  if (!isUsernameAvailable) {
    throw new Error('USERNAME_TAKEN')
  }

  const updatedUser = await updateUser(userId, { username })
  return updatedUser
}

/**
 * Update user profile
 */
export async function updateUserProfile(userId, updates) {
  const allowedUpdates = [
    'full_name', 'bio', 'date_of_birth', 'gender',
    'height_cm', 'weight_kg', 'target_weight_kg', 'fitness_goal', 'fitness_levels', 'body_focus',
    'daily_step_goal', 'daily_calorie_goal', 'privacy_level', 'socials'
  ]

  const filteredUpdates = {}
  Object.keys(updates).forEach(key => {
    if (allowedUpdates.includes(key)) {
      filteredUpdates[key] = updates[key]
    }
  })

  if (Object.keys(filteredUpdates).length === 0) {
    throw new Error('NO_VALID_UPDATES')
  }

  const updatedUser = await updateUser(userId, filteredUpdates)
  return updatedUser
}

/**
 * Check onboarding status
 */
export function checkOnboardingStatus(user) {
  const isOnboardingComplete = !!(user.username && user.gender && user.date_of_birth &&
                                 user.height_cm && user.weight_kg && user.fitness_goal)

  const missingFields = []
  if (!user.username) missingFields.push('username')
  if (!user.gender) missingFields.push('gender')
  if (!user.date_of_birth) missingFields.push('date_of_birth')
  if (!user.height_cm) missingFields.push('height_cm')
  if (!user.weight_kg) missingFields.push('weight_kg')
  if (!user.fitness_goal) missingFields.push('fitness_goal')

  return {
    isComplete: isOnboardingComplete,
    missingFields,
    hasBasicProfile: !!(user.gender && user.date_of_birth),
    hasPhysicalProfile: !!(user.height_cm && user.weight_kg),
    hasGoals: !!user.fitness_goal
  }
}

/**
 * Check if onboarding is complete based on updates
 */
export function isOnboardingUpdate(updates, user) {
  return updates.gender && updates.date_of_birth &&
         updates.height_cm && updates.weight_kg && updates.fitness_goal
}

/**
 * Format user response (remove sensitive data)
 */
export function formatUserResponse(user, includeFullProfile = false) {
  const baseResponse = {
    id: user.id,
    username: user.username,
    email: user.email,
    full_name: user.full_name,
    profile_photo_url: user.profile_photo_url,
    bio: user.bio,
    created_at: user.created_at
  }

  if (includeFullProfile) {
    return {
      ...baseResponse,
      date_of_birth: user.date_of_birth,
      gender: user.gender,
      height_cm: user.height_cm,
      weight_kg: user.weight_kg,
      target_weight_kg: user.target_weight_kg,
      fitness_goal: user.fitness_goal,
      fitness_levels: user.fitness_levels,
      body_focus: user.body_focus,
      daily_step_goal: user.daily_step_goal,
      daily_calorie_goal: user.daily_calorie_goal,
      privacy_level: user.privacy_level,
      socials: user.socials,
      last_login: user.last_login,
      updated_at: user.updated_at
    }
  }

  return baseResponse
}

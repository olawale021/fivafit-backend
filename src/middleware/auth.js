import { supabase } from '../config/supabase.js'

/**
 * Middleware to verify JWT token from Supabase Auth
 * Extracts user information and adds it to the request object
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        message: 'Please provide a valid authorization token'
      })
    }

    // Verify the JWT token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error) {
      console.error('❌ Token verification failed:', error.message)
      return res.status(401).json({
        error: 'Invalid token',
        message: 'The provided token is invalid or expired'
      })
    }

    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        message: 'No user associated with this token'
      })
    }

    // Add user information to request object
    req.user = user
    console.log(`✅ User authenticated: ${user.email} (${user.id})`)
    
    next()
  } catch (error) {
    console.error('❌ Authentication middleware error:', error)
    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication'
    })
  }
}

/**
 * Optional middleware - only authenticate if token is provided
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (token) {
      const { data: { user }, error } = await supabase.auth.getUser(token)
      
      if (!error && user) {
        req.user = user
        console.log(`✅ Optional auth - User: ${user.email}`)
      }
    }
    
    next()
  } catch (error) {
    // Don't fail the request for optional auth
    console.warn('⚠️  Optional auth failed:', error.message)
    next()
  }
}
import { verifyJWT } from '../utils/auth.js'
import { findUserById } from '../services/userService.js'

export const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        message: 'Please provide a valid authorization token'
      })
    }

    const decoded = verifyJWT(token)
    const user = await findUserById(decoded.userId)

    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        message: 'No user found with this token'
      })
    }

    req.user = user
    console.log(`✅ JWT User authenticated: ${user.email} (${user.id})`)
    
    next()
  } catch (error) {
    console.error('❌ JWT Authentication error:', error.message)
    return res.status(401).json({
      error: 'Invalid token',
      message: 'The provided token is invalid or expired'
    })
  }
}

export const optionalJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (token) {
      try {
        const decoded = verifyJWT(token)
        const user = await findUserById(decoded.userId)
        
        if (user) {
          req.user = user
          console.log(`✅ Optional JWT auth - User: ${user.email}`)
        }
      } catch (error) {
        console.warn('⚠️  Optional JWT auth failed:', error.message)
      }
    }
    
    next()
  } catch (error) {
    console.warn('⚠️  Optional JWT auth error:', error.message)
    next()
  }
}
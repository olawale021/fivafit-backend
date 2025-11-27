import express from 'express'
import multer from 'multer'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'
import {
  uploadImage,
  uploadImages,
  createPost,
  getFeed,
  likePost,
  unlikePost,
  getPost,
  deletePost
} from '../controllers/postsController.js'

const router = express.Router()

// Multer configuration for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
  },
  fileFilter: (req, file, cb) => {
    // Only accept images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'), false)
    }
  }
})

// Single image upload endpoint (requires auth) - backward compatibility
router.post('/upload-image', authenticateToken, upload.single('image'), uploadImage)

// Multiple images upload endpoint (requires auth) - max 5 images
router.post('/upload-images', authenticateToken, upload.array('images', 5), uploadImages)

// Create post (requires auth)
router.post('/', authenticateToken, createPost)

// Get feed (optional auth - shows liked status if authenticated)
router.get('/feed', optionalAuth, getFeed)

// Get single post (optional auth)
router.get('/:postId', optionalAuth, getPost)

// Like post (requires auth)
router.post('/:postId/like', authenticateToken, likePost)

// Unlike post (requires auth)
router.delete('/:postId/like', authenticateToken, unlikePost)

// Delete post (requires auth)
router.delete('/:postId', authenticateToken, deletePost)

export default router

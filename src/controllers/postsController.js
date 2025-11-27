import { supabase } from '../config/supabase.js'
import sharp from 'sharp'

/**
 * Upload post image to Supabase Storage (single image - backward compatibility)
 * POST /api/posts/upload-image
 */
export const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image provided'
      })
    }

    const userId = req.user.id
    const fileName = `${userId}/${Date.now()}.jpg`

    console.log(`📸 Uploading image for user ${userId}...`)

    // Compress and resize image using sharp
    const compressedBuffer = await sharp(req.file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()

    console.log(`✅ Image compressed: ${req.file.size} → ${compressedBuffer.length} bytes`)

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('post-photos')
      .upload(fileName, compressedBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('❌ Supabase upload error:', error)
      throw error
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('post-photos')
      .getPublicUrl(fileName)

    console.log(`✅ Image uploaded successfully: ${publicUrl}`)

    res.json({
      success: true,
      data: { imageUrl: publicUrl }
    })
  } catch (error) {
    console.error('❌ Image upload error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to upload image',
      message: error.message
    })
  }
}

/**
 * Upload multiple post images to Supabase Storage
 * POST /api/posts/upload-images
 */
export const uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No images provided'
      })
    }

    const userId = req.user.id
    const imageUrls = []

    console.log(`📸 Uploading ${req.files.length} images for user ${userId}...`)

    // Upload each image
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i]
      const fileName = `${userId}/${Date.now()}_${i}.jpg`

      console.log(`📷 Processing image ${i + 1}: ${file.mimetype}, size: ${file.size}`)

      let compressedBuffer
      try {
        // Check if file is HEIF/HEIC by mimetype or filename
        const isHeif = file.mimetype === 'image/heif' ||
                       file.mimetype === 'image/heic' ||
                       file.originalname?.toLowerCase().endsWith('.heic') ||
                       file.originalname?.toLowerCase().endsWith('.heif')

        if (isHeif) {
          console.log(`🔄 Converting HEIF image ${i + 1}...`)
          // Use unlimited buffer size and page height for HEIF
          compressedBuffer = await sharp(file.buffer, {
            unlimited: true,
            sequentialRead: true
          })
            .rotate() // Auto-rotate based on EXIF
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer()
        } else {
          // Standard processing for other formats
          compressedBuffer = await sharp(file.buffer)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer()
        }
      } catch (sharpError) {
        console.error(`❌ Sharp processing error for image ${i + 1}:`, sharpError.message)
        // If sharp fails, try uploading the original file
        console.log(`⚠️  Uploading original file without compression...`)
        compressedBuffer = file.buffer
      }

      console.log(`✅ Image ${i + 1} processed: ${file.size} → ${compressedBuffer.length} bytes`)

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('post-photos')
        .upload(fileName, compressedBuffer, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        console.error(`❌ Supabase upload error for image ${i + 1}:`, error)
        throw error
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('post-photos')
        .getPublicUrl(fileName)

      imageUrls.push(publicUrl)
      console.log(`✅ Image ${i + 1} uploaded successfully: ${publicUrl}`)
    }

    res.json({
      success: true,
      data: { imageUrls }
    })
  } catch (error) {
    console.error('❌ Image upload error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to upload images',
      message: error.message
    })
  }
}

/**
 * Create a new post
 * POST /api/posts
 * Uses imageUrls array (can be 1-5 images)
 */
export const createPost = async (req, res) => {
  try {
    const userId = req.user.id
    const { workoutCompletionId, workoutName, caption, imageUrls, stats } = req.body

    console.log(`📝 Creating post for user ${userId}...`)

    // Validate required fields
    if (!workoutName || !stats) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: workoutName and stats are required'
      })
    }

    // Validate imageUrls
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one image is required'
      })
    }

    if (imageUrls.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 5 images allowed per post'
      })
    }

    console.log(`📊 Image URLs to save:`, {
      count: imageUrls.length,
      urls: imageUrls
    })

    // Insert post
    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        workout_completion_id: workoutCompletionId,
        workout_name: workoutName,
        caption: caption || null,
        image_urls: imageUrls,
        stats: stats
      })
      .select()
      .single()

    console.log(`📊 Post created with images:`, {
      postId: post?.id,
      imageUrlsCount: post?.image_urls?.length,
      imageUrls: post?.image_urls
    })

    if (postError) {
      console.error('❌ Post creation error:', postError)
      throw postError
    }

    console.log(`✅ Post created: ${post.id}`)

    // Update workout_completion with activity_id (if provided)
    if (workoutCompletionId) {
      await supabase
        .from('workout_completions')
        .update({ activity_id: post.id })
        .eq('id', workoutCompletionId)

      console.log(`✅ Workout completion updated with activity_id`)
    }

    // Increment user's posts_count using raw SQL
    const { error: countError } = await supabase.rpc('increment_user_posts_count', {
      user_id_param: userId
    })

    if (countError) {
      // Fallback: Manual increment if RPC doesn't exist
      console.warn('⚠️  RPC not found, using manual increment')
      const { data: userData } = await supabase
        .from('users')
        .select('posts_count')
        .eq('id', userId)
        .single()

      await supabase
        .from('users')
        .update({ posts_count: (userData?.posts_count || 0) + 1 })
        .eq('id', userId)
    }

    res.json({
      success: true,
      data: post
    })
  } catch (error) {
    console.error('❌ Create post error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to create post',
      message: error.message
    })
  }
}

/**
 * Get feed posts (paginated)
 * GET /api/feed?page=0&limit=20
 */
export const getFeed = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = parseInt(req.query.limit) || 20
    const userId = req.user?.id // Optional - for checking liked status

    console.log(`📱 Fetching feed: page ${page}, limit ${limit}`)

    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        user:users (
          id,
          username,
          full_name,
          profile_photo_url
        )
      `)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (error) {
      console.error('❌ Feed fetch error:', error)
      throw error
    }

    // If user is authenticated, check which posts they liked
    let postsWithLikeStatus = data
    if (userId) {
      const postIds = data.map(p => p.id)

      const { data: likes } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds)

      const likedPostIds = new Set(likes?.map(l => l.post_id) || [])

      postsWithLikeStatus = data.map(post => ({
        ...post,
        liked_by_me: likedPostIds.has(post.id)
      }))
    }

    console.log(`✅ Found ${data.length} posts`)

    res.json({
      success: true,
      data: postsWithLikeStatus
    })
  } catch (error) {
    console.error('❌ Get feed error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feed',
      message: error.message
    })
  }
}

/**
 * Like a post
 * POST /api/posts/:postId/like
 */
export const likePost = async (req, res) => {
  try {
    const { postId } = req.params
    const userId = req.user.id

    console.log(`❤️  User ${userId} liking post ${postId}`)

    // Insert like
    const { error: likeError } = await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: userId })

    if (likeError) {
      if (likeError.code === '23505') { // Unique constraint violation
        return res.status(400).json({
          success: false,
          error: 'Already liked'
        })
      }
      throw likeError
    }

    // Increment likes_count atomically using RPC
    console.log('🔄 Calling increment_post_likes RPC for post:', postId)
    const { data: rpcData, error: incrementError } = await supabase.rpc('increment_post_likes', {
      post_id_param: postId
    })

    if (incrementError) {
      console.error('❌ RPC increment failed:', {
        error: incrementError,
        code: incrementError.code,
        message: incrementError.message,
        details: incrementError.details,
        hint: incrementError.hint
      })

      // Fallback to direct SQL update using raw query
      console.warn('⚠️  Using fallback SQL update...')
      const { error: fallbackError } = await supabase
        .rpc('exec_sql', {
          sql: `UPDATE posts SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = '${postId}'::uuid`
        })

      if (fallbackError) {
        // Last resort: use the old non-atomic method
        console.warn('⚠️  Fallback failed, using non-atomic update...')
        const { data: post } = await supabase
          .from('posts')
          .select('likes_count')
          .eq('id', postId)
          .single()

        await supabase
          .from('posts')
          .update({ likes_count: (post?.likes_count || 0) + 1 })
          .eq('id', postId)
      }
    } else {
      console.log('✅ RPC increment succeeded:', rpcData)
    }

    console.log(`✅ Post liked successfully`)

    res.json({
      success: true,
      message: 'Post liked'
    })
  } catch (error) {
    console.error('❌ Like post error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to like post',
      message: error.message
    })
  }
}

/**
 * Unlike a post
 * DELETE /api/posts/:postId/like
 */
export const unlikePost = async (req, res) => {
  try {
    const { postId } = req.params
    const userId = req.user.id

    console.log(`💔 User ${userId} unliking post ${postId}`)

    // Delete like
    const { error: deleteError } = await supabase
      .from('post_likes')
      .delete()
      .match({ post_id: postId, user_id: userId })

    if (deleteError) {
      throw deleteError
    }

    // Decrement likes_count atomically using RPC
    const { error: decrementError } = await supabase.rpc('decrement_post_likes', {
      post_id_param: postId
    })

    if (decrementError) {
      console.error('❌ Failed to decrement likes count:', decrementError)
      throw decrementError
    }

    console.log(`✅ Post unliked successfully`)

    res.json({
      success: true,
      message: 'Post unliked'
    })
  } catch (error) {
    console.error('❌ Unlike post error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to unlike post',
      message: error.message
    })
  }
}

/**
 * Get single post details
 * GET /api/posts/:postId
 */
export const getPost = async (req, res) => {
  try {
    const { postId } = req.params
    const userId = req.user?.id

    console.log(`📄 Fetching post ${postId}`)

    const { data: post, error } = await supabase
      .from('posts')
      .select(`
        *,
        user:users (
          id,
          username,
          full_name,
          profile_photo_url
        )
      `)
      .eq('id', postId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Post not found'
        })
      }
      throw error
    }

    // Check if user liked this post
    if (userId) {
      const { data: like } = await supabase
        .from('post_likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .single()

      post.liked_by_me = !!like
    }

    console.log(`✅ Post fetched successfully`)

    res.json({
      success: true,
      data: post
    })
  } catch (error) {
    console.error('❌ Get post error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch post',
      message: error.message
    })
  }
}

/**
 * Delete a post
 * DELETE /api/posts/:postId
 */
export const deletePost = async (req, res) => {
  try {
    const { postId } = req.params
    const userId = req.user.id

    console.log(`🗑️  User ${userId} deleting post ${postId}`)

    // Get post to check ownership and image URLs
    const { data: post, error: fetchError } = await supabase
      .from('posts')
      .select('user_id, image_urls')
      .eq('id', postId)
      .single()

    if (fetchError || !post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      })
    }

    // Check ownership
    if (post.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this post'
      })
    }

    // Delete all images from storage
    const imagePaths = []

    // Extract paths from image_urls array
    if (post.image_urls && Array.isArray(post.image_urls)) {
      post.image_urls.forEach(url => {
        const path = url.split('/post-photos/')[1]
        if (path) imagePaths.push(path)
      })
    }

    // Delete all image files from storage
    if (imagePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('post-photos')
        .remove(imagePaths)

      if (storageError) {
        console.warn('⚠️  Error deleting images from storage:', storageError)
      } else {
        console.log(`✅ Deleted ${imagePaths.length} image(s) from storage`)
      }
    }

    // Delete post (cascade will delete likes and comments)
    const { error: deleteError } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)

    if (deleteError) {
      throw deleteError
    }

    // Decrement user's posts_count
    const { data: userData } = await supabase
      .from('users')
      .select('posts_count')
      .eq('id', userId)
      .single()

    await supabase
      .from('users')
      .update({ posts_count: Math.max(0, (userData?.posts_count || 0) - 1) })
      .eq('id', userId)

    console.log(`✅ Post deleted successfully`)

    res.json({
      success: true,
      message: 'Post deleted'
    })
  } catch (error) {
    console.error('❌ Delete post error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete post',
      message: error.message
    })
  }
}

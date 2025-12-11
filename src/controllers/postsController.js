import { supabase } from '../config/supabase.js'
import sharp from 'sharp'
import { createLikeNotification, createCommentNotification, createReplyNotification, deleteNotification } from '../services/notificationService.js'

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

    // If user is authenticated, check which posts they liked and saved
    let postsWithFlags = data
    if (userId) {
      const postIds = data.map(p => p.id)

      // Check likes
      const { data: likes } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds)

      const likedPostIds = new Set(likes?.map(l => l.post_id) || [])

      // Check saves
      const { data: saves } = await supabase
        .from('post_saves')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds)

      const savedPostIds = new Set(saves?.map(s => s.post_id) || [])

      postsWithFlags = data.map(post => ({
        ...post,
        liked_by_me: likedPostIds.has(post.id),
        saved_by_me: savedPostIds.has(post.id)
      }))
    }

    console.log(`✅ Found ${data.length} posts`)

    res.json({
      success: true,
      data: postsWithFlags
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
 * Get following feed - posts from users the current user follows
 * GET /api/posts/following?page=0&limit=20
 */
export const getFollowingFeed = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = parseInt(req.query.limit) || 20
    const userId = req.user.id // Required - must be authenticated

    console.log(`📱 Fetching following feed for user ${userId}: page ${page}, limit ${limit}`)

    // First, get list of users that current user follows
    const { data: follows, error: followsError } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId)

    if (followsError) {
      console.error('❌ Error fetching follows:', followsError)
      throw followsError
    }

    const followingIds = follows.map(f => f.following_id)

    // If not following anyone, return empty feed
    if (followingIds.length === 0) {
      return res.json({
        success: true,
        data: []
      })
    }

    // Get posts from followed users
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
      .in('user_id', followingIds)
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (error) {
      console.error('❌ Following feed fetch error:', error)
      throw error
    }

    // Check which posts user liked and saved
    const postIds = data.map(p => p.id)

    // Check likes
    const { data: likes } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('user_id', userId)
      .in('post_id', postIds)

    const likedPostIds = new Set(likes?.map(l => l.post_id) || [])

    // Check saves
    const { data: saves } = await supabase
      .from('post_saves')
      .select('post_id')
      .eq('user_id', userId)
      .in('post_id', postIds)

    const savedPostIds = new Set(saves?.map(s => s.post_id) || [])

    const postsWithFlags = data.map(post => ({
      ...post,
      liked_by_me: likedPostIds.has(post.id),
      saved_by_me: savedPostIds.has(post.id)
    }))

    console.log(`✅ Found ${data.length} posts from followed users`)

    res.json({
      success: true,
      data: postsWithFlags
    })
  } catch (error) {
    console.error('❌ Get following feed error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch following feed',
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

    // Create notification for post author (if not liking own post)
    const { data: post } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', postId)
      .single()

    if (post) {
      await createLikeNotification(post.user_id, userId, postId)
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

    // Delete the like notification
    await deleteNotification({
      actorId: userId,
      type: 'like',
      postId
    })

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

/**
 * Get posts by specific user
 * GET /api/posts/user/:userId
 */
export const getUserPosts = async (req, res) => {
  try {
    const { userId } = req.params
    const { limit = 20, cursor } = req.query
    const currentUserId = req.user?.id

    console.log(`📖 Fetching posts for user: ${userId}, limit: ${limit}`)

    // Build query
    let query = supabase
      .from('posts')
      .select(`
        id,
        user_id,
        workout_completion_id,
        workout_name,
        caption,
        image_urls,
        stats,
        likes_count,
        comments_count,
        visibility,
        created_at,
        updated_at,
        user:users!posts_user_id_fkey(
          id,
          username,
          full_name,
          profile_photo_url
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit))

    // Apply cursor for pagination
    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: posts, error } = await query

    if (error) {
      console.error('❌ Supabase query error:', error)
      throw error
    }

    // If user is authenticated, check which posts they liked
    let likedPostIds = []
    if (currentUserId) {
      const { data: likes } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', currentUserId)
        .in('post_id', posts.map(p => p.id))

      likedPostIds = likes ? likes.map(l => l.post_id) : []
    }

    // Add liked_by_me flag to each post
    const postsWithLikes = posts.map(post => ({
      ...post,
      liked_by_me: likedPostIds.includes(post.id)
    }))

    console.log(`✅ Found ${posts.length} posts for user ${userId}`)

    res.json({
      success: true,
      data: {
        posts: postsWithLikes,
        nextCursor: posts.length === parseInt(limit)
          ? posts[posts.length - 1].created_at
          : null
      }
    })
  } catch (error) {
    console.error('❌ Get user posts error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user posts',
      message: error.message
    })
  }
}

/**
 * Add a comment to a post (or reply to a comment)
 * POST /api/posts/:postId/comments
 * Body: { commentText, parentCommentId? }
 */
export const addComment = async (req, res) => {
  try {
    const { postId } = req.params
    const { commentText, parentCommentId } = req.body
    const userId = req.user.id

    console.log(`💬 User ${userId} commenting on post ${postId}`, parentCommentId ? `(replying to ${parentCommentId})` : '')

    if (!commentText || commentText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Comment text is required'
      })
    }

    // If this is a reply, verify the parent comment exists
    if (parentCommentId) {
      const { data: parentComment, error: parentError } = await supabase
        .from('post_comments')
        .select('id, post_id')
        .eq('id', parentCommentId)
        .single()

      if (parentError || !parentComment) {
        return res.status(404).json({
          success: false,
          error: 'Parent comment not found'
        })
      }

      // Verify parent comment belongs to the same post
      if (parentComment.post_id !== postId) {
        return res.status(400).json({
          success: false,
          error: 'Parent comment does not belong to this post'
        })
      }
    }

    // Insert comment
    const { data: comment, error: commentError } = await supabase
      .from('post_comments')
      .insert({
        post_id: postId,
        user_id: userId,
        comment_text: commentText.trim(),
        parent_comment_id: parentCommentId || null
      })
      .select(`
        *,
        user:users (
          id,
          username,
          full_name,
          profile_photo_url
        )
      `)
      .single()

    if (commentError) {
      console.error('❌ Comment insert error:', commentError)
      throw commentError
    }

    // If this is a reply, increment parent comment's replies_count
    if (parentCommentId) {
      const { error: replyIncrementError } = await supabase.rpc('increment_comment_replies', {
        comment_id_param: parentCommentId
      })

      if (replyIncrementError) {
        console.error('❌ RPC increment_comment_replies failed:', replyIncrementError)
        // Don't throw - the comment was created successfully
      }
    }

    // Always increment post's comments_count (for both top-level comments and replies)
    console.log('🔄 Calling increment_post_comments RPC for post:', postId)
    const { error: incrementError } = await supabase.rpc('increment_post_comments', {
      post_id_param: postId
    })

    if (incrementError) {
      console.error('❌ RPC increment_post_comments failed:', incrementError)
      throw new Error('Failed to update comment count')
    }

    // Create notifications
    if (parentCommentId) {
      // This is a reply - notify the parent comment author
      const { data: parentComment } = await supabase
        .from('post_comments')
        .select('user_id')
        .eq('id', parentCommentId)
        .single()

      if (parentComment) {
        await createReplyNotification(parentComment.user_id, userId, postId, comment.id)
      }

      // Also notify post author if they're different from commenter and parent comment author
      const { data: post } = await supabase
        .from('posts')
        .select('user_id')
        .eq('id', postId)
        .single()

      if (post && post.user_id !== userId && post.user_id !== parentComment?.user_id) {
        await createCommentNotification(post.user_id, userId, postId, comment.id)
      }
    } else {
      // Top-level comment - notify post author
      const { data: post } = await supabase
        .from('posts')
        .select('user_id')
        .eq('id', postId)
        .single()

      if (post) {
        await createCommentNotification(post.user_id, userId, postId, comment.id)
      }
    }

    console.log('✅ Comment added successfully')

    res.json({
      success: true,
      data: comment
    })
  } catch (error) {
    console.error('❌ Add comment error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to add comment',
      message: error.message
    })
  }
}

/**
 * Get comments for a post (includes replies)
 * GET /api/posts/:postId/comments?limit=20&cursor=timestamp
 * Returns top-level comments with nested replies
 */
export const getComments = async (req, res) => {
  try {
    const { postId } = req.params
    const { limit = 20, cursor } = req.query

    console.log(`📥 Fetching comments for post ${postId}`)

    // Fetch top-level comments (no parent)
    let topLevelQuery = supabase
      .from('post_comments')
      .select(`
        *,
        user:users (
          id,
          username,
          full_name,
          profile_photo_url
        )
      `)
      .eq('post_id', postId)
      .is('parent_comment_id', null)
      .order('created_at', { ascending: true })
      .limit(parseInt(limit))

    // Cursor-based pagination (only for top-level comments)
    if (cursor) {
      topLevelQuery = topLevelQuery.gt('created_at', cursor)
    }

    const { data: topLevelComments, error: topLevelError } = await topLevelQuery

    if (topLevelError) {
      console.error('❌ Get comments error:', topLevelError)
      throw topLevelError
    }

    // Fetch all replies for these top-level comments
    const topLevelIds = topLevelComments.map(c => c.id)
    let replies = []

    if (topLevelIds.length > 0) {
      const { data: repliesData, error: repliesError } = await supabase
        .from('post_comments')
        .select(`
          *,
          user:users (
            id,
            username,
            full_name,
            profile_photo_url
          )
        `)
        .in('parent_comment_id', topLevelIds)
        .order('created_at', { ascending: true })

      if (!repliesError && repliesData) {
        replies = repliesData
      }
    }

    // Organize replies under their parent comments
    const commentsWithReplies = topLevelComments.map(comment => ({
      ...comment,
      replies: replies.filter(reply => reply.parent_comment_id === comment.id)
    }))

    console.log(`✅ Found ${topLevelComments.length} top-level comments with ${replies.length} total replies`)

    res.json({
      success: true,
      data: {
        comments: commentsWithReplies,
        nextCursor: topLevelComments.length === parseInt(limit)
          ? topLevelComments[topLevelComments.length - 1].created_at
          : null
      }
    })
  } catch (error) {
    console.error('❌ Get comments error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch comments',
      message: error.message
    })
  }
}

/**
 * Delete a comment
 * DELETE /api/posts/comments/:commentId
 */
export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params
    const userId = req.user.id

    console.log(`🗑️  User ${userId} deleting comment ${commentId}`)

    // Get the comment to verify ownership and get post_id and parent_comment_id
    const { data: comment, error: fetchError } = await supabase
      .from('post_comments')
      .select('id, user_id, post_id, parent_comment_id')
      .eq('id', commentId)
      .single()

    if (fetchError || !comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found'
      })
    }

    // Verify ownership
    if (comment.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own comments'
      })
    }

    // Delete the comment (CASCADE will delete any replies)
    const { error: deleteError } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', commentId)

    if (deleteError) {
      console.error('❌ Delete comment error:', deleteError)
      throw deleteError
    }

    // If this is a reply, decrement parent comment's replies_count
    if (comment.parent_comment_id) {
      const { error: replyDecrementError } = await supabase.rpc('decrement_comment_replies', {
        comment_id_param: comment.parent_comment_id
      })

      if (replyDecrementError) {
        console.error('❌ RPC decrement_comment_replies failed:', replyDecrementError)
        // Don't throw - the comment was deleted successfully
      }
    }

    // Always decrement post's comments_count (for both top-level comments and replies)
    console.log('🔄 Calling decrement_post_comments RPC for post:', comment.post_id)
    const { error: decrementError } = await supabase.rpc('decrement_post_comments', {
      post_id_param: comment.post_id
    })

    if (decrementError) {
      console.error('❌ RPC decrement_post_comments failed:', decrementError)
      throw new Error('Failed to update comment count')
    }

    console.log('✅ Comment deleted successfully')

    res.json({
      success: true,
      message: 'Comment deleted'
    })
  } catch (error) {
    console.error('❌ Delete comment error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete comment',
      message: error.message
    })
  }
}

/**
 * Save a post
 * POST /api/posts/:postId/save
 */
export const savePost = async (req, res) => {
  try {
    const { postId } = req.params
    const userId = req.user.id

    console.log(`🔖 User ${userId} saving post ${postId}`)

    // Insert save
    const { error: saveError } = await supabase
      .from('post_saves')
      .insert({ post_id: postId, user_id: userId })

    if (saveError) {
      if (saveError.code === '23505') { // Unique constraint violation
        return res.status(400).json({
          success: false,
          error: 'Already saved'
        })
      }
      throw saveError
    }

    // Increment saves_count atomically using RPC
    console.log('🔄 Calling increment_post_saves RPC for post:', postId)
    const { error: incrementError } = await supabase.rpc('increment_post_saves', {
      post_id_param: postId
    })

    if (incrementError) {
      console.error('❌ RPC increment_post_saves failed:', incrementError)
      throw new Error('Failed to update save count')
    }

    console.log('✅ Post saved successfully')

    res.json({
      success: true,
      message: 'Post saved'
    })
  } catch (error) {
    console.error('❌ Save post error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to save post',
      message: error.message
    })
  }
}

/**
 * Unsave a post
 * DELETE /api/posts/:postId/save
 */
export const unsavePost = async (req, res) => {
  try {
    const { postId } = req.params
    const userId = req.user.id

    console.log(`📌 User ${userId} unsaving post ${postId}`)

    // Delete save
    const { error: deleteError } = await supabase
      .from('post_saves')
      .delete()
      .match({ post_id: postId, user_id: userId })

    if (deleteError) {
      throw deleteError
    }

    // Decrement saves_count atomically using RPC
    console.log('🔄 Calling decrement_post_saves RPC for post:', postId)
    const { error: decrementError } = await supabase.rpc('decrement_post_saves', {
      post_id_param: postId
    })

    if (decrementError) {
      console.error('❌ RPC decrement_post_saves failed:', decrementError)
      throw new Error('Failed to update save count')
    }

    console.log('✅ Post unsaved successfully')

    res.json({
      success: true,
      message: 'Post unsaved'
    })
  } catch (error) {
    console.error('❌ Unsave post error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to unsave post',
      message: error.message
    })
  }
}

/**
 * Get saved posts for the current user
 * GET /api/users/me/saved?limit=20&cursor=timestamp
 */
export const getSavedPosts = async (req, res) => {
  try {
    const userId = req.user.id
    const { limit = 20, cursor } = req.query

    console.log(`📚 Fetching saved posts for user ${userId}`)

    // Build query for saved posts
    let query = supabase
      .from('post_saves')
      .select(`
        created_at,
        post:posts (
          id,
          user_id,
          workout_completion_id,
          workout_name,
          caption,
          image_urls,
          stats,
          likes_count,
          comments_count,
          saves_count,
          visibility,
          created_at,
          updated_at,
          user:users (
            id,
            username,
            full_name,
            profile_photo_url
          )
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit))

    // Apply cursor for pagination
    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: savedPosts, error } = await query

    if (error) {
      console.error('❌ Get saved posts error:', error)
      throw error
    }

    // Extract posts and add liked_by_me flag
    const posts = savedPosts
      .filter(sp => sp.post !== null) // Filter out saves for deleted posts
      .map(sp => sp.post)

    // Check which posts user liked
    const postIds = posts.map(p => p.id)
    let likedPostIds = []

    if (postIds.length > 0) {
      const { data: likes } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds)

      likedPostIds = likes ? likes.map(l => l.post_id) : []
    }

    // Add liked_by_me and saved_by_me flags
    const postsWithFlags = posts.map(post => ({
      ...post,
      liked_by_me: likedPostIds.includes(post.id),
      saved_by_me: true // All posts in this response are saved by definition
    }))

    console.log(`✅ Found ${posts.length} saved posts`)

    res.json({
      success: true,
      data: {
        posts: postsWithFlags,
        nextCursor: savedPosts.length === parseInt(limit)
          ? savedPosts[savedPosts.length - 1].created_at
          : null
      }
    })
  } catch (error) {
    console.error('❌ Get saved posts error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch saved posts',
      message: error.message
    })
  }
}

/**
 * Get liked posts for the current user
 * GET /api/users/me/liked?limit=20&cursor=timestamp
 */
export const getLikedPosts = async (req, res) => {
  try {
    const userId = req.user.id
    const { limit = 20, cursor } = req.query

    console.log(`❤️  Fetching liked posts for user ${userId}`)

    // Build query for liked posts
    let query = supabase
      .from('post_likes')
      .select(`
        created_at,
        post:posts (
          id,
          user_id,
          workout_completion_id,
          workout_name,
          caption,
          image_urls,
          stats,
          likes_count,
          comments_count,
          saves_count,
          visibility,
          created_at,
          updated_at,
          user:users (
            id,
            username,
            full_name,
            profile_photo_url
          )
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit))

    // Apply cursor for pagination
    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data: likedPosts, error } = await query

    if (error) {
      console.error('❌ Get liked posts error:', error)
      throw error
    }

    // Extract posts
    const posts = likedPosts
      .filter(lp => lp.post !== null) // Filter out likes for deleted posts
      .map(lp => lp.post)

    // Check which posts user saved
    const postIds = posts.map(p => p.id)
    let savedPostIds = []

    if (postIds.length > 0) {
      const { data: saves } = await supabase
        .from('post_saves')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds)

      savedPostIds = saves ? saves.map(s => s.post_id) : []
    }

    // Add liked_by_me and saved_by_me flags
    const postsWithFlags = posts.map(post => ({
      ...post,
      liked_by_me: true, // All posts in this response are liked by definition
      saved_by_me: savedPostIds.includes(post.id)
    }))

    console.log(`✅ Found ${posts.length} liked posts`)

    res.json({
      success: true,
      data: {
        posts: postsWithFlags,
        nextCursor: likedPosts.length === parseInt(limit)
          ? likedPosts[likedPosts.length - 1].created_at
          : null
      }
    })
  } catch (error) {
    console.error('❌ Get liked posts error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch liked posts',
      message: error.message
    })
  }
}

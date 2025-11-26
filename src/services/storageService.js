import { supabase } from '../config/supabase.js'
import crypto from 'crypto'

/**
 * Storage Service
 * Handles file uploads to Supabase Storage
 */

const SCAN_IMAGES_BUCKET = 'scan-images'

/**
 * Upload scan image to Supabase Storage
 * @param {Buffer} imageBuffer - Image file buffer
 * @param {string} userId - User ID for organizing files
 * @param {string} mimeType - Image MIME type (e.g., 'image/jpeg')
 * @returns {string|null} - Public URL of uploaded image or null
 */
export async function uploadScanImage(imageBuffer, userId, mimeType) {
  try {
    // Generate unique filename
    const fileExtension = getFileExtension(mimeType)
    const timestamp = Date.now()
    const randomString = crypto.randomBytes(8).toString('hex')
    const fileName = `${userId}/${timestamp}-${randomString}.${fileExtension}`

    console.log(`📤 Uploading scan image: ${fileName}`)

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(SCAN_IMAGES_BUCKET)
      .upload(fileName, imageBuffer, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('Error uploading image to storage:', error)
      return null
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(SCAN_IMAGES_BUCKET)
      .getPublicUrl(fileName)

    console.log(`✅ Image uploaded successfully: ${urlData.publicUrl}`)
    return urlData.publicUrl
  } catch (error) {
    console.error('Error in uploadScanImage:', error)
    return null
  }
}

/**
 * Delete scan image from storage
 * @param {string} imageUrl - Public URL of the image
 * @returns {boolean} - Success status
 */
export async function deleteScanImage(imageUrl) {
  try {
    // Extract file path from URL
    const fileName = extractFilePathFromUrl(imageUrl)
    if (!fileName) {
      console.error('Invalid image URL:', imageUrl)
      return false
    }

    const { error } = await supabase.storage
      .from(SCAN_IMAGES_BUCKET)
      .remove([fileName])

    if (error) {
      console.error('Error deleting image from storage:', error)
      return false
    }

    console.log(`🗑️ Deleted image: ${fileName}`)
    return true
  } catch (error) {
    console.error('Error in deleteScanImage:', error)
    return false
  }
}

/**
 * Delete multiple scan images
 * @param {string[]} imageUrls - Array of public URLs
 * @returns {boolean} - Success status
 */
export async function deleteScanImages(imageUrls) {
  try {
    const filePaths = imageUrls
      .map(url => extractFilePathFromUrl(url))
      .filter(path => path !== null)

    if (filePaths.length === 0) {
      return true
    }

    const { error } = await supabase.storage
      .from(SCAN_IMAGES_BUCKET)
      .remove(filePaths)

    if (error) {
      console.error('Error deleting images from storage:', error)
      return false
    }

    console.log(`🗑️ Deleted ${filePaths.length} images`)
    return true
  } catch (error) {
    console.error('Error in deleteScanImages:', error)
    return false
  }
}

/**
 * Get file extension from MIME type
 */
function getFileExtension(mimeType) {
  const mimeToExt = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif'
  }

  return mimeToExt[mimeType.toLowerCase()] || 'jpg'
}

/**
 * Extract file path from Supabase Storage public URL
 * Example: https://xxx.supabase.co/storage/v1/object/public/scan-images/user123/file.jpg
 * Returns: user123/file.jpg
 */
function extractFilePathFromUrl(url) {
  try {
    const match = url.match(/\/scan-images\/(.+)$/)
    return match ? match[1] : null
  } catch (error) {
    console.error('Error extracting file path from URL:', error)
    return null
  }
}

/**
 * Get all scan images for a user
 * @param {string} userId - User ID
 * @returns {Array} - List of file objects
 */
export async function getUserScanImages(userId) {
  try {
    const { data, error } = await supabase.storage
      .from(SCAN_IMAGES_BUCKET)
      .list(userId, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      })

    if (error) {
      console.error('Error fetching user scan images:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error in getUserScanImages:', error)
    return []
  }
}

/**
 * Delete all scan images for a user
 * @param {string} userId - User ID
 * @returns {boolean} - Success status
 */
export async function deleteAllUserScanImages(userId) {
  try {
    // List all files in user's folder
    const files = await getUserScanImages(userId)

    if (files.length === 0) {
      return true
    }

    // Get full file paths
    const filePaths = files.map(file => `${userId}/${file.name}`)

    // Delete all files
    const { error } = await supabase.storage
      .from(SCAN_IMAGES_BUCKET)
      .remove(filePaths)

    if (error) {
      console.error('Error deleting all user images:', error)
      return false
    }

    console.log(`🗑️ Deleted all ${files.length} images for user ${userId}`)
    return true
  } catch (error) {
    console.error('Error in deleteAllUserScanImages:', error)
    return false
  }
}

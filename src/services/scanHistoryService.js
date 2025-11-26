import { supabase } from '../config/supabase.js'
import { deleteScanImage, deleteAllUserScanImages } from './storageService.js'

/**
 * Scan History Service
 * Manages user equipment scan history
 */

/**
 * Save a scan to user's history
 */
export async function saveScanToHistory(userId, scanData) {
  try {
    const historyEntry = {
      user_id: userId,
      equipment_name: scanData.name,
      equipment_category: scanData._meta?.category || null,
      scan_result: {
        name: scanData.name,
        target_muscles: scanData.target_muscles,
        usage_tips: scanData.usage_tips,
        recommended_workouts: scanData.recommended_workouts,
        _meta: scanData._meta
      },
      was_cached: scanData._meta?.cached || false,
      scan_duration_ms: scanData._meta?.scan_duration_ms || null,
      image_url: scanData.image_url || null
    }

    const { data, error } = await supabase
      .from('scan_history')
      .insert([historyEntry])
      .select()
      .single()

    if (error) {
      console.error('Error saving scan to history:', error)
      return null
    }

    console.log(`💾 Saved scan to history: ${scanData.name} for user ${userId}`)
    return data
  } catch (error) {
    console.error('Error in saveScanToHistory:', error)
    return null
  }
}

/**
 * Get user's scan history with pagination
 */
export async function getUserScanHistory(userId, limit = 20, offset = 0) {
  try {
    const { data, error, count } = await supabase
      .from('scan_history')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching scan history:', error)
      return { scans: [], total: 0 }
    }

    return {
      scans: data || [],
      total: count || 0,
      hasMore: count > offset + limit
    }
  } catch (error) {
    console.error('Error in getUserScanHistory:', error)
    return { scans: [], total: 0 }
  }
}

/**
 * Get a specific scan by ID
 */
export async function getScanById(scanId, userId) {
  try {
    const { data, error } = await supabase
      .from('scan_history')
      .select('*')
      .eq('id', scanId)
      .eq('user_id', userId)
      .single()

    if (error) {
      console.error('Error fetching scan by ID:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Error in getScanById:', error)
    return null
  }
}

/**
 * Delete a scan from history
 * Also deletes associated image from storage
 */
export async function deleteScan(scanId, userId) {
  try {
    // First, get the scan to retrieve image URL
    const scan = await getScanById(scanId, userId)

    // Delete from database
    const { error } = await supabase
      .from('scan_history')
      .delete()
      .eq('id', scanId)
      .eq('user_id', userId)

    if (error) {
      console.error('Error deleting scan:', error)
      return false
    }

    // Delete image from storage if it exists
    if (scan?.image_url) {
      await deleteScanImage(scan.image_url)
    }

    console.log(`🗑️ Deleted scan ${scanId} for user ${userId}`)
    return true
  } catch (error) {
    console.error('Error in deleteScan:', error)
    return false
  }
}

/**
 * Get scan statistics for user
 */
export async function getUserScanStats(userId) {
  try {
    // Get total scans count
    const { count: totalScans, error: countError } = await supabase
      .from('scan_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    if (countError) {
      console.error('Error getting scan count:', countError)
      return null
    }

    // Get equipment categories breakdown
    const { data: scans, error: scansError } = await supabase
      .from('scan_history')
      .select('equipment_category, created_at')
      .eq('user_id', userId)

    if (scansError) {
      console.error('Error getting scans for stats:', scansError)
      return null
    }

    // Calculate statistics
    const categoryBreakdown = {}
    scans.forEach(scan => {
      const category = scan.equipment_category || 'unknown'
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1
    })

    // Get most recent scan date
    const mostRecentScan = scans.length > 0 ? scans[0].created_at : null

    // Get scans this week
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    const scansThisWeek = scans.filter(scan =>
      new Date(scan.created_at) > oneWeekAgo
    ).length

    return {
      totalScans: totalScans || 0,
      scansThisWeek,
      categoryBreakdown,
      mostRecentScan,
      favoriteCategory: Object.keys(categoryBreakdown).reduce((a, b) =>
        categoryBreakdown[a] > categoryBreakdown[b] ? a : b
      , 'none')
    }
  } catch (error) {
    console.error('Error in getUserScanStats:', error)
    return null
  }
}

/**
 * Search user's scan history
 */
export async function searchUserScans(userId, searchTerm, limit = 20) {
  try {
    const { data, error } = await supabase
      .from('scan_history')
      .select('*')
      .eq('user_id', userId)
      .ilike('equipment_name', `%${searchTerm}%`)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error searching scans:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error in searchUserScans:', error)
    return []
  }
}

/**
 * Clear all scan history for a user
 * Also deletes all associated images from storage
 */
export async function clearUserScanHistory(userId) {
  try {
    // Delete from database
    const { error } = await supabase
      .from('scan_history')
      .delete()
      .eq('user_id', userId)

    if (error) {
      console.error('Error clearing scan history:', error)
      return false
    }

    // Delete all images from storage
    await deleteAllUserScanImages(userId)

    console.log(`🗑️ Cleared all scan history and images for user ${userId}`)
    return true
  } catch (error) {
    console.error('Error in clearUserScanHistory:', error)
    return false
  }
}

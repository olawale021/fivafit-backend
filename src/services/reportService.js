import { supabase } from '../config/supabase.js'
import { sendReportEmail } from './emailService.js'
import { blockUser } from './blockService.js'

/**
 * Report Service
 * Handles content reporting functionality
 */

/**
 * Create a new content report
 * @param {string} reporterId - ID of the user submitting the report
 * @param {object} data - Report data
 * @param {boolean} alsoBlock - Whether to also block the reported user
 */
export async function createReport(reporterId, data, alsoBlock = true) {
  const { report_type, description, post_id, comment_id, reported_user_id } = data

  // Validate at least one target is provided
  if (!post_id && !comment_id && !reported_user_id) {
    throw new Error('MISSING_TARGET')
  }

  // Validate report type
  const validTypes = ['spam', 'harassment', 'hate_speech', 'violence', 'nudity', 'self_harm', 'impersonation', 'other']
  if (!validTypes.includes(report_type)) {
    throw new Error('INVALID_REPORT_TYPE')
  }

  // Check for duplicate report
  let duplicateQuery = supabase
    .from('content_reports')
    .select('id')
    .eq('reporter_id', reporterId)
    .eq('status', 'pending')

  if (post_id) duplicateQuery = duplicateQuery.eq('post_id', post_id)
  if (comment_id) duplicateQuery = duplicateQuery.eq('comment_id', comment_id)
  if (reported_user_id && !post_id && !comment_id) {
    duplicateQuery = duplicateQuery.eq('reported_user_id', reported_user_id)
  }

  const { data: existing } = await duplicateQuery.single()

  if (existing) {
    throw new Error('ALREADY_REPORTED')
  }

  // Get reporter info for email
  const { data: reporter } = await supabase
    .from('users')
    .select('username, email')
    .eq('id', reporterId)
    .single()

  // Get reported user info if reporting a user
  let reportedUser = null
  if (reported_user_id) {
    const { data: user } = await supabase
      .from('users')
      .select('username')
      .eq('id', reported_user_id)
      .single()
    reportedUser = user
  }

  // If reporting a post, get the post owner
  if (post_id && !reported_user_id) {
    const { data: post } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', post_id)
      .single()
    if (post) {
      const { data: user } = await supabase
        .from('users')
        .select('username')
        .eq('id', post.user_id)
        .single()
      reportedUser = user
    }
  }

  // If reporting a comment, get the comment owner
  if (comment_id && !reported_user_id) {
    const { data: comment } = await supabase
      .from('post_comments')
      .select('user_id')
      .eq('id', comment_id)
      .single()
    if (comment) {
      const { data: user } = await supabase
        .from('users')
        .select('username')
        .eq('id', comment.user_id)
        .single()
      reportedUser = user
    }
  }

  // Create report
  const { data: report, error } = await supabase
    .from('content_reports')
    .insert({
      reporter_id: reporterId,
      reported_user_id,
      post_id,
      comment_id,
      report_type,
      description,
      status: 'pending'
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating report:', error)
    throw new Error('REPORT_FAILED')
  }

  // Send email notification
  const emailResult = await sendReportEmail({
    ...report,
    reporter_username: reporter?.username,
    reporter_email: reporter?.email,
    reported_username: reportedUser?.username
  })

  // Also block the reported user if requested
  let blocked = false
  let userToBlock = reported_user_id

  // If not directly reporting a user, find the content owner to block
  if (!userToBlock && post_id) {
    const { data: post } = await supabase
      .from('posts')
      .select('user_id')
      .eq('id', post_id)
      .single()
    userToBlock = post?.user_id
  }
  if (!userToBlock && comment_id) {
    const { data: comment } = await supabase
      .from('post_comments')
      .select('user_id')
      .eq('id', comment_id)
      .single()
    userToBlock = comment?.user_id
  }

  if (alsoBlock && userToBlock && userToBlock !== reporterId) {
    try {
      await blockUser(reporterId, userToBlock)
      blocked = true
    } catch (error) {
      // Ignore if already blocked
      if (error.message !== 'ALREADY_BLOCKED') {
        console.error('Failed to block user after report:', error)
      } else {
        blocked = true
      }
    }
  }

  return {
    success: true,
    report,
    emailSent: emailResult.sent,
    blocked
  }
}

/**
 * Get reports submitted by a user
 */
export async function getUserReports(userId) {
  const { data, error } = await supabase
    .from('content_reports')
    .select('*')
    .eq('reporter_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching user reports:', error)
    throw new Error('FETCH_REPORTS_FAILED')
  }

  return data || []
}

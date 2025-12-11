import { supabase } from '../config/supabase.js';
import * as workoutPlannerService from './workoutPlannerService.js';
import { sendPushNotification } from './pushNotificationService.js';

/**
 * Generation Job Service
 * Handles async workout plan generation with job queue
 */

class GenerationJobService {
  /**
   * Create a new generation job
   */
  async createJob(userId, requestData) {
    try {
      const { data: job, error } = await supabase
        .from('generation_jobs')
        .insert({
          user_id: userId,
          request_data: requestData,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`📋 Created generation job ${job.id} for user ${userId}`);

      // Start processing in background (don't await)
      this.processJob(job.id).catch(err => {
        console.error(`❌ Error processing job ${job.id}:`, err);
      });

      return job;
    } catch (error) {
      console.error('Error creating generation job:', error);
      throw error;
    }
  }

  /**
   * Get job status and result
   */
  async getJob(jobId, userId) {
    try {
      const { data: job, error } = await supabase
        .from('generation_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      if (!job) throw new Error('Job not found');

      return {
        id: job.id,
        status: job.status,
        created_at: job.created_at,
        completed_at: job.completed_at,
        result_data: job.result_data,
        error_message: job.error_message
      };
    } catch (error) {
      console.error('Error getting job:', error);
      throw error;
    }
  }

  /**
   * Process a generation job (runs in background)
   */
  async processJob(jobId) {
    let job;

    try {
      // Fetch the job
      const { data: fetchedJob, error: fetchError } = await supabase
        .from('generation_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (fetchError) throw fetchError;
      job = fetchedJob;

      // Mark as processing
      await supabase
        .from('generation_jobs')
        .update({
          status: 'processing',
          started_at: new Date().toISOString()
        })
        .eq('id', jobId);

      console.log(`🔄 Processing generation job ${jobId}...`);

      // Generate the workout plan preview
      const result = await workoutPlannerService.generatePlanPreview({
        userId: job.user_id,
        ...job.request_data
      });

      // Mark as completed and store result
      await supabase
        .from('generation_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result_data: result
        })
        .eq('id', jobId);

      console.log(`✅ Generation job ${jobId} completed successfully`);

      // Send push notification to user
      await this.sendCompletionNotification(job.user_id, jobId);

    } catch (error) {
      console.error(`❌ Generation job ${jobId} failed:`, error);

      // Mark as failed and store error
      await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error.message || 'Generation failed'
        })
        .eq('id', jobId);

      // Send error notification to user
      if (job?.user_id) {
        await this.sendFailureNotification(job.user_id, jobId);
      }
    }
  }

  /**
   * Send push notification when generation completes
   */
  async sendCompletionNotification(userId, jobId) {
    try {
      await sendPushNotification(userId, {
        title: 'Workout Plan Ready! 🎉',
        body: 'Your personalized workout plan has been generated and is ready to customize.',
        data: {
          type: 'generation_complete',
          job_id: jobId,
          screen: 'workout-planner/customize'
          // Note: Don't include planPreviewJson - it exceeds Expo's 4KB payload limit
          // The app will fetch the plan data from the API when user taps the notification
        },
        channelId: 'workout-notifications'
      });

      // Mark notification as sent
      await supabase
        .from('generation_jobs')
        .update({ notification_sent: true })
        .eq('id', jobId);

      console.log(`📲 Sent completion notification for job ${jobId}`);
    } catch (error) {
      console.error('Error sending completion notification:', error);
      // Don't throw - notification failure shouldn't fail the job
    }
  }

  /**
   * Send push notification when generation fails
   */
  async sendFailureNotification(userId, jobId) {
    try {
      await sendPushNotification(userId, {
        title: 'Plan Generation Failed',
        body: 'We encountered an issue generating your workout plan. Please try again.',
        data: {
          type: 'generation_failed',
          job_id: jobId,
          screen: 'workout-planner'
        },
        channelId: 'workout-notifications'
      });

      await supabase
        .from('generation_jobs')
        .update({ notification_sent: true })
        .eq('id', jobId);

      console.log(`📲 Sent failure notification for job ${jobId}`);
    } catch (error) {
      console.error('Error sending failure notification:', error);
    }
  }

  /**
   * Clean up old completed/failed jobs (run periodically)
   */
  async cleanupOldJobs(daysOld = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data, error } = await supabase
        .from('generation_jobs')
        .delete()
        .in('status', ['completed', 'failed'])
        .lt('completed_at', cutoffDate.toISOString())
        .select('id');

      if (error) throw error;

      const deletedCount = data?.length || 0;
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old generation jobs`);
      }

      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old jobs:', error);
      throw error;
    }
  }
}

export default new GenerationJobService();

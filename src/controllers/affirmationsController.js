/**
 * Affirmations Controller
 * Handles affirmation-related endpoints
 */

import { supabase } from '../config/supabase.js'

/**
 * Get user's affirmation schedule preferences
 * GET /api/affirmations/schedule
 */
export const getSchedule = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('affirmation_schedule')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // Not found error
      throw error;
    }

    if (!data) {
      // Create default schedule if doesn't exist
      const { data: newSchedule, error: insertError } = await supabase
        .from('affirmation_schedule')
        .insert({
          user_id: userId,
          enabled: true,
          morning_time: '10:00:00',
          evening_time: '21:00:00',
          timezone: 'UTC'
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      return res.json({
        success: true,
        data: newSchedule
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching affirmation schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch schedule',
      error: error.message
    });
  }
};

/**
 * Update user's affirmation schedule preferences
 * PUT /api/affirmations/schedule
 */
export const updateSchedule = async (req, res) => {
  try {
    const userId = req.user.id;
    const { enabled, morningTime, eveningTime, timezone } = req.body;

    const updates = {};

    if (enabled !== undefined) updates.enabled = enabled;
    if (morningTime) updates.morning_time = morningTime;
    if (eveningTime) updates.evening_time = eveningTime;
    if (timezone) updates.timezone = timezone;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid update fields provided'
      });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('affirmation_schedule')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Schedule updated successfully',
      data
    });
  } catch (error) {
    console.error('Error updating affirmation schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update schedule',
      error: error.message
    });
  }
};

/**
 * Get user's recent affirmations
 * GET /api/affirmations/history
 */
export const getAffirmationHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, type } = req.query;

    let query = supabase
      .from('affirmations')
      .select('*')
      .eq('user_id', userId);

    if (type) {
      query = query.eq('affirmation_type', type);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching affirmation history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch affirmation history',
      error: error.message
    });
  }
};

/**
 * Mark affirmation as opened
 * POST /api/affirmations/:id/open
 */
export const markAffirmationOpened = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('affirmations')
      .update({
        opened: true,
        opened_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Affirmation not found'
        });
      }
      throw error;
    }

    res.json({
      success: true,
      message: 'Affirmation marked as opened',
      data
    });
  } catch (error) {
    console.error('Error marking affirmation as opened:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark affirmation as opened',
      error: error.message
    });
  }
};

/**
 * Manual trigger for testing affirmations
 * POST /api/affirmations/trigger-now
 */
export const triggerAffirmationNow = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type = 'daily' } = req.body; // 'daily', 're_engagement', or 'no_plan'

    // Import affirmation service functions
    const { generateAffirmation } = await import('../services/affirmationService.js');

    // Generate affirmation immediately
    const affirmation = await generateAffirmation(userId, type, new Date());

    // Mark as sent immediately (for testing)
    const { error: updateError } = await supabase
      .from('affirmations')
      .update({
        sent_at: new Date().toISOString(),
        delivery_status: 'sent'
      })
      .eq('id', affirmation.id);

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      message: 'Affirmation triggered successfully',
      data: affirmation
    });

    console.log(`✅ Manual affirmation triggered for user ${userId}: "${affirmation.affirmation_text}"`);
  } catch (error) {
    console.error('Error triggering affirmation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger affirmation',
      error: error.message
    });
  }
};

/**
 * Get affirmation analytics
 * GET /api/affirmations/analytics
 */
export const getAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all affirmations for user
    const { data: affirmations, error } = await supabase
      .from('affirmations')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    // Calculate stats
    const totalSent = affirmations.length;
    const totalOpened = affirmations.filter(a => a.opened).length;
    const dailyCount = affirmations.filter(a => a.affirmation_type === 'daily').length;
    const reengagementCount = affirmations.filter(a => a.affirmation_type === 're_engagement').length;
    const noPlanCount = affirmations.filter(a => a.affirmation_type === 'no_plan').length;
    const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(2) : 0;

    // Calculate time slot stats
    const timeSlotMap = {};
    affirmations
      .filter(a => a.affirmation_type === 'daily' && a.scheduled_for)
      .forEach(a => {
        const hour = new Date(a.scheduled_for).getHours();
        if (!timeSlotMap[hour]) {
          timeSlotMap[hour] = { total: 0, opened: 0 };
        }
        timeSlotMap[hour].total++;
        if (a.opened) {
          timeSlotMap[hour].opened++;
        }
      });

    const timeSlots = Object.keys(timeSlotMap).map(hour => ({
      hour: parseInt(hour),
      total: timeSlotMap[hour].total,
      opened: timeSlotMap[hour].opened,
      openRate: timeSlotMap[hour].total > 0
        ? ((timeSlotMap[hour].opened / timeSlotMap[hour].total) * 100).toFixed(2)
        : 0
    })).sort((a, b) => a.hour - b.hour);

    res.json({
      success: true,
      data: {
        totalSent,
        totalOpened,
        openRate: parseFloat(openRate),
        dailyCount,
        reengagementCount,
        noPlanCount,
        timeSlots
      }
    });
  } catch (error) {
    console.error('Error fetching affirmation analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics',
      error: error.message
    });
  }
};

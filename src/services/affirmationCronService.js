/**
 * Affirmation Cron Service
 * Manages scheduled affirmation delivery jobs
 */

import cron from 'node-cron'
import {
  generateAffirmation,
  getUsersForDailyAffirmations,
  getInactiveUsers,
  wasReengagementRecentlySent,
  getUsersWithoutActivePlan,
  markAsSent
} from './affirmationService.js'
import { sendPushNotification } from './pushNotificationService.js'

/**
 * Schedule Daily Affirmations (8am, 2pm & 8pm)
 * Runs three times daily at 8:00 AM, 2:00 PM and 8:00 PM
 */
export const scheduleDailyAffirmations = () => {
  // Morning affirmations at 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('🌅 [Cron] Sending morning affirmations (8am)...');
    await sendDailyAffirmations('morning');
  });

  // Afternoon affirmations at 2:00 PM
  cron.schedule('0 14 * * *', async () => {
    console.log('☀️ [Cron] Sending afternoon affirmations (2pm)...');
    await sendDailyAffirmations('afternoon');
  });

  // Evening affirmations at 8:00 PM (20:00)
  cron.schedule('0 20 * * *', async () => {
    console.log('🌙 [Cron] Sending evening affirmations (8pm)...');
    await sendDailyAffirmations('evening');
  });

  console.log('✅ Daily affirmation cron jobs scheduled (8am, 2pm & 8pm)');
};

/**
 * Helper: Send daily affirmations for a time slot
 */
async function sendDailyAffirmations(slot) {
  try {
    const users = await getUsersForDailyAffirmations();
    const affirmationsSent = [];

    console.log(`📋 Found ${users.length} users with affirmations enabled`);

    for (const user of users) {
      try {
        // Generate affirmation
        const affirmation = await generateAffirmation(user.user_id, 'daily');

        // Send push notification
        await sendPushNotificationToUser(user.user_id, {
          title: 'StepMode Daily',
          body: affirmation.affirmation_text,
          data: {
            type: 'affirmation',
            affirmationType: 'daily',
            affirmationId: affirmation.id
          }
        });

        // Mark as sent
        await markAsSent([affirmation.id]);

        affirmationsSent.push(affirmation.id);
        console.log(`✅ ${slot} affirmation sent to user ${user.user_id}: "${affirmation.affirmation_text.substring(0, 50)}..."`);

      } catch (error) {
        console.error(`❌ Error sending ${slot} affirmation to user ${user.user_id}:`, error);
        // Continue with next user
      }
    }

    console.log(`✅ [Cron] ${slot} affirmations complete. Sent ${affirmationsSent.length} notifications.`);

  } catch (error) {
    console.error(`❌ [Cron] ${slot} affirmations error:`, error);
  }
}

/**
 * Check for Re-engagement (Inactive Users)
 * Runs every 6 hours to check for inactive users (2+ days)
 */
export const scheduleReengagementCheck = () => {
  // Run every 6 hours (at 00:00, 06:00, 12:00, 18:00)
  cron.schedule('0 */6 * * *', async () => {
    console.log('🔍 [Cron] Checking for inactive users (re-engagement)...');

    try {
      const inactiveUsers = await getInactiveUsers();

      console.log(`📋 Found ${inactiveUsers.length} inactive users (2+ days)`);

      let reengagementsSent = 0;

      for (const userId of inactiveUsers) {
        try {
          // Check if re-engagement was recently sent
          const recentlySent = await wasReengagementRecentlySent(userId, 2);

          if (recentlySent) {
            console.log(`⏭️  Re-engagement already sent recently to user ${userId}`);
            continue;
          }

          // Generate re-engagement message
          const affirmation = await generateAffirmation(userId, 're_engagement');

          // Send push notification
          await sendPushNotificationToUser(userId, {
            title: 'Your Progress Matters',
            body: affirmation.affirmation_text,
            data: {
              type: 'affirmation',
              affirmationType: 're_engagement',
              affirmationId: affirmation.id
            }
          });

          // Mark as sent
          await markAsSent([affirmation.id]);

          reengagementsSent++;
          console.log(`✅ Re-engagement sent to user ${userId}: "${affirmation.affirmation_text.substring(0, 50)}..."`);

        } catch (error) {
          console.error(`❌ Error sending re-engagement to user ${userId}:`, error);
          // Continue with next user
        }
      }

      console.log(`✅ [Cron] Re-engagement check complete. Sent ${reengagementsSent} notifications.`);

    } catch (error) {
      console.error('❌ [Cron] Re-engagement check error:', error);
    }
  });

  console.log('✅ Re-engagement check cron job scheduled (every 6 hours)');
};

/**
 * Helper: Send push notification to a specific user
 */
async function sendPushNotificationToUser(userId, notification) {
  try {
    // Send using push notification service (it will fetch push token internally)
    await sendPushNotification(userId, notification);

  } catch (error) {
    console.error(`Error sending push notification to user ${userId}:`, error);
    throw error;
  }
}

/**
 * Check for Users Without Workout Plans
 * Runs daily at 3:00 PM to encourage creating workout plans
 */
export const scheduleNoPlanCheck = () => {
  // Run daily at 3:00 PM (15:00)
  cron.schedule('0 15 * * *', async () => {
    console.log('🔍 [Cron] Checking for users without workout plans...');

    try {
      const usersWithoutPlan = await getUsersWithoutActivePlan();

      console.log(`📋 Found ${usersWithoutPlan.length} users without active workout plans`);

      let noPlanSent = 0;

      for (const userId of usersWithoutPlan) {
        try {
          // Generate no-plan message
          const affirmation = await generateAffirmation(userId, 'no_plan');

          // Send push notification
          await sendPushNotificationToUser(userId, {
            title: 'Plan Your Workout',
            body: affirmation.affirmation_text,
            data: {
              type: 'affirmation',
              affirmationType: 'no_plan',
              affirmationId: affirmation.id
            }
          });

          // Mark as sent
          await markAsSent([affirmation.id]);

          noPlanSent++;
          console.log(`✅ No-plan notification sent to user ${userId}: "${affirmation.affirmation_text.substring(0, 50)}..."`);

        } catch (error) {
          console.error(`❌ Error sending no-plan notification to user ${userId}:`, error);
          // Continue with next user
        }
      }

      console.log(`✅ [Cron] No-plan check complete. Sent ${noPlanSent} notifications.`);

    } catch (error) {
      console.error('❌ [Cron] No-plan check error:', error);
    }
  });

  console.log('✅ No-plan check cron job scheduled (daily at 3pm)');
};

/**
 * Start all affirmation cron jobs
 */
export const startAffirmationCronJobs = () => {
  console.log('\n════════════════════════════════════════════════');
  console.log('🚀 Starting Affirmation Cron Jobs...');
  console.log('════════════════════════════════════════════════\n');

  scheduleDailyAffirmations();
  scheduleReengagementCheck();
  scheduleNoPlanCheck();

  console.log('\n════════════════════════════════════════════════');
  console.log('✅ All affirmation cron jobs started successfully');
  console.log('════════════════════════════════════════════════\n');
};

export default {
  scheduleDailyAffirmations,
  scheduleReengagementCheck,
  scheduleNoPlanCheck,
  startAffirmationCronJobs
};

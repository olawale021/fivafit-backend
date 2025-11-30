import cron from 'node-cron';
import { supabase } from '../config/supabase.js';
import {
  createWorkoutReminderNotification,
  createWeeklyGoalNotification,
  createMonthlyMilestoneNotification,
  createWeeklyReportNotification,
  createInactiveAlertNotification,
  createRecoveryReminderNotification
} from './notificationService.js';

/**
 * Cron Service
 * Manages all scheduled tasks for workout notifications
 * Currently implementing Phase 1: Daily and Upcoming Workout Reminders
 */

/**
 * Helper: Get current time in HH:MM format
 */
const getCurrentTime = () => {
  return new Date().toISOString().substring(11, 16);
};

/**
 * Helper: Get today's date in YYYY-MM-DD format
 */
const getToday = () => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Helper: Add minutes to time string
 */
const addMinutes = (timeStr, minutes) => {
  const [hours, mins] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, mins + minutes, 0, 0);
  return date.toTimeString().substring(0, 5);
};

// ============================================================================
// PHASE 1: CORE REMINDERS
// ============================================================================

/**
 * Daily Workout Reminders
 * Runs every hour to check for scheduled reminders
 * Checks notification_preferences for daily_reminder_time
 */
export const scheduleDailyWorkoutReminders = () => {
  // Run every hour at the top of the hour
  cron.schedule('0 * * * *', async () => {
    console.log('🔔 [Cron] Checking daily workout reminders...');

    try {
      const currentTime = getCurrentTime();
      const nextHour = addMinutes(currentTime, 60);
      const today = getToday();

      // Get users who have reminders scheduled for this hour
      const { data: users, error: usersError } = await supabase
        .from('notification_preferences')
        .select('user_id, daily_reminder_time')
        .eq('daily_reminder_enabled', true)
        .gte('daily_reminder_time', currentTime)
        .lt('daily_reminder_time', nextHour);

      if (usersError) {
        console.error('❌ Error fetching users for daily reminders:', usersError);
        return;
      }

      console.log(`Found ${users?.length || 0} users for daily reminders`);

      for (const userPref of users || []) {
        try {
          // Get today's scheduled workout for this user via workout_plans JOIN
          const { data: workout, error: workoutError } = await supabase
            .from('daily_workouts')
            .select('*, workout_plans!inner(user_id)')
            .eq('workout_plans.user_id', userPref.user_id)
            .eq('scheduled_date', today)
            .eq('is_completed', false)
            .single();

          if (workoutError && workoutError.code !== 'PGRST116') {
            // PGRST116 = no rows returned (expected for some users)
            console.error(`❌ Error fetching workout for user ${userPref.user_id}:`, workoutError);
            continue;
          }

          if (workout) {
            // Send daily workout reminder
            await createWorkoutReminderNotification(userPref.user_id, workout, 'daily');
            console.log(`✅ Daily reminder sent to user ${userPref.user_id}`);
          } else {
            // Check if it's a rest day via workout_plans JOIN
            const { data: restDay } = await supabase
              .from('daily_workouts')
              .select('*, workout_plans!inner(user_id)')
              .eq('workout_plans.user_id', userPref.user_id)
              .eq('scheduled_date', today)
              .eq('workout_type', 'rest')
              .single();

            if (restDay) {
              // Send rest day reminder
              await createWorkoutReminderNotification(userPref.user_id, restDay, 'rest');
              console.log(`✅ Rest day reminder sent to user ${userPref.user_id}`);
            } else {
              console.log(`⏭️  No workout scheduled for user ${userPref.user_id} today`);
            }
          }
        } catch (error) {
          console.error(`❌ Error processing daily reminder for user ${userPref.user_id}:`, error);
          // Continue with next user even if this one fails
        }
      }

      console.log(`✅ [Cron] Daily reminders processed`);

    } catch (error) {
      console.error('❌ [Cron] Daily reminder error:', error);
    }
  });

  console.log('✅ Daily workout reminders cron job scheduled (runs hourly)');
};

/**
 * Upcoming Workout Reminders (1 hour before)
 * Runs every 15 minutes to check for workouts starting in 1 hour
 */
export const scheduleUpcomingWorkoutReminders = () => {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('🔔 [Cron] Checking upcoming workout reminders...');

    try {
      const today = getToday();
      const now = new Date();

      // Get users with upcoming reminders enabled
      const { data: users, error: usersError } = await supabase
        .from('notification_preferences')
        .select('user_id, upcoming_reminder_minutes')
        .eq('upcoming_reminder_enabled', true);

      if (usersError) {
        console.error('❌ Error fetching users for upcoming reminders:', usersError);
        return;
      }

      console.log(`Checking ${users?.length || 0} users for upcoming reminders`);

      for (const userPref of users || []) {
        try {
          const reminderMinutes = userPref.upcoming_reminder_minutes || 60;

          // Get workouts scheduled for today via workout_plans JOIN
          const { data: workouts, error: workoutsError } = await supabase
            .from('daily_workouts')
            .select('*, workout_plans!inner(user_id)')
            .eq('workout_plans.user_id', userPref.user_id)
            .eq('scheduled_date', today)
            .eq('is_completed', false)

          if (workoutsError) {
            console.error(`❌ Error fetching workouts for user ${userPref.user_id}:`, workoutsError);
            continue;
          }

          // Check each workout to see if it's time to send reminder
          for (const workout of workouts || []) {
            // Skip workouts without scheduled_time
            if (!workout.scheduled_time) {
              continue;
            }

            // Parse workout time
            const [hours, minutes] = workout.scheduled_time.split(':').map(Number);
            const workoutTime = new Date();
            workoutTime.setHours(hours, minutes, 0, 0);

            // Calculate when reminder should be sent
            const reminderTime = new Date(workoutTime.getTime() - reminderMinutes * 60 * 1000);

            // Check if we're within the reminder window (now to now+15min)
            const fifteenMinutesLater = new Date(now.getTime() + 15 * 60 * 1000);

            if (now >= reminderTime && now < workoutTime && reminderTime <= fifteenMinutesLater) {
              // Check if reminder already sent today for this workout
              const { data: existingNotif } = await supabase
                .from('notifications')
                .select('id')
                .eq('user_id', userPref.user_id)
                .eq('type', 'workout_reminder_upcoming')
                .gte('created_at', `${today}T00:00:00`)
                .eq('metadata->>workout_id', workout.id)
                .single();

              if (!existingNotif) {
                // Send upcoming reminder
                await createWorkoutReminderNotification(userPref.user_id, workout, 'upcoming');
                console.log(`✅ Upcoming reminder sent to user ${userPref.user_id} for workout ${workout.id}`);
              } else {
                console.log(`⏭️  Upcoming reminder already sent to user ${userPref.user_id} for workout ${workout.id}`);
              }
            }
          }
        } catch (error) {
          console.error(`❌ Error processing upcoming reminder for user ${userPref.user_id}:`, error);
          // Continue with next user even if this one fails
        }
      }

      console.log(`✅ [Cron] Upcoming reminders processed`);

    } catch (error) {
      console.error('❌ [Cron] Upcoming reminder error:', error);
    }
  });

  console.log('✅ Upcoming workout reminders cron job scheduled (runs every 15 minutes)');
};

// ============================================================================
// FUTURE PHASES (Phase 2 & 3 - to be implemented later)
// ============================================================================

/**
 * Missed Workout Reminder - Phase 2
 * Runs at 8 PM daily to remind users of incomplete workouts
 */
export const scheduleMissedWorkoutReminders = () => {
  // Run daily at 8 PM (20:00)
  cron.schedule('0 20 * * *', async () => {
    console.log('🔔 [Cron] Checking missed workout reminders...');

    try {
      const today = getToday();

      // Get users with missed reminder enabled
      const { data: users, error: usersError } = await supabase
        .from('notification_preferences')
        .select('user_id')
        .eq('missed_reminder_enabled', true);

      if (usersError) {
        console.error('❌ Error fetching users for missed reminders:', usersError);
        return;
      }

      console.log(`Checking ${users?.length || 0} users for missed workouts`);

      for (const userPref of users || []) {
        try {
          // Get today's incomplete non-rest workouts via workout_plans JOIN
          const { data: missedWorkouts, error: workoutsError } = await supabase
            .from('daily_workouts')
            .select('*, workout_plans!inner(user_id)')
            .eq('workout_plans.user_id', userPref.user_id)
            .eq('scheduled_date', today)
            .eq('is_completed', false)
            .is('workout_type', null); // Not a rest day

          if (workoutsError) {
            console.error(`❌ Error fetching workouts for user ${userPref.user_id}:`, workoutsError);
            continue;
          }

          if (missedWorkouts && missedWorkouts.length > 0) {
            // Check if missed reminder already sent today
            const { data: existingNotif } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', userPref.user_id)
              .eq('type', 'workout_reminder_missed')
              .gte('created_at', `${today}T00:00:00`)
              .single();

            if (!existingNotif) {
              // Send missed workout reminder for the first workout
              await createWorkoutReminderNotification(userPref.user_id, missedWorkouts[0], 'missed');
              console.log(`✅ Missed workout reminder sent to user ${userPref.user_id}`);
            } else {
              console.log(`⏭️  Missed reminder already sent to user ${userPref.user_id} today`);
            }
          }
        } catch (error) {
          console.error(`❌ Error processing missed reminder for user ${userPref.user_id}:`, error);
          // Continue with next user even if this one fails
        }
      }

      console.log(`✅ [Cron] Missed workout reminders processed`);

    } catch (error) {
      console.error('❌ [Cron] Missed workout reminder error:', error);
    }
  });

  console.log('✅ Missed workout reminders cron job scheduled (runs daily at 8 PM)');
};

/**
 * Weekly Goal Check - Phase 2
 * Runs daily at 11:59 PM to check if user completed weekly goal
 */
export const scheduleWeeklyGoalCheck = () => {
  // Run daily at 11:59 PM (23:59)
  cron.schedule('59 23 * * *', async () => {
    console.log('🔔 [Cron] Checking weekly goals...');

    try {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday

      // Calculate week start (Monday) and week end (Sunday)
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - ((dayOfWeek + 6) % 7)); // Last Monday
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // This Sunday
      weekEnd.setHours(23, 59, 59, 999);

      const weekStartStr = weekStart.toISOString().split('T')[0];
      const weekEndStr = weekEnd.toISOString().split('T')[0];

      // Get users with weekly goal enabled
      const { data: users, error: usersError } = await supabase
        .from('notification_preferences')
        .select('user_id, weekly_goal_enabled')
        .eq('weekly_goal_enabled', true);

      if (usersError) {
        console.error('❌ Error fetching users for weekly goal:', usersError);
        return;
      }

      console.log(`Checking ${users?.length || 0} users for weekly goal completion`);

      for (const userPref of users || []) {
        try {
          // Get user's weekly goal from profile
          const { data: user, error: userError } = await supabase
            .from('users')
            .select('weekly_workout_goal')
            .eq('id', userPref.user_id)
            .single();

          if (userError || !user || !user.weekly_workout_goal) {
            continue;
          }

          const weeklyGoal = user.weekly_workout_goal;

          // Count completed workouts this week via workout_plans JOIN
          const { data: workouts, error: workoutsError } = await supabase
            .from('daily_workouts')
            .select('id, workout_name, duration_minutes, calories_burned, workout_plans!inner(user_id)')
            .eq('workout_plans.user_id', userPref.user_id)
            .eq('is_completed', true)
            .gte('scheduled_date', weekStartStr)
            .lte('scheduled_date', weekEndStr)
            .is('workout_type', null); // Not rest days

          if (workoutsError) {
            console.error(`❌ Error fetching workouts for user ${userPref.user_id}:`, workoutsError);
            continue;
          }

          const workoutsCompleted = workouts?.length || 0;
          const totalMinutes = workouts?.reduce((sum, w) => sum + (w.duration_minutes || 0), 0) || 0;
          const totalCalories = workouts?.reduce((sum, w) => sum + (w.calories_burned || 0), 0) || 0;

          // Check if goal achieved
          if (workoutsCompleted >= weeklyGoal) {
            // Check if notification already sent this week
            const { data: existingNotif } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', userPref.user_id)
              .eq('type', 'weekly_goal_achieved')
              .gte('created_at', weekStart.toISOString())
              .single();

            if (!existingNotif) {
              // Send weekly goal notification
              await createWeeklyGoalNotification(userPref.user_id, {
                workouts_completed: workoutsCompleted,
                weekly_goal: weeklyGoal,
                week_start: weekStartStr,
                week_end: weekEndStr,
                total_minutes: totalMinutes,
                total_calories: totalCalories
              });
              console.log(`✅ Weekly goal notification sent to user ${userPref.user_id}`);
            } else {
              console.log(`⏭️  Weekly goal notification already sent to user ${userPref.user_id} this week`);
            }
          }
        } catch (error) {
          console.error(`❌ Error processing weekly goal for user ${userPref.user_id}:`, error);
          // Continue with next user even if this one fails
        }
      }

      console.log(`✅ [Cron] Weekly goal check processed`);

    } catch (error) {
      console.error('❌ [Cron] Weekly goal check error:', error);
    }
  });

  console.log('✅ Weekly goal check cron job scheduled (runs daily at 11:59 PM)');
};

/**
 * Monthly Milestone Check - Phase 2
 * Runs daily at 11:59 PM to check for monthly milestones
 */
export const scheduleMonthlyMilestoneCheck = () => {
  // Run daily at 11:59 PM (23:59)
  cron.schedule('59 23 * * *', async () => {
    console.log('🔔 [Cron] Checking monthly milestones...');

    try {
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);

      const monthStartStr = monthStart.toISOString().split('T')[0];
      const monthEndStr = monthEnd.toISOString().split('T')[0];
      const monthName = monthStart.toLocaleString('default', { month: 'long', year: 'numeric' });

      // Milestone thresholds
      const milestones = [10, 15, 20, 25, 30];

      // Get users with monthly milestone enabled
      const { data: users, error: usersError } = await supabase
        .from('notification_preferences')
        .select('user_id')
        .eq('monthly_milestone_enabled', true);

      if (usersError) {
        console.error('❌ Error fetching users for monthly milestones:', usersError);
        return;
      }

      console.log(`Checking ${users?.length || 0} users for monthly milestones`);

      for (const userPref of users || []) {
        try {
          // Count completed workouts this month via workout_plans JOIN
          const { data: workouts, error: workoutsError } = await supabase
            .from('daily_workouts')
            .select('id, duration_minutes, calories_burned, workout_plans!inner(user_id)')
            .eq('workout_plans.user_id', userPref.user_id)
            .eq('is_completed', true)
            .gte('scheduled_date', monthStartStr)
            .lte('scheduled_date', monthEndStr)
            .is('workout_type', null); // Not rest days

          if (workoutsError) {
            console.error(`❌ Error fetching workouts for user ${userPref.user_id}:`, workoutsError);
            continue;
          }

          const workoutsCount = workouts?.length || 0;
          const totalMinutes = workouts?.reduce((sum, w) => sum + (w.duration_minutes || 0), 0) || 0;
          const totalCalories = workouts?.reduce((sum, w) => sum + (w.calories_burned || 0), 0) || 0;

          // Check if user hit a milestone
          for (const milestone of milestones) {
            if (workoutsCount === milestone) {
              // Check if notification already sent for this milestone this month
              const { data: existingNotif } = await supabase
                .from('notifications')
                .select('id')
                .eq('user_id', userPref.user_id)
                .eq('type', 'monthly_milestone')
                .gte('created_at', monthStart.toISOString())
                .eq('metadata->>workouts_count', milestone.toString())
                .single();

              if (!existingNotif) {
                // Send monthly milestone notification
                await createMonthlyMilestoneNotification(userPref.user_id, {
                  workouts_count: workoutsCount,
                  month: monthName,
                  total_minutes: totalMinutes,
                  total_calories: totalCalories
                });
                console.log(`✅ Monthly milestone (${milestone}) notification sent to user ${userPref.user_id}`);
              } else {
                console.log(`⏭️  Milestone ${milestone} notification already sent to user ${userPref.user_id} this month`);
              }
            }
          }
        } catch (error) {
          console.error(`❌ Error processing monthly milestone for user ${userPref.user_id}:`, error);
          // Continue with next user even if this one fails
        }
      }

      console.log(`✅ [Cron] Monthly milestone check processed`);

    } catch (error) {
      console.error('❌ [Cron] Monthly milestone check error:', error);
    }
  });

  console.log('✅ Monthly milestone check cron job scheduled (runs daily at 11:59 PM)');
};

/**
 * Weekly Progress Report - Phase 3
 * Runs every Sunday at 6 PM
 */
export const scheduleWeeklyProgressReport = () => {
  // Run every Sunday at 6 PM (18:00)
  cron.schedule('0 18 * * 0', async () => {
    console.log('🔔 [Cron] Generating weekly progress reports...');

    try {
      const today = new Date();

      // Calculate this week (Monday to Sunday)
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 6); // Last Monday
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(today);
      weekEnd.setHours(23, 59, 59, 999);

      const weekStartStr = weekStart.toISOString().split('T')[0];
      const weekEndStr = weekEnd.toISOString().split('T')[0];

      // Get users with weekly report enabled
      const { data: users, error: usersError } = await supabase
        .from('notification_preferences')
        .select('user_id, weekly_report_day, weekly_report_time')
        .eq('weekly_report_enabled', true);

      if (usersError) {
        console.error('❌ Error fetching users for weekly reports:', usersError);
        return;
      }

      console.log(`Generating weekly reports for ${users?.length || 0} users`);

      for (const userPref of users || []) {
        try {
          // Get this week's completed workouts via workout_plans JOIN
          const { data: workouts, error: workoutsError } = await supabase
            .from('daily_workouts')
            .select('id, workout_name, duration_minutes, calories_burned, difficulty, workout_plans!inner(user_id)')
            .eq('workout_plans.user_id', userPref.user_id)
            .eq('is_completed', true)
            .gte('scheduled_date', weekStartStr)
            .lte('scheduled_date', weekEndStr)
            .is('workout_type', null); // Not rest days

          if (workoutsError) {
            console.error(`❌ Error fetching workouts for user ${userPref.user_id}:`, workoutsError);
            continue;
          }

          const workoutsCompleted = workouts?.length || 0;

          // Skip if no workouts this week
          if (workoutsCompleted === 0) {
            console.log(`⏭️  No workouts for user ${userPref.user_id} this week - skipping report`);
            continue;
          }

          const totalMinutes = workouts?.reduce((sum, w) => sum + (w.duration_minutes || 0), 0) || 0;
          const totalCalories = workouts?.reduce((sum, w) => sum + (w.calories_burned || 0), 0) || 0;

          // Calculate average difficulty
          const workoutsWithDifficulty = workouts?.filter(w => w.difficulty) || [];
          const avgDifficulty = workoutsWithDifficulty.length > 0
            ? workoutsWithDifficulty.reduce((sum, w) => sum + w.difficulty, 0) / workoutsWithDifficulty.length
            : 0;

          // Find most common workout time
          const timeMap = {};
          workouts?.forEach(w => {
            if (w.scheduled_time) {
              const hour = w.scheduled_time.split(':')[0];
              timeMap[hour] = (timeMap[hour] || 0) + 1;
            }
          });
          const mostCommonHour = Object.keys(timeMap).reduce((a, b) =>
            timeMap[a] > timeMap[b] ? a : b, '00'
          );
          const mostCommonTime = `${mostCommonHour}:00`;

          // Check if report already sent this week
          const { data: existingNotif } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', userPref.user_id)
            .eq('type', 'weekly_report')
            .gte('created_at', weekStart.toISOString())
            .single();

          if (!existingNotif) {
            // Send weekly report notification
            await createWeeklyReportNotification(userPref.user_id, {
              workouts_completed: workoutsCompleted,
              total_minutes: totalMinutes,
              total_calories: totalCalories,
              avg_difficulty: Math.round(avgDifficulty * 10) / 10,
              most_common_time: mostCommonTime
            });
            console.log(`✅ Weekly report sent to user ${userPref.user_id}`);
          } else {
            console.log(`⏭️  Weekly report already sent to user ${userPref.user_id} this week`);
          }
        } catch (error) {
          console.error(`❌ Error processing weekly report for user ${userPref.user_id}:`, error);
          // Continue with next user even if this one fails
        }
      }

      console.log(`✅ [Cron] Weekly progress reports processed`);

    } catch (error) {
      console.error('❌ [Cron] Weekly progress report error:', error);
    }
  });

  console.log('✅ Weekly progress report cron job scheduled (runs every Sunday at 6 PM)');
};

/**
 * Inactive User Alert - Phase 3
 * Runs daily at 10 AM to check for inactive users (3+ days)
 */
export const scheduleInactiveUserAlerts = () => {
  // Run daily at 10 AM (10:00)
  cron.schedule('0 10 * * *', async () => {
    console.log('🔔 [Cron] Checking for inactive users...');

    try {
      // Get users with inactive alerts enabled
      const { data: users, error: usersError } = await supabase
        .from('notification_preferences')
        .select('user_id, inactive_alert_threshold')
        .eq('inactive_alert_enabled', true);

      if (usersError) {
        console.error('❌ Error fetching users for inactive alerts:', usersError);
        return;
      }

      console.log(`Checking ${users?.length || 0} users for inactivity`);

      for (const userPref of users || []) {
        try {
          const inactiveThreshold = userPref.inactive_alert_threshold || 3; // Default 3 days

          // Get user's last completed workout via workout_plans JOIN
          const { data: lastWorkout, error: workoutError } = await supabase
            .from('daily_workouts')
            .select('scheduled_date, workout_name, completed_at, workout_plans!inner(user_id)')
            .eq('workout_plans.user_id', userPref.user_id)
            .eq('is_completed', true)
            .is('workout_type', null) // Not rest days
            .order('scheduled_date', { ascending: false })
            .limit(1)
            .single();

          if (workoutError && workoutError.code !== 'PGRST116') {
            // PGRST116 = no rows (user never worked out)
            console.error(`❌ Error fetching last workout for user ${userPref.user_id}:`, workoutError);
            continue;
          }

          if (!lastWorkout) {
            console.log(`⏭️  User ${userPref.user_id} has no workout history - skipping`);
            continue;
          }

          // Calculate days since last workout
          const lastWorkoutDate = new Date(lastWorkout.scheduled_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const daysSinceLastWorkout = Math.floor((today - lastWorkoutDate) / (1000 * 60 * 60 * 24));

          if (daysSinceLastWorkout >= inactiveThreshold) {
            // Check if inactive alert already sent recently (within the last inactive_threshold days)
            const thresholdDaysAgo = new Date();
            thresholdDaysAgo.setDate(thresholdDaysAgo.getDate() - inactiveThreshold);

            const { data: existingNotif } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', userPref.user_id)
              .eq('type', 'inactive_alert')
              .gte('created_at', thresholdDaysAgo.toISOString())
              .single();

            if (!existingNotif) {
              // Send inactive alert notification
              await createInactiveAlertNotification(userPref.user_id, {
                days_inactive: daysSinceLastWorkout,
                last_workout_date: lastWorkout.scheduled_date,
                last_workout_name: lastWorkout.workout_name
              });
              console.log(`✅ Inactive alert sent to user ${userPref.user_id} (${daysSinceLastWorkout} days)`);
            } else {
              console.log(`⏭️  Inactive alert already sent to user ${userPref.user_id} recently`);
            }
          } else {
            console.log(`⏭️  User ${userPref.user_id} is active (${daysSinceLastWorkout} days since last workout)`);
          }
        } catch (error) {
          console.error(`❌ Error processing inactive alert for user ${userPref.user_id}:`, error);
          // Continue with next user even if this one fails
        }
      }

      console.log(`✅ [Cron] Inactive user alerts processed`);

    } catch (error) {
      console.error('❌ [Cron] Inactive user alert error:', error);
    }
  });

  console.log('✅ Inactive user alerts cron job scheduled (runs daily at 10 AM)');
};

/**
 * Recovery Reminder - Phase 3
 * Runs daily at 7 PM to check for users who need rest
 */
export const scheduleRecoveryReminders = () => {
  // Run daily at 7 PM (19:00)
  cron.schedule('0 19 * * *', async () => {
    console.log('🔔 [Cron] Checking for users who need recovery...');

    try {
      const today = getToday();

      // Get users with recovery reminders enabled
      const { data: users, error: usersError} = await supabase
        .from('notification_preferences')
        .select('user_id')
        .eq('recovery_reminder_enabled', true);

      if (usersError) {
        console.error('❌ Error fetching users for recovery reminders:', usersError);
        return;
      }

      console.log(`Checking ${users?.length || 0} users for recovery needs`);

      for (const userPref of users || []) {
        try {
          // Get last 7 days to check for consecutive workouts
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

          // Get completed workouts in the last 7 days via workout_plans JOIN
          const { data: recentWorkouts, error: workoutsError } = await supabase
            .from('daily_workouts')
            .select('scheduled_date, duration_minutes, workout_plans!inner(user_id)')
            .eq('workout_plans.user_id', userPref.user_id)
            .eq('is_completed', true)
            .gte('scheduled_date', sevenDaysAgoStr)
            .lte('scheduled_date', today)
            .is('workout_type', null) // Not rest days
            .order('scheduled_date', { ascending: false });

          if (workoutsError) {
            console.error(`❌ Error fetching workouts for user ${userPref.user_id}:`, workoutsError);
            continue;
          }

          if (!recentWorkouts || recentWorkouts.length < 5) {
            console.log(`⏭️  User ${userPref.user_id} has not worked out enough days - skipping`);
            continue;
          }

          // Check for consecutive days (starting from today, going backwards)
          let consecutiveDays = 0;
          const sortedDates = recentWorkouts.map(w => w.scheduled_date).sort().reverse();

          for (let i = 0; i < sortedDates.length; i++) {
            const workoutDate = new Date(sortedDates[i]);
            const expectedDate = new Date();
            expectedDate.setDate(expectedDate.getDate() - i);
            const expectedDateStr = expectedDate.toISOString().split('T')[0];

            if (sortedDates[i] === expectedDateStr) {
              consecutiveDays++;
            } else {
              break; // Consecutive streak broken
            }
          }

          if (consecutiveDays >= 5) {
            // Calculate week stats
            const thisWeekWorkouts = recentWorkouts.filter(w => {
              const workoutDate = new Date(w.scheduled_date);
              const weekStart = new Date();
              weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
              weekStart.setHours(0, 0, 0, 0);
              return workoutDate >= weekStart;
            });

            const workoutsThisWeek = thisWeekWorkouts.length;
            const totalMinutesThisWeek = thisWeekWorkouts.reduce((sum, w) => sum + (w.duration_minutes || 0), 0);

            // Check if recovery reminder already sent in the last 3 days
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

            const { data: existingNotif } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', userPref.user_id)
              .eq('type', 'recovery_reminder')
              .gte('created_at', threeDaysAgo.toISOString())
              .single();

            if (!existingNotif) {
              // Send recovery reminder notification
              await createRecoveryReminderNotification(userPref.user_id, {
                consecutive_days: consecutiveDays,
                workouts_this_week: workoutsThisWeek,
                total_minutes_this_week: totalMinutesThisWeek
              });
              console.log(`✅ Recovery reminder sent to user ${userPref.user_id} (${consecutiveDays} consecutive days)`);
            } else {
              console.log(`⏭️  Recovery reminder already sent to user ${userPref.user_id} recently`);
            }
          } else {
            console.log(`⏭️  User ${userPref.user_id} has ${consecutiveDays} consecutive days - not enough for recovery reminder`);
          }
        } catch (error) {
          console.error(`❌ Error processing recovery reminder for user ${userPref.user_id}:`, error);
          // Continue with next user even if this one fails
        }
      }

      console.log(`✅ [Cron] Recovery reminders processed`);

    } catch (error) {
      console.error('❌ [Cron] Recovery reminder error:', error);
    }
  });

  console.log('✅ Recovery reminder cron job scheduled (runs daily at 7 PM)');
};

// ============================================================================
// CRON JOB MANAGER
// ============================================================================

/**
 * Start all cron jobs based on phase
 * @param {string} phase - 'phase1', 'phase2', 'phase3', or 'all'
 */
export const startCronJobs = (phase = 'phase1') => {
  console.log(`\n🚀 Starting cron jobs for: ${phase}`);
  console.log(`⏰ Current time: ${new Date().toISOString()}`);
  console.log('════════════════════════════════════════════════\n');

  if (phase === 'phase1' || phase === 'all') {
    console.log('📋 PHASE 1: Core Reminders');
    scheduleDailyWorkoutReminders();
    scheduleUpcomingWorkoutReminders();
    console.log('');
  }

  if (phase === 'phase2' || phase === 'all') {
    console.log('📋 PHASE 2: Achievements & Consistency');
    scheduleMissedWorkoutReminders();
    scheduleWeeklyGoalCheck();
    scheduleMonthlyMilestoneCheck();
    console.log('');
  }

  if (phase === 'phase3' || phase === 'all') {
    console.log('📋 PHASE 3: Insights & Re-engagement');
    scheduleWeeklyProgressReport();
    scheduleInactiveUserAlerts();
    scheduleRecoveryReminders();
    console.log('');
  }

  console.log('════════════════════════════════════════════════');
  console.log('✅ All cron jobs for', phase, 'started successfully\n');
};

/**
 * Stop all cron jobs (for graceful shutdown)
 */
export const stopCronJobs = () => {
  console.log('🛑 Stopping all cron jobs...');
  cron.getTasks().forEach(task => task.stop());
  console.log('✅ All cron jobs stopped');
};

export default {
  startCronJobs,
  stopCronJobs,
  scheduleDailyWorkoutReminders,
  scheduleUpcomingWorkoutReminders,
  scheduleMissedWorkoutReminders,
  scheduleWeeklyGoalCheck,
  scheduleMonthlyMilestoneCheck,
  scheduleWeeklyProgressReport,
  scheduleInactiveUserAlerts,
  scheduleRecoveryReminders
};

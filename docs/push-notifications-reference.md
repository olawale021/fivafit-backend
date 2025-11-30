# Push Notifications Reference

Complete documentation of all push notification types sent in the Fivafit app, including their titles, bodies, and when they are triggered.

## Social Notifications
**Channel ID:** `social-notifications`

### 1. New Like
- **Title:** `❤️ New Like`
- **Body:** `{username} liked your workout post`
- **When:** User receives a like on their post
- **Data:**
  - `type`: `like`
  - `postId`: Post ID
  - `screen`: `post-detail`

### 2. New Comment
- **Title:** `💬 New Comment`
- **Body:** `{username} commented on your post`
- **When:** User receives a comment on their post
- **Data:**
  - `type`: `comment`
  - `postId`: Post ID
  - `commentId`: Comment ID
  - `screen`: `post-detail`

### 3. New Reply
- **Title:** `↩️ New Reply`
- **Body:** `{username} replied to your comment`
- **When:** User receives a reply to their comment
- **Data:**
  - `type`: `reply`
  - `postId`: Post ID
  - `commentId`: Reply ID
  - `screen`: `post-detail`

### 4. New Follower
- **Title:** `👤 New Follower`
- **Body:** `{username} started following you`
- **When:** User gains a new follower
- **Data:**
  - `type`: `follow`
  - `screen`: `profile`

---

## Workout Notifications
**Channel ID:** `workout-notifications`

### 5. Daily Workout Reminder
- **Title:** `Time to crush it!`
- **Body:** `{workout_name} is scheduled for today`
- **When:** Scheduled at 9:00 AM daily
- **Data:**
  - `type`: `workout_reminder_daily`
  - `workoutId`: Workout ID
  - `screen`: `workout-detail`

### 6. Upcoming Workout Reminder
- **Title:** `Get ready!`
- **Body:** `{workout_name} starts in 1 hour`
- **When:** 1 hour before scheduled workout
- **Data:**
  - `type`: `workout_reminder_upcoming`
  - `workoutId`: Workout ID
  - `screen`: `workout-detail`

### 7. Missed Workout Reminder
- **Title:** `You still have time!`
- **Body:** `Complete today's workout before midnight`
- **When:** Scheduled at 8:00 PM if workout not completed
- **Data:**
  - `type`: `workout_reminder_missed`
  - `workoutId`: Workout ID
  - `screen`: `workout-detail`

### 8. Rest Day Reminder
- **Title:** `Rest Day`
- **Body:** `Today is your rest day. Recovery is progress too!`
- **When:** On scheduled rest days
- **Data:**
  - `type`: `workout_reminder_rest`
  - `workoutId`: Workout ID
  - `screen`: `workout-detail`

### 9. Workout Completed
- **Title:** `Amazing work! 🎉`
- **Body:** `{workout_name} completed in {duration} min` (with optional calories: `- {calories} cal burned 🔥`)
- **When:** Immediately after user completes a workout
- **Data:**
  - `type`: `workout_completed`
  - `completionId`: Completion ID
  - `screen`: `workout-summary`

### 10. Weekly Goal Achieved
- **Title:** `Weekly Goal Crushed! 🏆`
- **Body:** `{workouts_completed}/{weekly_goal} workouts completed this week`
- **When:** When user completes their weekly workout goal
- **Data:**
  - `type`: `weekly_goal_achieved`
  - `screen`: `weekly-summary`

### 11. Monthly Milestone
- **Title:** `Monthly Milestone! 🚀`
- **Body:** `{workouts_count} workouts completed in {month}`
- **When:** At the end of each month with workout summary
- **Data:**
  - `type`: `monthly_milestone`
  - `screen`: `monthly-summary`

### 12. New Plan Generated
- **Title:** `New Plan Ready! 📋`
- **Body:** `Your {plan_name} plan is ready to start`
- **When:** After AI workout plan is generated
- **Data:**
  - `type`: `plan_generated`
  - `planId`: Plan ID
  - `screen`: `plan-detail`

### 13. Weekly Report
- **Title:** `Your Weekly Summary 📊`
- **Body:** `{workouts_completed} workouts, {total_minutes} min active time this week`
- **When:** End of week (Sunday evening)
- **Data:**
  - `type`: `weekly_report`
  - `screen`: `weekly-report`

### 14. Inactive Alert
- **Title:** `We miss you! 😊`
- **Body:** `It's been {days_inactive} days since your last workout`
- **When:** After user has been inactive for X days (configurable)
- **Data:**
  - `type`: `inactive_alert`
  - `screen`: `workout-planner`

### 15. Recovery Reminder
- **Title:** `Time to Recover 🛌`
- **Body:** `You've worked out {consecutive_days} days straight. Consider a rest day!`
- **When:** After user works out for many consecutive days
- **Data:**
  - `type`: `recovery_reminder`
  - `screen`: `home`

---

## Notification Preferences

All notifications respect the following user preferences from the `notification_preferences` table:

### Master Control
- **push_enabled** - Master switch for all push notifications

### Daily Reminders
- **daily_reminder_enabled** - Daily workout reminder (9 AM)
- **upcoming_reminder_enabled** - Upcoming workout (1 hour before)
- **missed_reminder_enabled** - Missed workout (8 PM)
- **rest_day_reminder_enabled** - Rest day reminder

### Achievements & Milestones
- **workout_completed_enabled** - Workout completed celebration
- **weekly_goal_enabled** - Weekly goal achievement
- **monthly_milestone_enabled** - Monthly milestone

### Planning & Reports
- **plan_generated_enabled** - New plan ready notification
- **weekly_report_enabled** - Weekly summary report

### Health & Wellness
- **inactive_alert_enabled** - Inactive user alert
- **recovery_reminder_enabled** - Recovery/rest reminder

### Additional Controls
- **quiet_hours_enabled** - Enable quiet hours (no notifications)
- **quiet_hours_start** - Quiet hours start time (e.g., "22:00")
- **quiet_hours_end** - Quiet hours end time (e.g., "07:00")

---

## Technical Implementation

### Push Notification Flow
1. Check if user has `push_token` set
2. Check if user has `push_notifications_enabled = true`
3. Check specific notification preference (e.g., `daily_reminder_enabled`)
4. Check if current time is in quiet hours
5. Validate Expo push token format
6. Send notification via Expo Push Notifications API
7. Mark notification as `push_sent = true`
8. Handle errors (invalid token, device not registered, etc.)

### Notification Channels (Android)
- **default** - Default channel for miscellaneous notifications
- **social-notifications** - Social interactions (likes, comments, follows)
- **workout-notifications** - Workout-related notifications (reminders, achievements)

### Data Payload
Every push notification includes:
- **to** - Expo push token
- **sound** - `default`
- **title** - Notification title
- **body** - Notification body
- **data** - Custom data object with type, IDs, and screen routing
- **badge** - Badge count (set to 1)
- **priority** - `high`
- **channelId** - Android notification channel

---

## Files Reference

### Backend
- `/src/services/pushNotificationService.js` - Core push notification sending logic
- `/src/services/notificationService.js` - Notification creation and management
- `/src/controllers/notificationsController.js` - API endpoints for notifications

### Mobile App
- `/services/notificationService.ts` - Mobile notification service
- `/app/notifications.tsx` - Notification preferences UI
- `/app/social-notifications.tsx` - Social notifications feed

---

## Examples

### Example 1: Daily Reminder
```javascript
await createWorkoutReminderNotification(userId, {
  id: 'workout-123',
  workout_name: 'Full Body Strength',
  scheduled_date: '2025-11-30',
  estimated_duration_minutes: 45
}, 'daily')
```

**Push Notification:**
- Title: `Time to crush it!`
- Body: `Full Body Strength is scheduled for today`

### Example 2: Workout Completed
```javascript
await createWorkoutCompletedNotification(userId, {
  id: 'completion-456',
  workout_name: 'HIIT Cardio',
  duration_minutes: 30,
  calories_burned: 250
})
```

**Push Notification:**
- Title: `Amazing work! 🎉`
- Body: `HIIT Cardio completed in 30 min - 250 cal burned 🔥`

### Example 3: New Follower
```javascript
await createFollowNotification(followedUserId, followerId)
```

**Push Notification:**
- Title: `New Follower`
- Body: `john_doe started following you`

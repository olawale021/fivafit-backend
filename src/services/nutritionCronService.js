/**
 * Nutrition Cron Service
 * Sends meal logging reminders at 9am, 2pm, and 8pm in each user's local timezone
 * Each meal reminder can be individually enabled/disabled
 */

import cron from 'node-cron'
import { supabase } from '../config/supabase.js'
import { sendPushNotification } from './pushNotificationService.js'

const MEAL_SLOTS = {
  breakfast: {
    hour: 9,
    field: 'breakfast_reminder_enabled',
    title: 'Log Your Breakfast',
    messages: [
      "Good morning! Don't forget to log your breakfast.",
      "Start your day right — log what you ate this morning.",
      "Breakfast logged? Track your morning meal now.",
      "Rise and fuel! Log your breakfast to stay on track.",
    ],
  },
  lunch: {
    hour: 14,
    field: 'lunch_reminder_enabled',
    title: 'Log Your Lunch',
    messages: [
      "Lunchtime! Log your meal to keep your nutrition on track.",
      "Don't forget to log your lunch — every meal counts.",
      "Midday check-in: have you logged your lunch yet?",
      "Stay consistent — log your afternoon meal now.",
    ],
  },
  dinner: {
    hour: 20,
    field: 'dinner_reminder_enabled',
    title: 'Log Your Dinner',
    messages: [
      "Time to log your dinner before you wind down.",
      "End your day strong — log your evening meal.",
      "Don't forget dinner! Log it to complete your daily nutrition.",
      "Almost done for the day — log your dinner now.",
    ],
  },
}

function getRandomMessage(messages) {
  return messages[Math.floor(Math.random() * messages.length)]
}

/**
 * Get the current hour (0-23) in a user's timezone
 */
function getUserLocalHour(nowUTC, timezone) {
  try {
    if (!timezone) return null
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    })
    return parseInt(formatter.format(nowUTC))
  } catch {
    return null
  }
}

/**
 * Runs every hour — checks which users should get meal reminders based on their local time
 */
async function sendMealRemindersForCurrentHour() {
  try {
    const nowUTC = new Date()

    for (const [slot, config] of Object.entries(MEAL_SLOTS)) {
      // Fetch users who have this specific meal reminder enabled
      const { data: users, error } = await supabase
        .from('notification_preferences')
        .select('user_id, timezone')
        .eq(config.field, true)

      if (error) {
        console.error(`[NutritionCron] Error fetching users for ${slot}:`, error)
        continue
      }

      if (!users || users.length === 0) continue

      let sent = 0
      for (const user of users) {
        try {
          const userLocalHour = getUserLocalHour(nowUTC, user.timezone)
          if (userLocalHour !== config.hour) continue

          await sendPushNotification(user.user_id, {
            title: config.title,
            body: getRandomMessage(config.messages),
            data: {
              type: 'meal_reminder',
              screen: 'log-food',
            },
            channelId: 'default',
          })
          sent++
        } catch (err) {
          console.error(`[NutritionCron] Error sending ${slot} to user ${user.user_id}:`, err)
        }
      }

      if (sent > 0) {
        console.log(`[NutritionCron] Sent "${config.title}" to ${sent} user(s)`)
      }
    }
  } catch (error) {
    console.error('[NutritionCron] Error in sendMealRemindersForCurrentHour:', error)
  }
}

export const startNutritionCronJobs = () => {
  cron.schedule('0 * * * *', () => {
    console.log('[NutritionCron] Checking meal reminders for current hour...')
    sendMealRemindersForCurrentHour()
  })

  console.log('✅ Nutrition meal reminder cron job scheduled (hourly timezone check)')
}

export default { startNutritionCronJobs }

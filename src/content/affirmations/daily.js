/**
 * Daily Positivity Affirmations
 * Sent every day at user's preferred time (default: 10am & 9pm)
 * Tone: Positive, uplifting, identity-building
 * Total: 50 messages (10 per category)
 */

// ===== CATEGORY 1: IDENTITY BUILDING (10) =====
const identityBuildingAffirmations = [
  {
    id: 'identity_1',
    text: "You're becoming someone who shows up for themselves."
  },
  {
    id: 'identity_2',
    text: "You're not just working out. You're becoming someone who doesn't quit."
  },
  {
    id: 'identity_3',
    text: "You're building a new version of yourself - one workout at a time."
  },
  {
    id: 'identity_4',
    text: "Every time you show up, you're proving who you're becoming."
  },
  {
    id: 'identity_5',
    text: "You're not the person who quits anymore. You're the person who comes back."
  },
  {
    id: 'identity_6',
    text: "You're transforming into someone who keeps promises to themselves."
  },
  {
    id: 'identity_7',
    text: "This is who you are now: someone who doesn't give up."
  },
  {
    id: 'identity_8',
    text: "You're building the most important relationship - the one with yourself."
  },
  {
    id: 'identity_9',
    text: "Every workout is a vote for the person you're becoming."
  },
  {
    id: 'identity_10',
    text: "You're not trying to be fit. You're becoming someone who values themselves."
  }
];

// ===== CATEGORY 2: PROGRESS & CONSISTENCY (10) =====
const progressConsistencyAffirmations = [
  {
    id: 'progress_1',
    text: "Every single workout is changing you - even when you can't see it yet."
  },
  {
    id: 'progress_2',
    text: "Progress happens in moments you can't photograph. Keep going."
  },
  {
    id: 'progress_3',
    text: "Your body is adapting. Your mind is strengthening. Trust the process."
  },
  {
    id: 'progress_4',
    text: "Small steps, taken daily, create unstoppable momentum."
  },
  {
    id: 'streak_1',
    text: "{streak} days strong. Consistency is who you're becoming.",
    requiresStreak: true
  },
  {
    id: 'streak_2',
    text: "{streak} days in a row. That's not luck - that's discipline.",
    requiresStreak: true
  },
  {
    id: 'recent_1',
    text: "{recentWorkouts} workouts this week. You're building something real.",
    requiresRecentWorkouts: true
  },
  {
    id: 'recent_2',
    text: "{recentWorkouts} times this week you chose movement. That's powerful.",
    requiresRecentWorkouts: true
  },
  {
    id: 'progress_5',
    text: "You're not just getting stronger. You're becoming consistent."
  },
  {
    id: 'progress_6',
    text: "Each workout builds on the last. You're compounding your strength."
  }
];

// ===== CATEGORY 3: COMEBACK & RESILIENCE (10) =====
const comebackResilienceAffirmations = [
  {
    id: 'comeback_1',
    text: "You've come back {comebackCount} times. That's the skill that changes everything.",
    requiresComebacks: true
  },
  {
    id: 'comeback_2',
    text: "{comebackCount} comebacks and still going. You're unstoppable.",
    requiresComebacks: true
  },
  {
    id: 'comeback_3',
    text: "Most people quit. You've come back {comebackCount} times. You're different.",
    requiresComebacks: true
  },
  {
    id: 'resilience_1',
    text: "You're not just building muscle. You're building mental toughness."
  },
  {
    id: 'resilience_2',
    text: "Every workout where you didn't feel like it? That's where real strength comes from."
  },
  {
    id: 'resilience_3',
    text: "Champions aren't made on good days. They're made on days like today."
  },
  {
    id: 'resilience_4',
    text: "Showing up when it's hard is what separates you from everyone else."
  },
  {
    id: 'resilience_5',
    text: "The comeback is always stronger than the setback."
  },
  {
    id: 'resilience_6',
    text: "You've proven you can start again. That's the most valuable skill."
  },
  {
    id: 'resilience_7',
    text: "Setbacks don't define you. Coming back does."
  }
];

// ===== CATEGORY 4: ANTI-PERFECTION & DOUBT DESTROYER (10) =====
const antiPerfectionAffirmations = [
  {
    id: 'imperfect_1',
    text: "You don't need to be perfect. Showing up is already a win."
  },
  {
    id: 'imperfect_2',
    text: "Done is better than perfect. Movement beats stillness every time."
  },
  {
    id: 'imperfect_3',
    text: "Five minutes of imperfect effort beats zero minutes of perfect planning."
  },
  {
    id: 'imperfect_4',
    text: "You don't need to feel ready. You just need to start."
  },
  {
    id: 'doubt_1',
    text: "Doubt will always whisper. Movement silences it."
  },
  {
    id: 'doubt_2',
    text: "The voice that says 'not today' gets quieter every time you ignore it."
  },
  {
    id: 'doubt_3',
    text: "Turn doubt into movement. It's the only way through."
  },
  {
    id: 'doubt_4',
    text: "Your doubt is loud, but your action is louder."
  },
  {
    id: 'imperfect_5',
    text: "Messy progress is still progress. Just start."
  },
  {
    id: 'doubt_5',
    text: "Doubt is normal. Choosing to move anyway is powerful."
  }
];

// ===== CATEGORY 5: FUTURE SELF & MOTIVATION (10) =====
const futureSelfAffirmations = [
  {
    id: 'future_1',
    text: "Future you is grateful for what you do today."
  },
  {
    id: 'future_2',
    text: "Six months from now, you'll thank yourself for not quitting today."
  },
  {
    id: 'future_3',
    text: "Every workout is a gift to your future self."
  },
  {
    id: 'future_4',
    text: "The best investment you can make? Showing up for yourself today."
  },
  {
    id: 'energy_1',
    text: "You've never regretted a workout. You've only regretted skipping one."
  },
  {
    id: 'energy_2',
    text: "Movement creates energy. Even when you feel tired, start anyway."
  },
  {
    id: 'energy_3',
    text: "The hardest part is starting. After that, your body takes over."
  },
  {
    id: 'energy_4',
    text: "Tired? Move anyway. Energy follows action, not the other way around."
  },
  {
    id: 'future_5',
    text: "You're building a future where you're proud of who you've become."
  },
  {
    id: 'energy_5',
    text: "Remember how good you felt after your last workout? Go find that feeling again."
  }
];

// ===== COMBINED EXPORT =====
const dailyAffirmations = [
  ...identityBuildingAffirmations,
  ...progressConsistencyAffirmations,
  ...comebackResilienceAffirmations,
  ...antiPerfectionAffirmations,
  ...futureSelfAffirmations
];

export {
  dailyAffirmations,
  identityBuildingAffirmations,
  progressConsistencyAffirmations,
  comebackResilienceAffirmations,
  antiPerfectionAffirmations,
  futureSelfAffirmations
};

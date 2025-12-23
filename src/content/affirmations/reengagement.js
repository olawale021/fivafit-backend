/**
 * Re-engagement Motivation Messages
 * Sent when user hasn't opened app in 2+ days
 * Tone: Motivational about fitness/movement (NOT about the app)
 * Total: 50 messages (10 per category)
 */

// ===== CATEGORY 1: MOVEMENT & FEELING (10) =====
const movementFeelingMessages = [
  {
    id: 'movement_1',
    text: "Your body misses moving. Even 5 minutes today would feel amazing."
  },
  {
    id: 'movement_2',
    text: "Remember how good you felt after your last workout? That feeling is waiting for you."
  },
  {
    id: 'movement_3',
    text: "Movement is medicine. Your body is ready when you are."
  },
  {
    id: 'movement_4',
    text: "You know that post-workout feeling? It's just one decision away."
  },
  {
    id: 'movement_5',
    text: "Your muscles remember. They're ready to move again."
  },
  {
    id: 'movement_6',
    text: "Ten minutes of movement can change your entire day. Start now."
  },
  {
    id: 'movement_7',
    text: "Your body was built to move. Give it what it needs today."
  },
  {
    id: 'movement_8',
    text: "That energy you're looking for? It comes from movement, not rest."
  },
  {
    id: 'movement_9',
    text: "You've felt the rush before. Go find it again today."
  },
  {
    id: 'movement_10',
    text: "Moving your body isn't a luxury. It's how you take care of yourself."
  }
];

// ===== CATEGORY 2: COMEBACK & RESTART (10) =====
const comebackRestartMessages = [
  {
    id: 'comeback_restart_1',
    text: "You've come back {comebackCount} times before. This is just another comeback.",
    requiresComebacks: true
  },
  {
    id: 'comeback_restart_2',
    text: "Every champion has comeback stories. This is yours starting now."
  },
  {
    id: 'comeback_restart_3',
    text: "It's been {daysSince} days. The hardest part is starting. You've got this."
  },
  {
    id: 'comeback_restart_4',
    text: "Momentum builds from one decision. Make the decision to move today."
  },
  {
    id: 'comeback_restart_5',
    text: "Starting again isn't failure. It's the most powerful skill you have."
  },
  {
    id: 'comeback_restart_6',
    text: "The gap doesn't matter. What matters is what you do next."
  },
  {
    id: 'comeback_restart_7',
    text: "You've restarted before and won. Do it again."
  },
  {
    id: 'comeback_restart_8',
    text: "Every restart is practice for never quitting. This is your practice."
  },
  {
    id: 'comeback_restart_9',
    text: "Life interrupted. Now life continues. Move today."
  },
  {
    id: 'comeback_restart_10',
    text: "The best time to restart was yesterday. The second best time is right now."
  }
];

// ===== CATEGORY 3: IDENTITY & STRENGTH (10) =====
const identityStrengthMessages = [
  {
    id: 'identity_strength_1',
    text: "You're someone who doesn't quit on themselves. Prove it today."
  },
  {
    id: 'identity_strength_2',
    text: "You've built something real. Don't let it slip away - move today."
  },
  {
    id: 'identity_strength_3',
    text: "Life got busy. That's okay. But your strength is still waiting. Go find it."
  },
  {
    id: 'identity_strength_4',
    text: "You're not starting over. You're continuing from where you left off."
  },
  {
    id: 'identity_strength_5',
    text: "The person who started this journey is still inside you. Wake them up."
  },
  {
    id: 'identity_strength_6',
    text: "Your strength didn't disappear. It's been waiting for you to return."
  },
  {
    id: 'identity_strength_7',
    text: "You built discipline before. It's still there. Access it today."
  },
  {
    id: 'identity_strength_8',
    text: "You're not the person who quits. You're the person who comes back."
  },
  {
    id: 'identity_strength_9',
    text: "Every time you return, you prove who you really are."
  },
  {
    id: 'identity_strength_10',
    text: "Your commitment to yourself is being tested. Pass the test today."
  }
];

// ===== CATEGORY 4: SIMPLE START & ACTION (10) =====
const simpleStartMessages = [
  {
    id: 'simple_1',
    text: "You don't need a perfect plan. Just move your body for 10 minutes today."
  },
  {
    id: 'simple_2',
    text: "Don't overthink it. Just start. Your body knows what to do."
  },
  {
    id: 'simple_3',
    text: "Five minutes. That's all you need to break the pattern. Start now."
  },
  {
    id: 'simple_4',
    text: "Forget the perfect workout. Just move. Anything counts."
  },
  {
    id: 'simple_5',
    text: "You don't need equipment. You don't need time. You just need to start."
  },
  {
    id: 'simple_6',
    text: "One push-up breaks the cycle. One squat restarts the engine. Just begin."
  },
  {
    id: 'simple_7',
    text: "Waiting for the perfect moment? This is it. Move now."
  },
  {
    id: 'simple_8',
    text: "Small action beats perfect planning. Move your body today."
  },
  {
    id: 'simple_9',
    text: "The barrier is mental, not physical. Take one step. That's all."
  },
  {
    id: 'simple_10',
    text: "You don't need to feel motivated. You just need to move. Start small."
  }
];

// ===== CATEGORY 5: SELF-CARE & WORTH (10) =====
const selfCareWorthMessages = [
  {
    id: 'selfcare_1',
    text: "Taking care of yourself isn't selfish. Move today - you deserve it."
  },
  {
    id: 'selfcare_2',
    text: "You deserve to feel strong in your body. Give yourself that gift today."
  },
  {
    id: 'selfcare_3',
    text: "Moving your body is an act of self-love. Love yourself today."
  },
  {
    id: 'selfcare_4',
    text: "You've been taking care of everyone else. Take care of yourself now."
  },
  {
    id: 'selfcare_5',
    text: "Your health is worth 20 minutes. You're worth 20 minutes."
  },
  {
    id: 'selfcare_6',
    text: "Choosing to move is choosing to value yourself. Make that choice."
  },
  {
    id: 'selfcare_7',
    text: "You can't pour from an empty cup. Fill yours with movement today."
  },
  {
    id: 'selfcare_8',
    text: "Your future self needs you to move today. Don't let them down."
  },
  {
    id: 'selfcare_9',
    text: "Respecting your body means moving it. Show yourself respect today."
  },
  {
    id: 'selfcare_10',
    text: "You're investing in yourself every time you move. Invest today."
  }
];

// ===== COMBINED EXPORT =====
const reengagementMessages = [
  ...movementFeelingMessages,
  ...comebackRestartMessages,
  ...identityStrengthMessages,
  ...simpleStartMessages,
  ...selfCareWorthMessages
];

export {
  reengagementMessages,
  movementFeelingMessages,
  comebackRestartMessages,
  identityStrengthMessages,
  simpleStartMessages,
  selfCareWorthMessages
};

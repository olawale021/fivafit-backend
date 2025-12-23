/**
 * Affirmation Utilities
 * Helper functions for personalization and template selection
 */

/**
 * Replaces template tokens with actual user data
 * Tokens: {streak}, {comebackCount}, {recentWorkouts}, {victory}, {daysSince}
 */
export function personalizeMessage(template, context) {
  return template
    .replace(/{streak}/g, String(context.streak || 0))
    .replace(/{comebackCount}/g, String(context.comebackCount || 0))
    .replace(/{recentWorkouts}/g, String(context.recentWorkoutsCount || 0))
    .replace(/{victory}/g, context.lastVictory || 'pushed through')
    .replace(/{daysSince}/g, String(context.daysSinceLastWorkout || 0));
}

/**
 * Filters templates based on available context data
 */
export function getEligibleTemplates(templates, context) {
  return templates.filter(template => {
    if (template.requiresStreak && (!context.streak || context.streak === 0)) {
      return false;
    }
    if (template.requiresComebacks && (!context.comebackCount || context.comebackCount === 0)) {
      return false;
    }
    if (template.requiresVictories && !context.lastVictory) {
      return false;
    }
    if (template.requiresRecentWorkouts && (!context.recentWorkoutsCount || context.recentWorkoutsCount === 0)) {
      return false;
    }
    return true;
  });
}

/**
 * Selects a random template from the array
 */
export function selectRandomTemplate(templates) {
  if (templates.length === 0) return null;
  return templates[Math.floor(Math.random() * templates.length)];
}

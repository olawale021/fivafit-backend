import OpenAI from 'openai'

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

/**
 * AI Service
 * Handles all AI-related operations including OpenAI API calls
 */

/**
 * Generate personalized AI prompt based on user profile
 */
export function generatePersonalizedPrompt(user, variationNumber = 1, totalVariations = 15) {
  const gender = user?.gender || 'all'
  const fitnessGoal = user?.fitness_goal || ['general_fitness']
  const genderContext = gender === 'male' ? 'male athlete' : gender === 'female' ? 'female athlete' : 'athlete'

  // Handle both array format (new) and string format (old/legacy)
  let goals = []
  if (Array.isArray(fitnessGoal)) {
    goals = fitnessGoal
  } else if (typeof fitnessGoal === 'string') {
    // Legacy format: comma-separated string
    goals = fitnessGoal.split(',').map(g => g.trim())
  }

  // Build goal context based on user's fitness goals
  let goalContext = ''
  if (goals.includes('muscle_building') || goals.includes('gain_muscle')) {
    goalContext = 'The user wants to build muscle and increase strength. Focus on hypertrophy and progressive overload.'
  } else if (goals.includes('weight_loss') || goals.includes('lose_weight')) {
    goalContext = 'The user wants to lose weight. Include endurance-focused workouts with higher reps.'
  } else if (goals.includes('endurance') || goals.includes('improve_endurance')) {
    goalContext = 'The user wants to improve endurance. Emphasize stamina and cardiovascular benefits.'
  } else if (goals.includes('flexibility')) {
    goalContext = 'The user wants to improve flexibility and range of motion. Include mobility and stretching exercises.'
  } else if (goals.includes('athletic_performance')) {
    goalContext = 'The user wants to enhance athletic performance. Focus on power, speed, and functional movements.'
  } else if (goals.includes('rehabilitation')) {
    goalContext = 'The user is focused on rehabilitation. Prioritize low-impact, safe movements with proper form.'
  } else {
    goalContext = 'The user wants general fitness improvement. Provide balanced workout recommendations.'
  }

  // Add variation context to ensure AI generates different content
  const variationContext = variationNumber > 1
    ? `\n    VARIATION REQUIREMENT: This is variation #${variationNumber} of ${totalVariations}. You MUST provide DIFFERENT exercise variations, tips, and instructions compared to what you might have generated before. Focus on:\n    - Different grip positions (overhand, underhand, neutral, wide, narrow)\n    - Different angles and body positions (incline, decline, seated, standing)\n    - Different movement patterns (unilateral, bilateral, alternating)\n    - Different equipment setups (cable variations, band variations, free weight variations)\n    - Unique cueing and coaching points\n    Make each variation feel fresh and distinct!`
    : ''

  return `
    Analyze this image of gym equipment for a ${genderContext}.

    User Context: ${goalContext}${variationContext}

    Return ONLY a valid JSON object with this exact structure (no markdown formatting).

    ⚠️ IMPORTANT: The examples below show STRUCTURE ONLY. You MUST replace ALL placeholder text with real, equipment-specific content:
    {
      "name": "<<Specific equipment name>>",
      "target_muscles": ["<<Actual primary muscle 1>>", "<<Actual primary muscle 2>>", "<<Actual secondary muscle>>"],
      "usage_tips": ["<<Real tip about setup/positioning>>", "<<Real tip about form>>", "<<Real tip about breathing>>", "<<Real tip about common errors>>"],
      "recommended_workouts": [
        {
          "name": "<<Descriptive workout name, e.g., 'Beginner Lat Pulldown Form Training'>>",
          "level": "Beginner",
          "reps": "12-15",
          "sets": "3",
          "description": "<<Equipment-specific beginner description focusing on form mastery>>",
          "rest_period": "60-90 seconds",
          "tempo": "2-1-2 (2 sec down, 1 sec pause, 2 sec up)",
          "duration": "2-3 minutes per set",
          "instructions": [
            "<<Step 1: How to set up this specific equipment>>",
            "<<Step 2: Exact starting position for this equipment>>",
            "<<Step 3: How to perform the movement on this equipment>>",
            "<<Step 4: Breathing pattern for this specific exercise>>",
            "<<Step 5: How to safely return to start>>"
          ],
          "exercises": ["<<Specific exercise like 'Wide-grip lat pulldown'>>", "<<Different variation like 'Underhand close-grip pulldown'>>", "<<Third unique variation like 'Single-arm cable pulldown'>>"],
          "common_mistakes": ["<<Actual mistake users make with THIS equipment>>", "<<Another real mistake>>", "<<Third common error>>"],
          "safety_tips": ["<<Real safety concern for this equipment>>", "<<Another safety tip specific to this movement>>"],
          "biomechanics": "<<Explain what muscles activate and how the movement pattern works for THIS specific equipment>>",
          "progressions": ["<<How to make THIS exercise harder>>"],
          "regressions": ["<<How to make THIS exercise easier>>"],
          "progression_to_next": "<<Signs the user is ready to move from beginner to intermediate on THIS equipment>>"
        },
        {
          "name": "<<Intermediate workout name, e.g., 'Intermediate Lat Pulldown Strength Building'>>",
          "level": "Intermediate",
          "reps": "10-12",
          "sets": "3-4",
          "description": "<<Intermediate-level description for THIS equipment with focus on building strength>>",
          "rest_period": "90-120 seconds",
          "tempo": "2-1-2",
          "duration": "3-4 minutes per set",
          "instructions": [
            "<<Step 1: Setup with heavier weight considerations>>",
            "<<Step 2: Starting position with proper bracing>>",
            "<<Step 3: Controlled movement execution>>",
            "<<Step 4: Breathing under load>>",
            "<<Step 5: Safe completion of rep>>"
          ],
          "exercises": ["<<Intermediate-level exercise variation>>", "<<Second variation with added complexity>>", "<<Third challenging variation>>"],
          "common_mistakes": ["<<Intermediate-level mistake>>", "<<Another mistake at this level>>", "<<Third common error>>"],
          "safety_tips": ["<<Safety tip for heavier loads>>", "<<Another intermediate safety concern>>"],
          "biomechanics": "<<How the body adapts to moderate weight on THIS equipment>>",
          "progressions": ["<<How to progress at intermediate level>>"],
          "regressions": ["<<How to scale back if needed>>"],
          "progression_to_next": "<<When ready for hypertrophy training>>"
        },
        {
          "name": "<<Hypertrophy workout name, e.g., 'Lat Pulldown Muscle Growth Protocol'>>",
          "level": "Hypertrophy",
          "reps": "8-12",
          "sets": "4",
          "description": "<<Hypertrophy-focused description emphasizing muscle growth on THIS equipment>>",
          "rest_period": "60-90 seconds",
          "tempo": "3-1-1 (slow eccentric)",
          "duration": "3-4 minutes per set",
          "instructions": [
            "<<Step 1: Setup for maximum time under tension>>",
            "<<Step 2: Position for optimal muscle stretch>>",
            "<<Step 3: Slow eccentric phase execution>>",
            "<<Step 4: Peak contraction and squeeze>>",
            "<<Step 5: Controlled eccentric lowering>>"
          ],
          "exercises": ["<<Hypertrophy-optimized variation>>", "<<Volume-focused variation>>", "<<Third muscle-building variation>>"],
          "common_mistakes": ["<<Rushing the tempo>>", "<<Not achieving full stretch>>", "<<Third hypertrophy-specific error>>"],
          "safety_tips": ["<<Safety during slow eccentrics>>", "<<Avoiding fatigue-related form breakdown>>"],
          "biomechanics": "<<How time under tension and metabolic stress build muscle with THIS equipment>>",
          "progressions": ["<<Increase volume, add drop sets, or slow tempo more>>"],
          "regressions": ["<<Reduce sets or increase rest>>"],
          "progression_to_next": "<<Signs of muscle adaptation and readiness for strength focus>>"
        },
        {
          "name": "<<Strength workout name, e.g., 'Heavy Lat Pulldown Max Strength'>>",
          "level": "Strength",
          "reps": "4-6",
          "sets": "5",
          "description": "<<Strength-focused description for heavy loading on THIS equipment>>",
          "rest_period": "3-5 minutes",
          "tempo": "Explosive concentric, controlled eccentric",
          "duration": "4-6 minutes per set",
          "instructions": [
            "<<Step 1: Heavy load setup and equipment checks>>",
            "<<Step 2: Full-body bracing and tension>>",
            "<<Step 3: Explosive concentric drive>>",
            "<<Step 4: Strong lockout and control>>",
            "<<Step 5: Controlled eccentric lowering>>"
          ],
          "exercises": ["<<Max-strength variation>>", "<<Power-focused variation>>", "<<Third strength-building variation>>"],
          "common_mistakes": ["<<Losing tension during setup>>", "<<Poor bracing under heavy load>>", "<<Rushing the eccentric>>"],
          "safety_tips": ["<<Spotting and safety protocols>>", "<<When to stop a set safely>>"],
          "biomechanics": "<<Neural adaptations, motor unit recruitment, and strength gains with THIS movement>>",
          "progressions": ["<<Progressive overload: adding 2.5-5lbs, adding sets, cluster sets>>"],
          "regressions": ["<<Reduce load by 10-15%, focus on bar speed and technique>>"],
          "progression_to_next": "<<Strength benchmarks and when to add advanced methods>>"
        },
        {
          "name": "<<Endurance workout name, e.g., 'High-Rep Lat Pulldown Stamina Training'>>",
          "level": "Endurance",
          "reps": "15-20",
          "sets": "3",
          "description": "<<Endurance-focused description for high-rep training on THIS equipment>>",
          "rest_period": "30-45 seconds",
          "tempo": "1-0-1 (fast tempo)",
          "duration": "2-3 minutes per set",
          "instructions": [
            "<<Step 1: Light-to-moderate weight setup>>",
            "<<Step 2: Starting position with focus on sustainability>>",
            "<<Step 3: Rhythmic, continuous movement>>",
            "<<Step 4: Steady breathing to manage fatigue>>",
            "<<Step 5: Maintaining form through final reps>>"
          ],
          "exercises": ["<<Endurance-optimized variation>>", "<<High-rep variation>>", "<<Third stamina-building variation>>"],
          "common_mistakes": ["<<Sacrificing form as fatigue sets in>>", "<<Holding breath during high reps>>", "<<Using momentum instead of muscle>>"],
          "safety_tips": ["<<Recognizing muscular failure vs form breakdown>>", "<<Hydration and recovery for high-volume work>>"],
          "biomechanics": "<<Muscular endurance, capillary density, and fatigue resistance with THIS equipment>>",
          "progressions": ["<<Add 2-3 reps, reduce rest by 5-10 seconds, or add a 4th set>>"],
          "regressions": ["<<Reduce reps to 12-15 or extend rest to 60 seconds>>"],
          "progression_to_next": "<<Endurance benchmarks like completing 20+ reps with good form>>"
        }
      ]
    }

    ⚠️ CRITICAL REQUIREMENTS - DO NOT USE GENERIC PLACEHOLDERS:

    1. REPLACE ALL <<...>> PLACEHOLDERS: The template above shows structure only. You MUST replace every single <<...>> with actual, equipment-specific content.

    2. EQUIPMENT-SPECIFIC CONTENT: Every field must be customized for the EXACT equipment in the image:
       - "description": Must reference the specific equipment and its unique characteristics
       - "instructions": Must describe how to use THIS specific equipment, not generic steps
       - "exercises": Must be REAL exercise names with specific grips/angles (e.g., "Wide-grip lat pulldown", "Close-grip underhand row", "Single-arm cable extension")
       - "common_mistakes": Must be actual mistakes users make with THIS equipment
       - "safety_tips": Must address real safety concerns for THIS specific equipment
       - "biomechanics": Must explain the muscle activation and movement pattern for THIS equipment

    3. VARIATION DIVERSITY: If this is variation #2 or higher, ensure ALL content differs from previous variations

    4. NO GENERIC TEXT: Forbidden phrases include:
       - "Exercise variation 1/2/3"
       - "Mistake 1/2/3"
       - "Tip 1/2/3"
       - "Focus on learning proper form" (unless specific to the equipment)
       - Any text that could apply to any equipment

    5. LANGUAGE: Use simple, clear language as if coaching someone in person

    6. ERROR HANDLING: If it's not gym equipment, return { "error": "Not gym equipment identified" }
  `
}

/**
 * Quick identification - only get equipment name and category (fast, cheap)
 */
export async function identifyEquipmentNameOnly(imageBase64, mimeType, equipmentTypes = []) {
  // Build equipment types list for prompt
  const equipmentTypesList = equipmentTypes.length > 0
    ? equipmentTypes.join(', ')
    : 'barbell, dumbbell, cable, kettlebell, body weight, band, leverage machine, smith machine';

  const prompt = `
    Identify this gym equipment and return ONLY a valid JSON object (no markdown formatting):
    {
      "name": "Specific name of the equipment",
      "category": "equipment category"
    }

    IMPORTANT: The "category" must be one of these exact values from our database:
    ${equipmentTypesList}

    Choose the category that best matches this equipment. Use these guidelines:

    **barbell** - Free weight barbell exercises, benches, squat racks
    Examples: Barbell, Olympic bar, bench (flat/incline/decline), squat rack, power rack

    **dumbbell** - Free weight dumbbell exercises
    Examples: Dumbbells, adjustable dumbbells, dumbbell rack

    **kettlebell** - Kettlebell exercises
    Examples: Kettlebells (any weight)

    **cable** - Cable pulley systems with weight stacks
    Examples: Cable crossover machine, cable pulley tower, functional trainer, cable column, lat pulldown machine, seated cable row, cable fly machine
    Includes any machine with a cable/pulley system, even if it has a fixed seat or path

    **leverage machine** - Fixed-path plate-loaded machines (NO cables)
    Examples: Chest press machine, leg press, shoulder press machine, leg extension, leg curl, hack squat machine, plate-loaded row machine
    These have a fixed movement path AND use weight plates directly (no cables or pulleys)

    **smith machine** - Barbell on vertical/near-vertical fixed track
    Examples: Smith machine (any variation)

    **body weight** - Bodyweight exercises, pull-up bars, dip stations
    Examples: Pull-up bar, dip station, parallel bars, gymnastic rings, captain's chair

    **band** - Resistance bands and elastic training
    Examples: Resistance bands, therapy bands, loop bands, TRX/suspension trainers

    Key distinctions:
    - Chest press MACHINE → "leverage machine" (fixed path)
    - Cable crossover → "cable" (adjustable pulleys)
    - Bench alone → "barbell" (typically used with barbells)
    - Lat pulldown with plates/pins → "leverage machine"
    - Cable pulley tower → "cable"

    Be specific and accurate with the name, but ensure the category matches one of the database types exactly.
    If it's not gym equipment, return { "error": "Not gym equipment identified" }
  `

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`
            }
          }
        ]
      }
    ],
    max_tokens: 150 // Slightly larger for name + category
  })

  const text = response.choices[0].message.content
  const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim()
  return JSON.parse(jsonStr)
}

/**
 * Full identification with workout generation (slow, detailed)
 */
export async function identifyEquipmentWithAI(imageBase64, mimeType, user, variationNumber = 1, totalVariations = 15) {
  const prompt = generatePersonalizedPrompt(user, variationNumber, totalVariations)

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini", // Using gpt-4o-mini for vision (cheaper and faster)
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`
            }
          }
        ]
      }
    ],
    max_tokens: 3500 // Increased for detailed workout information
  })

  const text = response.choices[0].message.content

  // Clean up markdown code blocks if present
  const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim()

  return JSON.parse(jsonStr)
}

// ============================================================================
// WORKOUT PLANNER: AI-POWERED WEEKLY PLAN GENERATION
// ============================================================================

/**
 * Generate a personalized weekly workout plan using AI
 *
 * This function receives exercise metadata (NOT full instructions) and generates
 * a workout plan structure. Full exercise details are fetched from database after.
 *
 * @param {Object} params
 * @param {Object} params.userProfile - User profile data (gender, age, weight, height, fitnessLevel)
 * @param {Object} params.preferences - User preferences (fitness_goals, target_body_parts, days_per_week, etc.)
 * @param {Array} params.availableExercises - Array of exercise metadata from database
 * @returns {Object} AI-generated plan structure with exercise IDs
 */
export async function generateWorkoutPlanWithAI({
  userProfile,
  preferences,
  availableExercises
}) {
  const prompt = buildWorkoutPlanPrompt(userProfile, preferences, availableExercises);
  const maxRetries = 2; // Will try up to 3 times total (initial + 2 retries)

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`🔄 Retry attempt ${attempt} of ${maxRetries} for workout plan generation...`);
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // Using gpt-4o for better reasoning
        messages: [
          {
            role: 'system',
            content: 'You are an expert certified personal trainer with over 15 years of experience in creating personalized workout programs. You understand biomechanics, progressive overload, periodization, and individual adaptation. IMPORTANT: When creating plan names, make them descriptive and motivating based on the workout goals and focus areas. DO NOT include fitness level words like "Beginner", "Intermediate", or "Advanced" in the plan name. DO NOT use emojis. Always respond with valid JSON following the exact structure provided. CRITICAL: You must generate the EXACT number of daily workouts requested, no more, no less.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7 + (attempt * 0.1), // Slightly increase temperature on retries
        max_tokens: 6000 // Increased to ensure all days can be generated
      });

      const planStructure = JSON.parse(response.choices[0].message.content);

      // Validate the response structure
      if (!planStructure.plan_name || !planStructure.daily_workouts) {
        throw new Error('Invalid AI response: missing required fields');
      }

      // Validate number of days
      const expectedDays = preferences.days_per_week;
      const actualDays = planStructure.daily_workouts.length;

      if (actualDays !== expectedDays) {
        console.error(`❌ AI generated ${actualDays} days but ${expectedDays} were requested`);
        console.error(`Expected days: ${preferences.selected_days?.join(', ') || expectedDays}`);
        console.error(`Generated days: ${planStructure.daily_workouts.map(d => d.day_of_week).join(', ')}`);

        // If we have retries left, continue to next iteration
        if (attempt < maxRetries) {
          console.log(`⚠️ Retrying... (attempt ${attempt + 1} of ${maxRetries})`);
          continue;
        }

        // No more retries, throw error
        throw new Error(`AI failed to generate the correct number of workouts after ${maxRetries + 1} attempts. Expected ${expectedDays}, got ${actualDays}.`);
      }

      console.log(`✅ AI generated ${actualDays} workouts as requested (attempt ${attempt + 1})`);
      return planStructure;

    } catch (error) {
      // If it's not a validation error or we're out of retries, throw
      if (attempt === maxRetries) {
        console.error('Error generating workout plan with AI:', error);
        throw new Error(`Failed to generate AI workout plan: ${error.message}`);
      }
      // Otherwise, continue to retry
    }
  }

  // Should never reach here, but just in case
  throw new Error('Failed to generate workout plan after all retry attempts');
}

/**
 * Build the prompt for workout plan generation
 */
function buildWorkoutPlanPrompt(userProfile, preferences, availableExercises) {
  const {
    gender = 'not specified',
    age = 'not specified',
    weight_kg = 'not specified',
    height_cm = 'not specified',
    fitnessLevels = ['beginner']
  } = userProfile;

  const {
    fitness_goals,
    target_body_parts,
    days_per_week,
    hours_per_session,
    selected_days,
    exercise_range
  } = preferences;

  // Build exercises list for AI
  const exercisesText = availableExercises.map((ex, index) =>
    `${index + 1}. ID: ${ex.id}
   Name: ${ex.name}
   Body Part: ${ex.bodyPart}
   Target: ${ex.target}
   Equipment: ${ex.equipment}
   Difficulty: ${ex.difficulty}
   Category: ${ex.category}`
  ).join('\n\n');

  // Build days text and list
  const daysText = selected_days && selected_days.length > 0
    ? selected_days.join(', ')
    : 'flexible scheduling';

  // Create day-by-day breakdown for the prompt
  let dayByDayInstructions = '';
  if (selected_days && selected_days.length > 0) {
    dayByDayInstructions = '\n\nDAY-BY-DAY REQUIREMENTS:\n';
    selected_days.forEach((day, index) => {
      dayByDayInstructions += `- Day ${index + 1}: ${day} (set day_order: ${index + 1}, day_of_week: "${day}")\n`;
    });
  }

  return `You are creating a personalized ${days_per_week}-day weekly workout plan for a client.

USER PROFILE:
- Gender: ${gender}
- Age: ${age} years old
- Weight: ${weight_kg} kg
- Height: ${height_cm} cm
- Fitness Levels: ${fitnessLevels.join(', ')} (user may have different levels for different muscle groups)

WORKOUT PREFERENCES:
- Fitness Goals: ${fitness_goals.join(', ')}
- Target Body Parts: ${target_body_parts.join(', ')}
- Days per Week: ${days_per_week}
- Session Duration: ${hours_per_session} hours (~${Math.round(hours_per_session * 60)} minutes)
- Preferred Days: ${daysText}${dayByDayInstructions}

AVAILABLE EXERCISES FROM DATABASE:
${exercisesText}

⚠️ CRITICAL INSTRUCTION - READ CAREFULLY:
You MUST generate EXACTLY ${days_per_week} workouts. The user selected these specific days: ${selected_days && selected_days.length > 0 ? selected_days.join(', ') : `${days_per_week} days`}.
DO NOT skip any days. DO NOT generate fewer than ${days_per_week} workouts.
${selected_days && selected_days.length > 0 ? `Create one workout for each of these days in order: ${selected_days.map((d, i) => `${i + 1}. ${d}`).join(', ')}` : ''}

INSTRUCTIONS:
1. Create a complete ${days_per_week}-day weekly workout plan (MUST have exactly ${days_per_week} daily_workouts)
2. Each workout should be approximately ${Math.round(hours_per_session * 60)} minutes total
3. Prioritize the user's fitness goals: ${fitness_goals.join(', ')}
4. Focus on these body parts: ${target_body_parts.join(', ')}
5. ONLY use exercises from the AVAILABLE EXERCISES list above (reference by ID)
6. Balance the workouts across the week to allow proper recovery
7. **CRITICAL - Exercise Count:** For each day, select ${exercise_range ? `${exercise_range.min}-${exercise_range.max}` : '4-7'} main exercises that work well together
   - This count is based on the user's fitness level (${fitnessLevels.join(', ')}) and session duration (${hours_per_session}h)
   - ${exercise_range ? `Beginner: 5-6 exercises/hour, Intermediate: 7-8 exercises/hour, Advanced: 8 exercises/hour` : ''}
8. Vary the exercises throughout the week for balanced development
9. **CRITICAL - Exercise Difficulty Selection:**
   - User's selected fitness levels: ${fitnessLevels.join(', ')}
   - MAIN WORKOUT EXERCISES: Only select exercises matching the user's selected levels
   - ${!fitnessLevels.includes('beginner') ? '⚠️ User did NOT select beginner - DO NOT include beginner exercises in main workout' : 'Include beginner exercises as user selected this level'}
   - Match exercise difficulty to user's capabilities - respect their level selection
10. Provide warm-up exercises (2-3 exercises from available list), cool-down, and workout tips for each day

WARM-UP EXERCISE SELECTION:
- Select 2-3 light, dynamic exercises from the available exercises list for warm-up
- Choose exercises that prepare the muscles for the workout (target similar body parts)
- Prefer bodyweight, band, or light dumbbell exercises for warm-up
- Warm-up exercises CAN be beginner level regardless of user's main fitness level (warm-ups are always lighter)

WORKOUT PLAN STRUCTURE:
- For ${fitness_goals.includes('lose_weight') ? 'weight loss' : fitness_goals.includes('gain_muscle') ? 'muscle gain' : 'general fitness'}, structure workouts accordingly
- Include proper rest periods based on goals (30-90 seconds for weight loss/endurance, 90-180 seconds for strength/muscle)
- Use appropriate rep ranges (8-12 for muscle, 12-15+ for endurance, 4-6 for strength)
- Ensure progressive difficulty throughout the week

OUTPUT FORMAT (VALID JSON):
{
  "plan_name": "A descriptive and motivating plan name that reflects the workout goals and focus areas. DO NOT include words like 'Beginner', 'Intermediate', or 'Advanced'. DO NOT use emojis. Examples: 'Total Body Transformation', 'Strength & Power Program', 'Lean Muscle Builder', 'Athletic Performance Plan'",
  "description": "2-3 sentence overview of the plan and its benefits for this user",
  "daily_workouts": [
    ${selected_days && selected_days.length > 0 ? selected_days.map((day, index) => `{
      "day_order": ${index + 1},
      "day_of_week": "${day}",
      "week_number": 1,
      "workout_name": "Workout name for ${day} (e.g., '${day} Upper Body Power')",
      "focus_area": "Primary focus (e.g., 'Chest & Triceps', 'Lower Body', 'Full Body')",
      "target_muscles": ["primary_muscle", "secondary_muscle"],
      "estimated_duration_minutes": ${Math.round(hours_per_session * 60)},
      "exercises": [
        {
          "exercise_id": "ex_123",
          "sets": 3,
          "reps": "10-12",
          "rest_seconds": 90,
          "tempo": "2-0-2-0",
          "notes": "Specific cues for this exercise in this workout"
        }
      ],
      "warm_up_exercises": [
        {
          "exercise_id": "ex_456",
          "sets": 1,
          "reps": "10-15",
          "rest_seconds": 30,
          "notes": "Light warm-up, focus on mobility"
        }
      ],
      "warm_up": "Optional additional warm-up tips (5 min light cardio, joint mobilization, etc.)",
      "cool_down": "5-10 min cool-down and stretching for muscles worked",
      "workout_tips": "2-3 sentences of coaching tips for getting the most out of this workout"
    }`).join(',\n    ') : `{
      "day_order": 1,
      "day_of_week": "flexible",
      "week_number": 1,
      "workout_name": "Day 1 workout name (e.g., 'Upper Body Power')",
      "focus_area": "Primary focus (e.g., 'Chest & Triceps', 'Lower Body', 'Full Body')",
      "target_muscles": ["primary_muscle", "secondary_muscle"],
      "estimated_duration_minutes": ${Math.round(hours_per_session * 60)},
      "exercises": [
        {
          "exercise_id": "ex_123",
          "sets": 3,
          "reps": "10-12",
          "rest_seconds": 90,
          "tempo": "2-0-2-0",
          "notes": "Specific cues for this exercise in this workout"
        }
      ],
      "warm_up_exercises": [
        {
          "exercise_id": "ex_456",
          "sets": 1,
          "reps": "10-15",
          "rest_seconds": 30,
          "notes": "Light warm-up, focus on mobility"
        }
      ],
      "warm_up": "Optional additional warm-up tips (5 min light cardio, joint mobilization, etc.)",
      "cool_down": "5-10 min cool-down and stretching for muscles worked",
      "workout_tips": "2-3 sentences of coaching tips for getting the most out of this workout"
    }`}
  ]
}

🚨 CRITICAL REQUIREMENTS - FAILURE TO COMPLY WILL RESULT IN REJECTION:
1. **plan_name: DO NOT include 'Beginner', 'Intermediate', or 'Advanced' words. DO NOT use emojis.**
2. ONLY use exercise IDs from the AVAILABLE EXERCISES list - do NOT make up exercise IDs (this applies to BOTH exercises and warm_up_exercises)
3. **Each day should have ${exercise_range ? `${exercise_range.min}-${exercise_range.max}` : '4-7'} main exercises + 2-3 warm-up exercises** - this is based on fitness level and duration
4. Warm-up and cool-down time is INCLUDED in the estimated_duration_minutes
5. **MANDATORY: Include 2-3 warm_up_exercises for each day** - select from available exercises list
6. **MANDATORY: Create EXACTLY ${days_per_week} daily_workouts** - NO MORE, NO LESS
7. ${selected_days && selected_days.length > 0 ? `**MANDATORY: Include ALL these days: ${selected_days.join(', ')}** - DO NOT SKIP ANY` : 'Use flexible scheduling'}
8. Ensure exercises are balanced and complement each other
9. Consider muscle recovery - don't train the same muscle groups on consecutive days
10. Make each workout unique and progressive
11. Return ONLY valid JSON, no markdown formatting
12. **MANDATORY: The daily_workouts array MUST contain EXACTLY ${days_per_week} objects**

${selected_days && selected_days.length > 0 ? `
VERIFICATION CHECKLIST (You MUST verify before responding):
✓ Does daily_workouts array have ${days_per_week} items?
✓ Does it include workouts for: ${selected_days.join(', ')}?
✓ Are all ${days_per_week} workouts present?
✓ Does EACH workout have 2-3 warm_up_exercises?

If ANY answer is NO, fix the plan before returning it.
` : `
VERIFICATION CHECKLIST (You MUST verify before responding):
✓ Does daily_workouts array have ${days_per_week} items?
✓ Does EACH workout have 2-3 warm_up_exercises?

If ANY answer is NO, fix the plan before returning it.
`}

Generate the complete ${days_per_week}-day workout plan now. Your response MUST include ALL ${days_per_week} days: ${selected_days && selected_days.length > 0 ? selected_days.join(', ') : `${days_per_week} workouts`}.`;
}

/**
 * Generate exercise alternatives using AI
 * For each exercise in the plan, AI recommends 2 similar alternative exercises
 *
 * @param {Object} exercise - The main exercise
 * @param {Array} availableExercises - Pool of exercises to choose alternatives from
 * @param {Object} workoutContext - Context about the workout (focus_area, target_muscles, etc.)
 * @returns {Array} Array of 2 alternative exercise IDs
 */
export async function generateExerciseAlternatives({
  mainExercise,
  availableExercises,
  workoutContext
}) {
  const prompt = buildExerciseAlternativesPrompt(mainExercise, availableExercises, workoutContext);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using mini for faster, cheaper alternative recommendations
      messages: [
        {
          role: 'system',
          content: `You are an expert certified personal trainer and exercise scientist with deep knowledge of:
- Muscle anatomy and biomechanics
- Exercise variations and equipment substitutions
- Movement patterns and muscle activation
- Progressive overload and training variety

Your job is to recommend exercise alternatives that:
1. Target the SAME muscle groups as the main exercise
2. Provide VARIETY through different equipment or movement patterns
3. Ensure the 2 alternatives are DIFFERENT from each other
4. Only select from the provided available exercises list

Always prioritize equipment diversity to give users true training variety.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.9, // Higher temperature for more variety and creativity
      max_tokens: 300
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result.alternatives || [];
  } catch (error) {
    console.error('Error generating exercise alternatives:', error);
    return []; // Return empty array on error
  }
}

/**
 * Build prompt for exercise alternatives
 */
function buildExerciseAlternativesPrompt(mainExercise, availableExercises, workoutContext) {
  const exercisesText = availableExercises
    .filter(ex => ex.id !== mainExercise.id) // Exclude the main exercise
    .map(ex => `ID: ${ex.id} | ${ex.name} | ${ex.bodyPart} | ${ex.target} | ${ex.equipment} | ${ex.difficulty}`)
    .join('\n');

  return `You are an expert personal trainer recommending 2 DIFFERENT alternative exercises for a workout.

MAIN EXERCISE:
- ID: ${mainExercise.id}
- Name: ${mainExercise.name}
- Body Part: ${mainExercise.bodyPart}
- Target Muscle: ${mainExercise.target}
- Equipment: ${mainExercise.equipment}
- Difficulty: ${mainExercise.difficulty}

WORKOUT CONTEXT:
- Focus Area: ${workoutContext.focus_area}
- Target Muscles: ${workoutContext.target_muscles.join(', ')}

AVAILABLE ALTERNATIVE EXERCISES (choose from this list ONLY):
${exercisesText}

YOUR TASK:
Select exactly 2 DIFFERENT exercises from the available list above that would serve as good alternatives to the main exercise.

SELECTION CRITERIA (in order of priority):

1. **Muscle Targeting** (MOST IMPORTANT):
   - MUST target the same primary muscle group (${mainExercise.target})
   - Should also target similar body part (${mainExercise.bodyPart})
   - Should fit the workout's focus area: ${workoutContext.focus_area}

2. **Equipment Variety** (VERY IMPORTANT):
   - Prioritize DIFFERENT equipment types from the main exercise
   - Example: If main is "barbell", prefer "dumbbell", "cable", or "body weight" alternatives
   - This gives the user true variety and different training stimuli

3. **Difficulty Level**:
   - Try to match the main exercise difficulty (${mainExercise.difficulty})
   - Can be one level up or down if needed, but prefer same level

4. **Movement Pattern Diversity**:
   - The 2 alternatives should use DIFFERENT equipment from each other
   - Example: If Alternative 1 is dumbbell, Alternative 2 should be cable/barbell/etc.
   - Provide variety in grips, angles, or movement patterns

CRITICAL RULES:
✓ ONLY select exercise IDs from the AVAILABLE ALTERNATIVE EXERCISES list above
✓ The 2 alternatives MUST be different from each other (different IDs, different exercises)
✓ Do NOT repeat the main exercise ID
✓ Prioritize equipment variety over exact difficulty match
✓ If limited options, choose the best 2 available that target similar muscles

OUTPUT FORMAT (VALID JSON ONLY, NO EXPLANATION):
{
  "alternatives": ["exercise_id_1", "exercise_id_2"]
}

Return ONLY the JSON object with exactly 2 different exercise IDs from the available list.`;
}


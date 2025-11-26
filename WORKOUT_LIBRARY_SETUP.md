# Workout Library Setup Guide

## Overview

The system now uses a **shared workout library** to prevent duplicate workout data in the database. Workouts are stored once in a `workouts` table and referenced by equipment entries.

### Key Benefits:
- ✅ **No Duplicate Workouts**: Each unique workout (identified by name) is saved only once
- ✅ **Reduced Storage**: Equipment cache stores workout IDs instead of full workout data
- ✅ **Reusability**: Same workout can be used across different equipment
- ✅ **Easy Updates**: Update a workout once, all equipment references get the update

## Database Setup

### Step 1: Create the Workouts Table

Run this SQL in your Supabase SQL Editor:

```sql
-- File: database_workouts.sql
-- Creates the shared workouts library table
```

Execute the file: `/database_workouts.sql`

### Step 2: Update Equipment Cache Table

Run this migration to add workout_ids field:

```sql
-- File: database_migration_workout_references.sql
-- Adds workout_ids column to equipment_cache
```

Execute the file: `/database_migration_workout_references.sql`

## How It Works

### 1. **Workout Generation & Saving**

When AI generates workout recommendations:

```javascript
// AI generates workouts with unique names
{
  "name": "Beginner Lat Pulldown Form Training",  // Unique identifier
  "level": "Beginner",
  "reps": "12-15",
  // ... other fields
}
```

The `saveWorkouts()` function:
1. **Exact Match Check**: Checks if workout with exact name exists
2. **Fuzzy Match Check**: If no exact match, finds similar workouts using:
   - Name similarity (75%+ keyword match)
   - Same level (Beginner, Intermediate, etc.)
   - Same reps and sets
3. If match found → Returns existing workout ID (increments `times_used`)
4. If no match → Saves new workout and returns new ID

### Fuzzy Matching Examples:

✅ **These would be matched as similar:**
- "Beginner Lat Pulldown Form Training"
- "Lat Pulldown Beginner Form Training"
- "Beginner Form Training Lat Pulldown"
→ Same keywords, same level, likely same workout

✅ **These would also match:**
- "Intermediate Cable Row Strength Building"
- "Cable Row Intermediate Strength Building Program"
→ Common words like "program" are ignored

❌ **These would NOT match:**
- "Beginner Lat Pulldown Form Training" (Beginner, 12-15 reps)
- "Advanced Lat Pulldown Form Training" (Advanced, 12-15 reps)
→ Different levels

❌ **These would NOT match:**
- "Beginner Lat Pulldown" (12-15 reps, 3 sets)
- "Beginner Lat Pulldown" (8-12 reps, 4 sets)
→ Different parameters

### 2. **Equipment Cache**

Equipment entries now store:
- `workout_ids`: Array of workout UUIDs (new)
- `recommended_workouts`: Full workout data (legacy, backward compatible)

```javascript
{
  equipment_name: "Lat Pulldown Machine",
  target_muscles: ["Latissimus Dorsi", "Biceps"],
  usage_tips: [...],
  workout_ids: [uuid1, uuid2, uuid3, uuid4, uuid5], // References to workouts table
  // ...
}
```

### 3. **Data Retrieval**

When fetching cached equipment:
1. Get equipment cache entry
2. If `workout_ids` exists, fetch workouts from `workouts` table
3. Populate `recommended_workouts` field with full workout data
4. Return to user

## Code Changes Summary

### New Files:
- `database_workouts.sql` - Workouts table schema
- `database_migration_workout_references.sql` - Migration script
- `src/services/workoutService.js` - Workout CRUD operations
- `WORKOUT_LIBRARY_SETUP.md` - This guide

### Modified Files:

**equipmentCacheService.js:**
- Imports `getWorkoutsByIds()` to fetch workout details
- `getCachedEquipment()` now populates workouts from workout IDs
- Supports both new (workout_ids) and legacy (recommended_workouts) formats

**equipmentController.js:**
- Imports `saveWorkouts()` from workoutService
- Before saving to cache, saves workouts to shared library
- Stores workout IDs in equipment cache instead of full data
- Validates cached data supports workout names

**aiService.js:**
- Added `name` field to workout structure template
- AI now generates unique workout names for each workout
- Instructions emphasize creating descriptive workout names

## Migration Strategy

The system supports **backward compatibility**:

### For Existing Data:
- Old equipment cache entries with `recommended_workouts` still work
- Gradually migrate by letting new scans create workout library entries

### For New Data:
- All new equipment scans save workouts to shared library
- Equipment cache only stores workout IDs

## Example Flow

### First Time Scanning "Lat Pulldown Machine":

1. AI generates 5 workouts with names:
   - "Beginner Lat Pulldown Form Training"
   - "Intermediate Lat Pulldown Strength Building"
   - "Lat Pulldown Muscle Growth Protocol"
   - "Heavy Lat Pulldown Max Strength"
   - "High-Rep Lat Pulldown Stamina Training"

2. Each workout is saved to `workouts` table (5 new entries)

3. Equipment cache saves:
   ```javascript
   {
     equipment_name: "Lat Pulldown Machine",
     workout_ids: [id1, id2, id3, id4, id5],
     variation_number: 1
   }
   ```

### Second Time Scanning "Lat Pulldown Machine" (Variation 2):

1. AI generates 5 workouts (may have same names if not enforced to vary)

2. System checks each workout name:
   - "Beginner Lat Pulldown Form Training" → Already exists! Reuse existing ID
   - "Intermediate Lat Pulldown Strength Building" → Already exists! Reuse existing ID
   - And so on...

3. No duplicate workouts created, existing workout `times_used` incremented

### Scanning Different Equipment "Cable Row Machine":

1. AI generates workouts:
   - "Beginner Cable Row Form Training" (new name)
   - "Intermediate Cable Row Strength Building" (new name)
   - etc.

2. New workouts are saved (different equipment = different workout names)

3. Workout library grows with unique, reusable workouts

## Configuration

### Adjust Similarity Threshold

The default similarity threshold is **75%** (0.75). You can adjust this in `workoutService.js`:

```javascript
// In findSimilarWorkout function
export async function findSimilarWorkout(workoutData, similarityThreshold = 0.75) {
  // Lower threshold = more matches (e.g., 0.6 = 60% similarity)
  // Higher threshold = stricter matching (e.g., 0.85 = 85% similarity)
}
```

**Recommended thresholds:**
- **0.85 (85%)**: Very strict - only near-identical names match
- **0.75 (75%)**: Balanced - catches common variations (default)
- **0.65 (65%)**: Lenient - more aggressive deduplication

### Common Words Filter

Words ignored in similarity comparison (defined in `normalizeWorkoutName`):
```javascript
const commonWords = ['the', 'a', 'an', 'and', 'or', 'for', 'with', 'training', 'workout', 'program', 'protocol']
```

Add more words if needed to improve matching accuracy.

## Monitoring

### Check Workout Library Stats:

```javascript
import { getWorkoutStats } from './services/workoutService.js'

const stats = await getWorkoutStats()
console.log(`Total workouts in library: ${stats.total}`)
```

### Find Most Used Workouts:

```sql
SELECT name, level, times_used
FROM workouts
ORDER BY times_used DESC
LIMIT 10;
```

## Benefits Recap

1. **Storage Efficiency**: Instead of storing 5 full workouts × 15 variations × N equipment = huge data, we store unique workouts once

2. **Consistency**: Same workout definition used everywhere it's referenced

3. **Scalability**: As more equipment is scanned, workout library grows intelligently

4. **Analytics**: Track which workouts are most popular via `times_used` counter

## Next Steps

1. ✅ Run database migrations
2. ✅ Deploy updated code
3. ✅ Test with a few equipment scans
4. ✅ Monitor workout library growth
5. ⏳ Consider adding workout variation enforcement in AI prompts

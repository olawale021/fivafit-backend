import fs from 'fs'
import { identifyEquipmentWithAI, identifyEquipmentNameOnly } from '../services/aiService.js'
import {
  categorizeEquipment,
  getRandomCachedEquipment,
  countVariations,
  saveEquipmentToCache,
  incrementTimesServed,
  shouldUseCache,
  deleteCachedEquipment
} from '../services/equipmentCacheService.js'
import { saveWorkouts } from '../services/workoutService.js'
import { uploadScanImage } from '../services/storageService.js'
import { saveScanToHistory } from '../services/scanHistoryService.js'
import { listEquipmentTypes } from '../services/exerciseService.js'

// Maximum variations to store per equipment (not per category, per specific equipment name)
// E.g., "Lat Pulldown Machine" gets 15 variations, "Cable Row Machine" gets its own 15
const MAX_VARIATIONS_PER_EQUIPMENT = 15

/**
 * Equipment Controller
 * Handles equipment identification requests
 */

/**
 * Quick equipment identification - only returns the name and category (fast & cheap)
 * Used to check if equipment exists in database before doing full analysis
 */
export async function identifyEquipmentQuick(req, res) {
  try {
    // Validate image upload
    if (!req.file) {
      return res.status(400).json({
        error: 'No image provided',
        message: 'Please upload an image of the equipment'
      })
    }

    console.log(`🔍 Quick identification: ${req.file.originalname}`)

    // Fetch equipment types from database
    const equipmentTypesResult = await listEquipmentTypes()
    const equipmentTypes = equipmentTypesResult.success ? equipmentTypesResult.data : []
    console.log(`📋 Using ${equipmentTypes.length} equipment types from database`)

    // Read the uploaded file
    const imagePath = req.file.path
    const imageData = fs.readFileSync(imagePath)
    const imageBase64 = imageData.toString('base64')

    // Clean up the local file immediately
    fs.unlinkSync(imagePath)

    // Quick identification - name and category
    const identificationData = await identifyEquipmentNameOnly(imageBase64, req.file.mimetype, equipmentTypes)

    if (identificationData.error) {
      return res.status(400).json({
        error: 'Invalid image',
        message: identificationData.error
      })
    }

    console.log(`✅ Quick identification: ${identificationData.name} → ${identificationData.category}`)
    res.json(identificationData)

  } catch (error) {
    console.error('❌ Quick Identification Error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Internal server error during quick identification'
    })
  }
}

/**
 * Identify gym equipment from an image using OpenAI Vision with smart caching
 */
export async function identifyEquipment(req, res) {
  const startTime = Date.now() // Track scan duration

  try {
    // Validate image upload
    if (!req.file) {
      return res.status(400).json({
        error: 'No image provided',
        message: 'Please upload an image of the equipment'
      })
    }

    const user = req.user
    const userGender = user?.gender || 'all'

    console.log(`📸 Analyzing image: ${req.file.originalname} for user: ${user.email}`)

    // Read the uploaded file
    const imagePath = req.file.path
    const imageData = fs.readFileSync(imagePath)
    const imageBase64 = imageData.toString('base64')

    // Upload image to storage (before deleting local file)
    console.log('📤 Uploading image to storage...')
    const imageUrl = await uploadScanImage(imageData, user.id, req.file.mimetype)

    // Clean up the local file
    fs.unlinkSync(imagePath)

    // STEP 1: Quick identification to get equipment name only (FAST - 2-5 seconds)
    console.log('🔍 Step 1: Quick equipment identification...')
    const nameData = await identifyEquipmentNameOnly(imageBase64, req.file.mimetype)

    if (nameData.error) {
      return res.status(400).json({
        error: 'Invalid image',
        message: nameData.error
      })
    }

    const equipmentName = nameData.name
    const category = categorizeEquipment(equipmentName)
    console.log(`✅ Identified: ${equipmentName} (Category: ${category})`)

    // STEP 2: Check cache for this specific equipment name
    const variationCount = await countVariations(equipmentName, userGender)
    console.log(`💾 Found ${variationCount} cached variations for "${equipmentName}"`)

    let finalData = null
    let usedCache = false
    let needsFullGeneration = false
    let shouldGenerateNewVariation = false

    // STEP 3: Smart caching logic
    const useCache = variationCount > 0 && shouldUseCache(true) // 80% chance

    if (useCache) {
      // Try to use cached response (80% probability)
      console.log('⚡ Attempting to use cached response (80% probability)')
      const cached = await getRandomCachedEquipment(equipmentName, userGender)

      if (cached) {
        // Validate cached data has all required fields (supports both new and old format)
        const hasWorkoutData = (cached.workout_ids && cached.workout_ids.length > 0) ||
                               (cached.recommended_workouts && cached.recommended_workouts.length > 0)

        const hasValidWorkouts = cached.recommended_workouts &&
                                cached.recommended_workouts.length > 0 &&
                                cached.recommended_workouts[0].name && // Check for workout name
                                cached.recommended_workouts[0].instructions &&
                                cached.recommended_workouts[0].biomechanics

        if (hasWorkoutData && hasValidWorkouts) {
          finalData = {
            name: cached.equipment_name,
            target_muscles: cached.target_muscles,
            usage_tips: cached.usage_tips,
            recommended_workouts: cached.recommended_workouts
          }
          usedCache = true

          // Update times served
          await incrementTimesServed(cached.id)
          console.log(`📊 Served cached variation #${cached.variation_number} (served ${cached.times_served + 1} times)`)
        } else {
          console.log('⚠️ Cached data is outdated (missing new fields), need full generation')
          needsFullGeneration = true
          shouldGenerateNewVariation = true

          // Delete outdated cache entry
          await deleteCachedEquipment(cached.id)
        }
      }
    } else {
      // 20% chance - generate fresh variation
      if (variationCount < MAX_VARIATIONS_PER_EQUIPMENT) {
        console.log(`💾 Generating new variation (${variationCount + 1}/${MAX_VARIATIONS_PER_EQUIPMENT}) - 20% probability`)
        needsFullGeneration = true
        shouldGenerateNewVariation = true
      } else {
        console.log(`✅ Max variations reached (${MAX_VARIATIONS_PER_EQUIPMENT}), generating fresh response (no cache)`)
        needsFullGeneration = true
        shouldGenerateNewVariation = false // Don't save, max reached
      }
    }

    // STEP 4: Full generation only if needed (SLOW - 30-40 seconds)
    if (needsFullGeneration || !finalData) {
      // Determine variation number for AI context
      // If saving new variation: use next number
      // If max reached (not saving): use random number to encourage variety
      const currentVariationNumber = shouldGenerateNewVariation
        ? variationCount + 1
        : Math.floor(Math.random() * MAX_VARIATIONS_PER_EQUIPMENT) + 1

      console.log(`🔄 Generating full workout details with AI (variation ${currentVariationNumber}/${MAX_VARIATIONS_PER_EQUIPMENT})...`)
      const identificationData = await identifyEquipmentWithAI(
        imageBase64,
        req.file.mimetype,
        user,
        currentVariationNumber,
        MAX_VARIATIONS_PER_EQUIPMENT
      )

      if (identificationData.error) {
        return res.status(400).json({
          error: 'Invalid image',
          message: identificationData.error
        })
      }

      finalData = identificationData

      // Save to cache if we should generate a new variation
      if (shouldGenerateNewVariation) {
        // Step 1: Save workouts to shared workout library
        // The saveWorkouts function checks if each workout already exists by name
        // If it exists, it reuses the existing workout; if not, creates a new one
        console.log('💾 Saving workouts to shared library...')
        const workoutIds = await saveWorkouts(identificationData.recommended_workouts)
        console.log(`✅ Workouts processed: ${workoutIds.length} workout references`)

        // Step 2: Save equipment cache entry with workout references
        const newVariationNumber = variationCount + 1
        const cacheEntry = {
          equipment_name: equipmentName,
          equipment_category: category,
          target_muscles: identificationData.target_muscles,
          usage_tips: identificationData.usage_tips,
          workout_ids: workoutIds, // Store workout IDs instead of full workout data
          gender_targeted: userGender,
          fitness_level: 'all',
          variation_number: newVariationNumber,
          times_served: 1
        }

        await saveEquipmentToCache(cacheEntry)
        console.log(`💾 Saved variation #${newVariationNumber} to cache (${newVariationNumber}/${MAX_VARIATIONS_PER_EQUIPMENT})`)
      }
    }

    // STEP 5: Return result to user
    const scanDuration = Date.now() - startTime
    console.log(`✅ Returning equipment analysis: ${finalData.name} ${usedCache ? '(cached)' : '(fresh)'} (${scanDuration}ms)`)

    const responseData = {
      ...finalData,
      image_url: imageUrl, // Include image URL in response
      _meta: {
        cached: usedCache,
        equipment_name: equipmentName,
        category: category,
        variation_count: variationCount,
        scan_duration_ms: scanDuration
      }
    }

    res.json(responseData)

    // STEP 6: Save to scan history (async, don't block response)
    // History will include the image_url
    saveScanToHistory(user.id, responseData).catch(error => {
      console.error('⚠️ Failed to save scan to history:', error)
      // Don't fail the request if history save fails
    })

  } catch (error) {
    console.error('❌ AI Identification Error:', error)
    res.status(500).json({
      error: 'Server error',
      message: 'Internal server error during image analysis'
    })
  }
}

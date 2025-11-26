/**
 * Exercise Sync Script
 *
 * Syncs exercises from ExerciseDB API to Supabase database.
 *
 * USAGE:
 *   node scripts/syncExercises.js [START_OFFSET]
 *
 * EXAMPLES:
 *   node scripts/syncExercises.js           # Fetch exercises 0-99
 *   node scripts/syncExercises.js 100       # Fetch exercises 100-199
 *   node scripts/syncExercises.js 200       # Fetch exercises 200-299
 *   SYNC_LIMIT=200 node scripts/syncExercises.js 0  # Fetch exercises 0-199
 *
 * ENVIRONMENT VARIABLES:
 *   SYNC_LIMIT - Number of exercises to fetch (default: 100)
 *   RAPIDAPI_KEY - Your RapidAPI key for ExerciseDB
 */

import axios from 'axios';
import { supabase } from '../src/config/supabase.js';
import { clearCache } from '../src/services/exerciseService.js';
import dotenv from 'dotenv';

dotenv.config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
// ExerciseDB API configuration
const RAPIDAPI_HOST = 'exercisedb.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}`;

// Delay between API calls to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limit: 90 requests per minute (staying safe below 120 limit)
// 90 requests/min = 1.5 requests/sec = 667ms between requests
// We use 700ms delay to be extra safe (~85 requests per minute)
const API_DELAY_MS = 700;

// Number of exercises to sync (set to a reasonable number)
// Free tier limit is 10 per request, so this will require multiple API calls
const SYNC_LIMIT = parseInt(process.env.SYNC_LIMIT) || 100;

// Starting offset (allows continuing from where you left off)
// Example: node scripts/syncExercises.js 100 (starts from exercise 100)
const START_OFFSET = parseInt(process.argv[2]) || 0;

async function syncExercises() {
    try {
        console.log('🚀 Starting exercise sync from ExerciseDB API...\n');
        console.log(`📍 Starting from offset: ${START_OFFSET}`);
        console.log(`📊 Fetching up to: ${SYNC_LIMIT} exercises\n`);

        // Step 1: Fetch exercises from ExerciseDB API
        console.log('📋 Fetching exercises from ExerciseDB...');

        // Free tier only allows 10 per request, so we need multiple calls
        const exercises = [];
        const batchSize = 10; // Free tier limit
        const batches = Math.ceil(SYNC_LIMIT / batchSize);

        for (let batch = 0; batch < batches; batch++) {
            const offset = START_OFFSET + (batch * batchSize);
            const limit = Math.min(batchSize, SYNC_LIMIT - exercises.length);

            console.log(`   Fetching batch ${batch + 1}/${batches} (offset: ${offset}, limit: ${limit})...`);

            const response = await axios.request({
                method: 'GET',
                url: `${BASE_URL}/exercises`,
                params: {
                    limit: limit,
                    offset: offset
                },
                headers: {
                    'X-RapidAPI-Key': RAPIDAPI_KEY,
                    'X-RapidAPI-Host': RAPIDAPI_HOST
                }
            });

            const batchExercises = response.data || [];
            exercises.push(...batchExercises);

            console.log(`   ✅ Got ${batchExercises.length} exercises`);

            // Delay between API calls to respect rate limit
            if (batch < batches - 1) {
                await delay(API_DELAY_MS);
            }
        }

        console.log(`✅ Total found: ${exercises.length} exercises\n`);

        // Debug: Log the first exercise to see all fields
        if (exercises.length > 0) {
            console.log('🔍 DEBUG - First exercise object:');
            console.log(JSON.stringify(exercises[0], null, 2));
            console.log('\n');
        }

        // Step 2: Save exercises to database (skip existing ones)
        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        const errors = [];

        console.log('💾 Saving exercises to database...\n');

        for (let i = 0; i < exercises.length; i++) {
            const exercise = exercises[i];

            try {
                // Check if exercise already exists
                const { data: existing, error: checkError } = await supabase
                    .from('exercises')
                    .select('id')
                    .eq('id', exercise.id)
                    .single();

                if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found (which is ok)
                    throw checkError;
                }

                if (existing) {
                    skippedCount++;
                    console.log(`⏭️  [${i + 1}/${exercises.length}] Skipped (exists): ${exercise.name}`);
                    continue;
                }

                // Download and upload image to Supabase Storage
                let imageUrl = null;
                try {
                    console.log(`   📥 Downloading image from ExerciseDB...`);
                    const imageResponse = await axios.get(
                        `https://exercisedb.p.rapidapi.com/image?exerciseId=${exercise.id}&resolution=720&rapidapi-key=${RAPIDAPI_KEY}`,
                        { responseType: 'arraybuffer', timeout: 30000 }
                    );

                    const imageBuffer = Buffer.from(imageResponse.data);
                    const contentType = imageResponse.headers['content-type'] || 'image/gif';
                    const extension = contentType.split('/')[1] || 'gif';
                    const fileName = `${exercise.id}.${extension}`;
                    const filePath = `exercises/${fileName}`;

                    console.log(`   📤 Uploading to Supabase Storage...`);
                    const { error: uploadError } = await supabase.storage
                        .from('exercise-images')
                        .upload(filePath, imageBuffer, {
                            contentType,
                            upsert: true,
                            cacheControl: '31536000'
                        });

                    if (!uploadError) {
                        const { data: urlData } = supabase.storage
                            .from('exercise-images')
                            .getPublicUrl(filePath);
                        imageUrl = urlData.publicUrl;
                        console.log(`   ✅ Image uploaded successfully`);
                    } else {
                        console.log(`   ⚠️  Image upload failed, using API URL as fallback`);
                        imageUrl = `https://exercisedb.p.rapidapi.com/image?exerciseId=${exercise.id}&resolution=1080&rapidapi-key=${RAPIDAPI_KEY}`;
                    }
                } catch (imgError) {
                    console.log(`   ⚠️  Image download failed, using API URL as fallback`);
                    imageUrl = `https://exercisedb.p.rapidapi.com/image?exerciseId=${exercise.id}&resolution=1080&rapidapi-key=${RAPIDAPI_KEY}`;
                }

                // Save to database
                const { error } = await supabase
                    .from('exercises')
                    .insert({
                        id: exercise.id,
                        name: exercise.name,
                        bodyPart: exercise.bodyPart,
                        target: exercise.target,
                        equipment: exercise.equipment,
                        secondary_muscles: exercise.secondaryMuscles || [],
                        instructions: exercise.instructions || [],
                        description: exercise.description || '',
                        difficulty: exercise.difficulty,
                        category: exercise.category,
                        image_url: imageUrl
                    });

                if (error) {
                    throw error;
                }

                successCount++;
                console.log(`✅ [${i + 1}/${exercises.length}] Added: ${exercise.name}`);

                // Delay between exercises to avoid overwhelming APIs
                if (i < exercises.length - 1) {
                    await delay(1000); // 1 second between each exercise
                }

            } catch (error) {
                errorCount++;
                errors.push({ id: exercise.id, name: exercise.name, error: error.message });
                console.log(`❌ [${i + 1}/${exercises.length}] Failed: ${exercise.name} - ${error.message}`);
            }
        }

        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 SYNC SUMMARY');
        console.log('='.repeat(50));
        console.log(`📍 Offset range: ${START_OFFSET} - ${START_OFFSET + SYNC_LIMIT}`);
        console.log(`✅ Successfully added: ${successCount}`);
        console.log(`⏭️  Skipped (already exists): ${skippedCount}`);
        console.log(`❌ Failed: ${errorCount}`);
        console.log(`📋 Total processed: ${exercises.length}`);

        if (errors.length > 0) {
            console.log('\n⚠️  Errors:');
            errors.forEach(({ id, name, error }) => {
                console.log(`   - ${name} (${id}): ${error}`);
            });
        }

        // Clear cache if any exercises were added
        if (successCount > 0) {
            console.log('\n🗑️  Clearing exercise cache...');
            clearCache();
            console.log('✅ Cache cleared - fresh data will be fetched on next request');
        }

        // Next steps
        if (successCount > 0 || skippedCount === exercises.length) {
            const nextOffset = START_OFFSET + SYNC_LIMIT;
            console.log('\n💡 To fetch more exercises, run:');
            console.log(`   node scripts/syncExercises.js ${nextOffset}`);
        }

    } catch (error) {
        console.error('❌ Fatal error during sync:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
            console.error('Status:', error.response.status);
        }
        process.exit(1);
    }
}

// Run the sync
syncExercises()
    .then(() => {
        console.log('\n✅ Exercise sync completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Exercise sync failed:', error);
        process.exit(1);
    });

/**
 * Migrate Exercise Images to Supabase Storage
 *
 * Downloads exercise images from ExerciseDB API and uploads them to Supabase Storage.
 * This eliminates API calls for images and improves performance.
 *
 * USAGE:
 *   node scripts/migrateImagesToStorage.js [BATCH_SIZE] [START_OFFSET]
 *
 * EXAMPLES:
 *   node scripts/migrateImagesToStorage.js         # Migrate 50 exercises starting from 0
 *   node scripts/migrateImagesToStorage.js 20      # Migrate 20 exercises starting from 0
 *   node scripts/migrateImagesToStorage.js 50 100  # Migrate 50 exercises starting from offset 100
 */

import axios from 'axios';
import { supabase } from '../src/config/supabase.js';
import dotenv from 'dotenv';

dotenv.config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const BATCH_SIZE = parseInt(process.argv[2]) || 50;
const START_OFFSET = parseInt(process.argv[3]) || 0;
const BUCKET_NAME = 'exercise-images';

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function ensureBucketExists() {
    try {
        console.log(`🪣 Checking if bucket '${BUCKET_NAME}' exists...`);

        // Try to get the bucket
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);

        if (bucketExists) {
            console.log(`✅ Bucket '${BUCKET_NAME}' already exists\n`);
            return;
        }

        // Create the bucket if it doesn't exist
        console.log(`📦 Creating bucket '${BUCKET_NAME}'...`);
        const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
            public: true,
            fileSizeLimit: 5242880, // 5MB
            allowedMimeTypes: ['image/gif', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
        });

        if (error) {
            throw error;
        }

        console.log(`✅ Bucket '${BUCKET_NAME}' created successfully\n`);
    } catch (error) {
        console.error('❌ Error with bucket:', error.message);
        throw error;
    }
}

async function downloadImage(exerciseId) {
    try {
        // Download from ExerciseDB API
        const imageUrl = `https://exercisedb.p.rapidapi.com/image?exerciseId=${exerciseId}&resolution=720&rapidapi-key=${RAPIDAPI_KEY}`;

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000 // 30 second timeout
        });

        // Get content type from response
        const contentType = response.headers['content-type'] || 'image/gif';
        const extension = contentType.split('/')[1] || 'gif';

        return {
            buffer: Buffer.from(response.data),
            contentType,
            extension
        };
    } catch (error) {
        console.error(`   ⚠️  Download failed: ${error.message}`);
        return null;
    }
}

async function uploadToSupabase(exerciseId, imageData) {
    try {
        const fileName = `${exerciseId}.${imageData.extension}`;
        const filePath = `exercises/${fileName}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, imageData.buffer, {
                contentType: imageData.contentType,
                upsert: true,
                cacheControl: '31536000' // Cache for 1 year
            });

        if (uploadError) {
            throw uploadError;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    } catch (error) {
        console.error(`   ⚠️  Upload failed: ${error.message}`);
        return null;
    }
}

async function updateExerciseImageUrl(exerciseId, imageUrl) {
    try {
        const { error } = await supabase
            .from('exercises')
            .update({ image_url: imageUrl })
            .eq('id', exerciseId);

        if (error) {
            throw error;
        }

        return true;
    } catch (error) {
        console.error(`   ⚠️  Database update failed: ${error.message}`);
        return false;
    }
}

async function migrateImages() {
    try {
        console.log('🚀 Starting image migration to Supabase Storage...\n');
        console.log(`📍 Batch size: ${BATCH_SIZE}`);
        console.log(`📍 Starting offset: ${START_OFFSET}\n`);

        // Ensure bucket exists
        await ensureBucketExists();

        // Get exercises that need migration
        console.log('🔍 Fetching exercises to migrate...');
        const { data: exercises, error: fetchError } = await supabase
            .from('exercises')
            .select('id, name, image_url')
            .or('image_url.is.null,image_url.like.%rapidapi%') // Null or contains rapidapi (needs migration)
            .range(START_OFFSET, START_OFFSET + BATCH_SIZE - 1)
            .order('id');

        if (fetchError) {
            throw fetchError;
        }

        if (!exercises || exercises.length === 0) {
            console.log('✅ No exercises to migrate!\n');
            return;
        }

        console.log(`✅ Found ${exercises.length} exercises to migrate\n`);

        // Migrate each exercise
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;
        const errors = [];

        console.log('📥 Downloading and uploading images...\n');

        for (let i = 0; i < exercises.length; i++) {
            const exercise = exercises[i];
            const progress = `[${i + 1}/${exercises.length}]`;

            try {
                console.log(`${progress} Processing: ${exercise.name} (${exercise.id})`);

                // Download image
                console.log(`   📥 Downloading from ExerciseDB...`);
                const imageData = await downloadImage(exercise.id);

                if (!imageData) {
                    skipCount++;
                    console.log(`   ⏭️  Skipped (download failed)\n`);
                    continue;
                }

                // Upload to Supabase
                console.log(`   📤 Uploading to Supabase Storage...`);
                const publicUrl = await uploadToSupabase(exercise.id, imageData);

                if (!publicUrl) {
                    skipCount++;
                    console.log(`   ⏭️  Skipped (upload failed)\n`);
                    continue;
                }

                // Update database
                console.log(`   💾 Updating database...`);
                const updated = await updateExerciseImageUrl(exercise.id, publicUrl);

                if (!updated) {
                    skipCount++;
                    console.log(`   ⏭️  Skipped (database update failed)\n`);
                    continue;
                }

                successCount++;
                console.log(`   ✅ Success! Image URL: ${publicUrl}\n`);

                // Small delay between exercises to avoid overwhelming APIs
                if (i < exercises.length - 1) {
                    await delay(1000); // 1 second between each exercise
                }

            } catch (error) {
                errorCount++;
                errors.push({ id: exercise.id, name: exercise.name, error: error.message });
                console.log(`   ❌ Failed: ${error.message}\n`);
            }
        }

        // Summary
        console.log('='.repeat(60));
        console.log('📊 MIGRATION SUMMARY');
        console.log('='.repeat(60));
        console.log(`📍 Range: ${START_OFFSET} - ${START_OFFSET + BATCH_SIZE}`);
        console.log(`✅ Successfully migrated: ${successCount}`);
        console.log(`⏭️  Skipped: ${skipCount}`);
        console.log(`❌ Failed: ${errorCount}`);
        console.log(`📋 Total processed: ${exercises.length}`);

        if (errors.length > 0) {
            console.log('\n⚠️  Errors:');
            errors.forEach(({ id, name, error }) => {
                console.log(`   - ${name} (${id}): ${error}`);
            });
        }

        // Next steps
        if (successCount > 0 && exercises.length === BATCH_SIZE) {
            const nextOffset = START_OFFSET + BATCH_SIZE;
            console.log('\n💡 To migrate more exercises, run:');
            console.log(`   node scripts/migrateImagesToStorage.js ${BATCH_SIZE} ${nextOffset}`);
        }

        if (successCount === exercises.length) {
            console.log('\n🎉 All exercises in this batch migrated successfully!');
        }

    } catch (error) {
        console.error('❌ Fatal error during migration:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
            console.error('Status:', error.response.status);
        }
        process.exit(1);
    }
}

// Run migration
migrateImages()
    .then(() => {
        console.log('\n✅ Image migration completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Image migration failed:', error);
        process.exit(1);
    });

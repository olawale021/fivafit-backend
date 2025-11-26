import { supabase } from '../src/config/supabase.js';
import { clearCache } from '../src/services/exerciseService.js';
import dotenv from 'dotenv';

dotenv.config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

async function updateMissingImages() {
    try {
        console.log('🚀 Starting image URL update for exercises...\n');

        // Step 1: Find exercises without image_url
        console.log('🔍 Finding exercises without image URLs...');
        const { data: exercisesWithoutImages, error: fetchError } = await supabase
            .from('exercises')
            .select('id, name')
            .or('image_url.is.null,image_url.eq.');

        if (fetchError) {
            throw fetchError;
        }

        if (!exercisesWithoutImages || exercisesWithoutImages.length === 0) {
            console.log('✅ All exercises already have image URLs!');
            return;
        }

        console.log(`✅ Found ${exercisesWithoutImages.length} exercises without image URLs\n`);

        // Step 2: Update each exercise with generated image URL
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        console.log('💾 Updating exercises with image URLs...\n');

        for (let i = 0; i < exercisesWithoutImages.length; i++) {
            const exercise = exercisesWithoutImages[i];

            try {
                // Generate image URL with API key and resolution (ULTRA plan = 1080)
                const imageUrl = `https://exercisedb.p.rapidapi.com/image?exerciseId=${exercise.id}&resolution=1080&rapidapi-key=${RAPIDAPI_KEY}`;

                // Update exercise with image URL
                const { error: updateError } = await supabase
                    .from('exercises')
                    .update({ image_url: imageUrl })
                    .eq('id', exercise.id);

                if (updateError) {
                    throw updateError;
                }

                successCount++;
                console.log(`✅ [${i + 1}/${exercisesWithoutImages.length}] Updated: ${exercise.name}`);

            } catch (error) {
                errorCount++;
                errors.push({ id: exercise.id, name: exercise.name, error: error.message });
                console.log(`❌ [${i + 1}/${exercisesWithoutImages.length}] Failed: ${exercise.name} - ${error.message}`);
            }
        }

        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 UPDATE SUMMARY');
        console.log('='.repeat(50));
        console.log(`✅ Successfully updated: ${successCount}`);
        console.log(`❌ Failed: ${errorCount}`);
        console.log(`📋 Total processed: ${exercisesWithoutImages.length}`);

        if (errors.length > 0) {
            console.log('\n⚠️  Errors:');
            errors.forEach(({ id, name, error }) => {
                console.log(`   - ${name} (${id}): ${error}`);
            });
        }

        // Clear cache if any images were updated
        if (successCount > 0) {
            console.log('\n🗑️  Clearing exercise cache...');
            clearCache();
            console.log('✅ Cache cleared - fresh data will be fetched on next request');
        }

    } catch (error) {
        console.error('❌ Fatal error during update:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
            console.error('Status:', error.response.status);
        }
        process.exit(1);
    }
}

// Run the update
updateMissingImages()
    .then(() => {
        console.log('\n✅ Image URL update completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Image URL update failed:', error);
        process.exit(1);
    });

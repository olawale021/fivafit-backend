import { supabase } from '../src/config/supabase.js';

async function checkExercises() {
    const { data, error } = await supabase
        .from('exercises')
        .select('id, name, image_url')
        .order('id');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Total exercises: ${data.length}`);
    console.log(`First ID: ${data[0]?.id}`);
    console.log(`Last ID: ${data[data.length - 1]?.id}`);

    // Check how many still need migration
    const needMigration = data.filter(e => !e.image_url || e.image_url.includes('rapidapi'));
    console.log(`\nNeed migration: ${needMigration.length}`);

    if (needMigration.length > 0) {
        console.log('\nExercises that need migration:');
        needMigration.forEach(e => {
            console.log(`  ${e.id} - ${e.name}`);
        });
    }

    // Show last 10 exercises
    console.log('\nLast 10 exercises:');
    data.slice(-10).forEach(e => {
        const status = (!e.image_url || e.image_url.includes('rapidapi')) ? '❌ Need migration' : '✅ Migrated';
        console.log(`  ${e.id} - ${e.name} - ${status}`);
    });
}

checkExercises().then(() => process.exit(0));

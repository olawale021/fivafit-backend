import { supabase } from '../config/supabase.js';
import NodeCache from 'node-cache';

// Create cache instance with 5 minute TTL
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * Transform exercise data from database format to API format
 * Converts snake_case to camelCase for frontend
 */
function transformExercise(exercise) {
    if (!exercise) return null;

    return {
        ...exercise,
        imageUrl: exercise.image_url, // Map image_url to imageUrl
        secondaryMuscles: exercise.secondary_muscles // Map secondary_muscles to secondaryMuscles
    };
}

/**
 * Transform array of exercises
 */
function transformExercises(exercises) {
    if (!exercises || !Array.isArray(exercises)) return [];
    return exercises.map(transformExercise);
}

/**
 * Get all exercises from database
 */
export async function getAllExercises() {
    const cacheKey = 'all_exercises';

    try {
        // Check cache first
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            console.log('✅ Cache hit: all_exercises');
            return {
                success: true,
                data: cachedData
            };
        }

        console.log('🔄 Cache miss: fetching all_exercises from DB');
        const { data, error } = await supabase
            .from('exercises')
            .select('*')
            .order('name');

        if (error) throw error;

        const transformedData = transformExercises(data || []);

        // Store in cache
        cache.set(cacheKey, transformedData);

        return {
            success: true,
            data: transformedData
        };
    } catch (error) {
        console.error('Error fetching all exercises:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * List all unique equipment types
 */
export async function listEquipmentTypes() {
    const cacheKey = 'equipment_types';

    try {
        // Check cache first
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            console.log('✅ Cache hit: equipment_types');
            return {
                success: true,
                data: cachedData
            };
        }

        console.log('🔄 Cache miss: fetching equipment_types from DB');
        const { data, error } = await supabase
            .from('exercises')
            .select('equipment')
            .not('equipment', 'is', null);

        if (error) throw error;

        // Get unique equipment types
        const uniqueEquipment = [...new Set(data.map(item => item.equipment))].sort();

        // Store in cache
        cache.set(cacheKey, uniqueEquipment);

        return {
            success: true,
            data: uniqueEquipment
        };
    } catch (error) {
        console.error('Error fetching equipment types:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * List all unique body parts
 */
export async function listBodyParts() {
    const cacheKey = 'body_parts';

    try {
        // Check cache first
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            console.log('✅ Cache hit: body_parts');
            return {
                success: true,
                data: cachedData
            };
        }

        console.log('🔄 Cache miss: fetching body_parts from DB');
        const { data, error } = await supabase
            .from('exercises')
            .select('bodyPart')
            .not('bodyPart', 'is', null);

        if (error) throw error;

        // Get unique body parts
        const uniqueBodyParts = [...new Set(data.map(item => item.bodyPart))].sort();

        // Store in cache
        cache.set(cacheKey, uniqueBodyParts);

        return {
            success: true,
            data: uniqueBodyParts
        };
    } catch (error) {
        console.error('Error fetching body parts:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * List all unique target muscles
 */
export async function listTargetMuscles() {
    const cacheKey = 'target_muscles';

    try {
        // Check cache first
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            console.log('✅ Cache hit: target_muscles');
            return {
                success: true,
                data: cachedData
            };
        }

        console.log('🔄 Cache miss: fetching target_muscles from DB');
        const { data, error } = await supabase
            .from('exercises')
            .select('target')
            .not('target', 'is', null);

        if (error) throw error;

        // Get unique target muscles
        const uniqueTargets = [...new Set(data.map(item => item.target))].sort();

        // Store in cache
        cache.set(cacheKey, uniqueTargets);

        return {
            success: true,
            data: uniqueTargets
        };
    } catch (error) {
        console.error('Error fetching target muscles:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Clear all cache entries
 * Call this when database is updated (e.g., after syncing new exercises)
 */
export function clearCache() {
    cache.flushAll();
    console.log('🗑️  Cache cleared');
}

/**
 * Get exercises by difficulty level (beginner, intermediate, advanced)
 */
export async function getExercisesByDifficulty(difficulty) {
    try {
        const { data, error } = await supabase
            .from('exercises')
            .select('*')
            .eq('difficulty', difficulty)
            .order('name');

        if (error) throw error;

        return {
            success: true,
            data: transformExercises(data || [])
        };
    } catch (error) {
        console.error(`Error fetching ${difficulty} exercises:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get exercises by category (strength, cardio, etc.)
 */
export async function getExercisesByCategory(category) {
    try {
        const { data, error} = await supabase
            .from('exercises')
            .select('*')
            .eq('category', category)
            .order('name');

        if (error) throw error;

        return {
            success: true,
            data: transformExercises(data || [])
        };
    } catch (error) {
        console.error(`Error fetching ${category} exercises:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get exercises by equipment type
 * @param {string} equipment - The equipment type to filter by
 * @param {string|null} bodyPart - Optional body part to further filter results
 */
export async function getExercisesByEquipment(equipment, bodyPart = null) {
    try {
        let query = supabase
            .from('exercises')
            .select('*')
            .eq('equipment', equipment);

        if (bodyPart) {
            query = query.eq('bodyPart', bodyPart);
        }

        const { data, error } = await query.order('name');

        if (error) throw error;

        return {
            success: true,
            data: transformExercises(data || [])
        };
    } catch (error) {
        console.error(`Error fetching exercises for equipment ${equipment}:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get exercises by body part
 */
export async function getExercisesByBodyPart(bodyPart) {
    try {
        const { data, error } = await supabase
            .from('exercises')
            .select('*')
            .eq('bodyPart', bodyPart)
            .order('name');

        if (error) throw error;

        return {
            success: true,
            data: transformExercises(data || [])
        };
    } catch (error) {
        console.error(`Error fetching exercises for body part ${bodyPart}:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get exercises by target muscle
 */
export async function getExercisesByTarget(target) {
    try {
        const { data, error } = await supabase
            .from('exercises')
            .select('*')
            .eq('target', target)
            .order('name');

        if (error) throw error;

        return {
            success: true,
            data: transformExercises(data || [])
        };
    } catch (error) {
        console.error(`Error fetching exercises for target ${target}:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get exercise by ID
 */
export async function getExerciseById(exerciseId) {
    try {
        const { data, error } = await supabase
            .from('exercises')
            .select('*')
            .eq('id', exerciseId)
            .single();

        if (error) throw error;

        return {
            success: true,
            data: transformExercise(data)
        };
    } catch (error) {
        console.error(`Error fetching exercise ${exerciseId}:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Search exercises by name
 */
export async function searchExercises(query) {
    try {
        const { data, error } = await supabase
            .from('exercises')
            .select('*')
            .ilike('name', `%${query}%`)
            .order('name')
            .limit(50);

        if (error) throw error;

        return {
            success: true,
            data: transformExercises(data || [])
        };
    } catch (error) {
        console.error(`Error searching exercises for "${query}":`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

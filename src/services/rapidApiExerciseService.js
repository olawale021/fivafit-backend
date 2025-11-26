import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_EXERCISE_HOST;
// Remove https:// if it's already in the host
const HOST_ONLY = RAPIDAPI_HOST.replace('https://', '').replace('http://', '');
const BASE_URL = `https://${HOST_ONLY}`;

/**
 * List all available equipment types
 */
export async function listEquipmentTypes() {
    try {
        const response = await axios.request({
            method: 'GET',
            url: `${BASE_URL}/list/equipment`,
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': HOST_ONLY
            }
        });

        return {
            success: true,
            data: response.data
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
 * Get all exercises (general endpoint)
 */
export async function getAllExercises() {
    try {
        const response = await axios.request({
            method: 'GET',
            url: `${BASE_URL}/exercises`,
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': HOST_ONLY
            }
        });

        return {
            success: true,
            data: response.data
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
 * List all available body parts
 */
export async function listBodyParts() {
    try {
        const response = await axios.request({
            method: 'GET',
            url: `${BASE_URL}/list/bodyPart`,
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': HOST_ONLY
            }
        });

        return {
            success: true,
            data: response.data
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
 * List all available target muscles
 */
export async function listTargetMuscles() {
    try {
        const response = await axios.request({
            method: 'GET',
            url: `${BASE_URL}/list/target`,
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': HOST_ONLY
            }
        });

        return {
            success: true,
            data: response.data
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
 * Get exercises by mechanic type (compound or isolation)
 */
export async function getExercisesByMechanic(mechanic = 'compound') {
    try {
        const response = await axios.request({
            method: 'GET',
            url: `${BASE_URL}/exercises/mechanic/${mechanic}`,
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': HOST_ONLY
            }
        });

        return {
            success: true,
            data: response.data
        };
    } catch (error) {
        console.error(`Error fetching ${mechanic} exercises:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get exercises by equipment type
 */
export async function getExercisesByEquipment(equipment) {
    try {
        const response = await axios.request({
            method: 'GET',
            url: `${BASE_URL}/exercises/equipment/${equipment}`,
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': HOST_ONLY
            }
        });

        return {
            success: true,
            data: response.data
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
        const response = await axios.request({
            method: 'GET',
            url: `${BASE_URL}/exercises/bodyPart/${bodyPart}`,
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': HOST_ONLY
            }
        });

        return {
            success: true,
            data: response.data
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
        const response = await axios.request({
            method: 'GET',
            url: `${BASE_URL}/exercises/target/${target}`,
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': HOST_ONLY
            }
        });

        return {
            success: true,
            data: response.data
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
        const response = await axios.request({
            method: 'GET',
            url: `${BASE_URL}/exercise/${exerciseId}`,
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': HOST_ONLY
            }
        });

        return {
            success: true,
            data: response.data
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
        const response = await axios.request({
            method: 'GET',
            url: `${BASE_URL}/exercises/name/${query}`,
            headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': HOST_ONLY
            }
        });

        return {
            success: true,
            data: response.data
        };
    } catch (error) {
        console.error(`Error searching exercises for "${query}":`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

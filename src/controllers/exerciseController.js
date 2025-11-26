import {
    getAllExercises,
    listEquipmentTypes,
    listBodyParts,
    listTargetMuscles,
    getExercisesByDifficulty,
    getExercisesByCategory,
    getExercisesByEquipment,
    getExercisesByBodyPart,
    getExercisesByTarget,
    getExerciseById,
    searchExercises
} from '../services/exerciseService.js';

/**
 * Get all exercises
 */
export async function getAllExercisesHandler(req, res) {
    try {
        const result = await getAllExercises();

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch exercises',
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error in getAllExercisesHandler:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

/**
 * List all equipment types
 */
export async function listEquipmentTypesHandler(req, res) {
    try {
        const result = await listEquipmentTypes();

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch equipment types',
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error in listEquipmentTypesHandler:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

/**
 * List all body parts
 */
export async function listBodyPartsHandler(req, res) {
    try {
        const result = await listBodyParts();

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch body parts',
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error in listBodyPartsHandler:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

/**
 * List all target muscles
 */
export async function listTargetMusclesHandler(req, res) {
    try {
        const result = await listTargetMuscles();

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch target muscles',
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error in listTargetMusclesHandler:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

/**
 * Get exercises by difficulty (beginner/intermediate/advanced)
 */
export async function getExercisesByDifficultyHandler(req, res) {
    try {
        const { difficulty } = req.params;

        if (!['beginner', 'intermediate', 'advanced'].includes(difficulty.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: 'Difficulty must be either "beginner", "intermediate", or "advanced"'
            });
        }

        const result = await getExercisesByDifficulty(difficulty);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch exercises',
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error in getExercisesByDifficultyHandler:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

/**
 * Get exercises by category (strength/cardio/mobility/etc.)
 */
export async function getExercisesByCategoryHandler(req, res) {
    try {
        const { category } = req.params;

        const validCategories = ['strength', 'cardio', 'mobility', 'balance', 'stretching', 'plyometrics', 'rehabilitation'];
        if (!validCategories.includes(category.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: `Category must be one of: ${validCategories.join(', ')}`
            });
        }

        const result = await getExercisesByCategory(category);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch exercises',
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error in getExercisesByCategoryHandler:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

/**
 * Get exercises by equipment
 */
export async function getExercisesByEquipmentHandler(req, res) {
    try {
        const { equipment } = req.params;

        const result = await getExercisesByEquipment(equipment);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch exercises',
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error in getExercisesByEquipmentHandler:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

/**
 * Get exercises by body part
 */
export async function getExercisesByBodyPartHandler(req, res) {
    try {
        const { bodyPart } = req.params;

        const result = await getExercisesByBodyPart(bodyPart);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch exercises',
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error in getExercisesByBodyPartHandler:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

/**
 * Get exercises by target muscle
 */
export async function getExercisesByTargetHandler(req, res) {
    try {
        const { target } = req.params;

        const result = await getExercisesByTarget(target);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch exercises',
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error in getExercisesByTargetHandler:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

/**
 * Get exercise by ID
 */
export async function getExerciseByIdHandler(req, res) {
    try {
        const { id } = req.params;

        const result = await getExerciseById(id);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch exercise',
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error in getExerciseByIdHandler:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

/**
 * Search exercises by name
 */
export async function searchExercisesHandler(req, res) {
    try {
        const { query } = req.query;

        if (!query) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        const result = await searchExercises(query);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: 'Failed to search exercises',
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error in searchExercisesHandler:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

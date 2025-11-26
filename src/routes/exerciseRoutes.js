
import express from 'express';
import {
    getAllExercisesHandler,
    listEquipmentTypesHandler,
    listBodyPartsHandler,
    listTargetMusclesHandler,
    getExercisesByDifficultyHandler,
    getExercisesByCategoryHandler,
    getExercisesByEquipmentHandler,
    getExercisesByBodyPartHandler,
    getExercisesByTargetHandler,
    getExerciseByIdHandler,
    searchExercisesHandler
} from '../controllers/exerciseController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All exercise routes require authentication
router.use(authenticateToken);

// List endpoints (for filters/dropdowns)
router.get('/list/equipment', listEquipmentTypesHandler);
router.get('/list/body-parts', listBodyPartsHandler);
router.get('/list/targets', listTargetMusclesHandler);

// Get all exercises
router.get('/', getAllExercisesHandler);

// Search exercises
router.get('/search', searchExercisesHandler);

// Filter by difficulty (beginner/intermediate/advanced)
router.get('/difficulty/:difficulty', getExercisesByDifficultyHandler);

// Filter by category (strength/cardio/mobility/etc.)
router.get('/category/:category', getExercisesByCategoryHandler);

// Filter by equipment
router.get('/equipment/:equipment', getExercisesByEquipmentHandler);

// Filter by body part
router.get('/body-part/:bodyPart', getExercisesByBodyPartHandler);

// Filter by target muscle
router.get('/target/:target', getExercisesByTargetHandler);

// Get specific exercise by ID
router.get('/:id', getExerciseByIdHandler);

export default router;

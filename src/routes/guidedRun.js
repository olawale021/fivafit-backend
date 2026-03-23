import express from 'express';
import { generateGuidedRun, getGuidedRunTypes } from '../controllers/guidedRunController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/types', authenticateToken, getGuidedRunTypes);
router.post('/generate', authenticateToken, generateGuidedRun);

export default router;

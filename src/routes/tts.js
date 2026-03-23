import express from 'express';
import { generateSpeech } from '../controllers/ttsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authenticateToken, generateSpeech);

export default router;

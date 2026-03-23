import express from 'express';
import { getWeather } from '../controllers/weatherController.js';

const router = express.Router();

// No auth required — weather is public data
router.get('/', getWeather);

export default router;

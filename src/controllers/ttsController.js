import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Simple in-memory cache
const cache = new Map();
const MAX_CACHE_SIZE = 50;

export const generateSpeech = async (req, res) => {
  try {
    const { text, voice = 'nova' } = req.body;

    if (!text || text.length > 500) {
      return res.status(400).json({ error: 'Text required (max 500 chars)' });
    }

    const validVoices = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'];
    if (!validVoices.includes(voice)) {
      return res.status(400).json({ error: `Invalid voice. Use: ${validVoices.join(', ')}` });
    }

    // Check cache
    const cacheKey = `${voice}:${text}`;
    if (cache.has(cacheKey)) {
      console.log('[TTS] Cache hit for:', voice);
      return res.json({ audio: cache.get(cacheKey) });
    }

    console.log('[TTS] Calling OpenAI TTS, voice:', voice, 'text length:', text.length);

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice,
      input: text,
      response_format: 'mp3',
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString('base64');

    console.log('[TTS] Generated audio, size:', buffer.length, 'bytes');

    // Cache it
    if (cache.size >= MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    cache.set(cacheKey, base64);

    res.json({ audio: base64 });
  } catch (error) {
    console.error('[TTS] Error:', error);
    res.status(500).json({ error: 'TTS generation failed' });
  }
};

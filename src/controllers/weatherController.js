const OPENWEATHERMAP_API_KEY = process.env.OPENWEATHERMAP_API_KEY;
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// Simple in-memory cache keyed by rounded lat/lng
const cache = new Map();

export const getWeather = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng query params required' });
    }

    if (!OPENWEATHERMAP_API_KEY) {
      return res.status(503).json({ error: 'Weather service not configured' });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ error: 'Invalid lat/lng values' });
    }

    // Round to 2 decimal places for cache key (~1km precision)
    const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      return res.json(cached.data);
    }

    // Fetch from OpenWeatherMap
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${OPENWEATHERMAP_API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      const statusCode = response.status;
      console.error('[Weather] OpenWeatherMap error:', statusCode);
      if (statusCode === 401) {
        console.error('[Weather] API key invalid or not yet activated (new keys take up to 2 hours)');
        return res.status(503).json({ error: 'Weather API key not yet active. New keys take up to 2 hours to activate.' });
      }
      return res.status(502).json({ error: 'Weather provider error' });
    }

    const data = await response.json();

    // Also fetch UV index from OneCall if available
    let uvIndex = 0;
    try {
      const uvUrl = `https://api.openweathermap.org/data/2.5/uvi?lat=${latitude}&lon=${longitude}&appid=${OPENWEATHERMAP_API_KEY}`;
      const uvResponse = await fetch(uvUrl);
      if (uvResponse.ok) {
        const uvData = await uvResponse.json();
        uvIndex = uvData.value || 0;
      }
    } catch {
      // UV index is optional
    }

    const result = {
      ...data,
      uv_index: uvIndex,
    };

    // Cache the result
    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    // Clean old cache entries periodically
    if (cache.size > 100) {
      const now = Date.now();
      for (const [key, val] of cache) {
        if (now - val.timestamp > CACHE_DURATION_MS) cache.delete(key);
      }
    }

    return res.json(result);
  } catch (error) {
    console.error('[Weather] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

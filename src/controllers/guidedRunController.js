import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Cache generated scripts
const cache = new Map();

export const generateGuidedRun = async (req, res) => {
  try {
    const { runType, durationMinutes, fitnessLevel = 'intermediate' } = req.body;

    if (!runType || !durationMinutes) {
      return res.status(400).json({ error: 'runType and durationMinutes required' });
    }

    const validTypes = ['easy_run', 'tempo_run', 'interval', 'long_run', 'beginner', 'speed_work', 'recovery', 'treadmill'];
    if (!validTypes.includes(runType)) {
      return res.status(400).json({ error: `Invalid runType. Use: ${validTypes.join(', ')}` });
    }

    const cacheKey = `${runType}:${durationMinutes}:${fitnessLevel}`;
    if (cache.has(cacheKey)) {
      return res.json(cache.get(cacheKey));
    }

    console.log('[GuidedRun] Generating script:', runType, durationMinutes, 'min');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert running coach named Coach Sam. You are warm, encouraging, and knowledgeable. You speak naturally and conversationally — like a friend who happens to be a great coach. Keep cues short and punchy (1-2 sentences max). Never use emojis. Always respond with valid JSON.`
        },
        {
          role: 'user',
          content: buildPrompt(runType, durationMinutes, fitnessLevel)
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 3000,
    });

    const script = JSON.parse(response.choices[0].message.content);

    // Validate structure
    if (!script.title || !script.cues || !Array.isArray(script.cues)) {
      return res.status(500).json({ error: 'Invalid AI response' });
    }

    const result = {
      title: script.title,
      description: script.description || '',
      runType,
      durationMinutes,
      fitnessLevel,
      cues: script.cues,
    };

    // Cache it
    if (cache.size >= 30) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    cache.set(cacheKey, result);

    return res.json(result);
  } catch (error) {
    console.error('[GuidedRun] Error:', error);
    return res.status(500).json({ error: 'Failed to generate guided run' });
  }
};

function buildPrompt(runType, durationMinutes, fitnessLevel) {
  const typeDescriptions = {
    easy_run: 'a relaxed, conversational-pace easy run focused on building aerobic base',
    tempo_run: 'a tempo run with a warm-up, sustained comfortably-hard effort, and cool-down',
    interval: 'an interval training session with alternating fast and recovery segments',
    long_run: 'a long, steady-paced endurance run',
    beginner: 'a beginner-friendly run/walk session with walking breaks built in',
    speed_work: 'a speed workout with short, fast bursts and recovery jogs',
    recovery: 'a very easy recovery run to help the body recover from harder sessions',
    treadmill: 'a treadmill run with pace and incline variations to keep it interesting',
  };

  return `Generate a ${durationMinutes}-minute guided ${typeDescriptions[runType]} for a ${fitnessLevel} runner.

Create coaching cues that trigger at specific times during the run. Each cue is something you'd say to the runner through their earphones.

Rules:
- First cue should be at time 0 (the opening welcome and what to expect)
- Include cues every 1-3 minutes throughout the run
- Last cue should be near the end (cool-down and congrats)
- For interval sessions, clearly call out when to speed up and slow down
- For beginner sessions, include walk breaks ("Time to walk for 1 minute")
- Include form tips, breathing reminders, and motivation
- Keep each cue SHORT — 1-2 sentences, under 30 words
- Be conversational and warm, not robotic

Return JSON:
{
  "title": "descriptive run title",
  "description": "1 sentence overview",
  "cues": [
    {
      "trigger_seconds": 0,
      "text": "Welcome! Today we're doing a 20 minute easy run. Let's start with a gentle warm-up pace."
    },
    {
      "trigger_seconds": 120,
      "text": "Good, you're warmed up. Let's settle into your easy pace now. You should be able to hold a conversation."
    },
    {
      "trigger_seconds": 300,
      "text": "5 minutes in. Check your posture. Shoulders relaxed, arms loose, eyes forward."
    }
  ]
}`;
}

export const getGuidedRunTypes = async (req, res) => {
  const types = [
    {
      id: 'beginner',
      title: 'First Run',
      subtitle: 'Run/walk for beginners',
      icon: 'figure.walk',
      color: '#4ECDC4',
      durations: [15, 20, 25],
    },
    {
      id: 'easy_run',
      title: 'Easy Run',
      subtitle: 'Relaxed, conversational pace',
      icon: 'figure.run',
      color: '#00ff88',
      durations: [20, 30, 45],
    },
    {
      id: 'tempo_run',
      title: 'Tempo Run',
      subtitle: 'Comfortably hard effort',
      icon: 'bolt.fill',
      color: '#FFE66D',
      durations: [20, 30, 40],
    },
    {
      id: 'interval',
      title: 'Intervals',
      subtitle: 'Fast bursts with recovery',
      icon: 'timer',
      color: '#FF6B6B',
      durations: [20, 25, 30],
    },
    {
      id: 'speed_work',
      title: 'Speed Work',
      subtitle: 'Short, fast sprints',
      icon: 'hare.fill',
      color: '#FF8C42',
      durations: [20, 25, 30],
    },
    {
      id: 'long_run',
      title: 'Long Run',
      subtitle: 'Build your endurance',
      icon: 'road.lanes',
      color: '#7B68EE',
      durations: [40, 50, 60],
    },
    {
      id: 'recovery',
      title: 'Recovery Run',
      subtitle: 'Easy and gentle',
      icon: 'leaf.fill',
      color: '#98D8C8',
      durations: [15, 20, 25],
    },
    {
      id: 'treadmill',
      title: 'Treadmill',
      subtitle: 'Indoor pace & incline mix',
      icon: 'figure.run.treadmill',
      color: '#DDA0DD',
      durations: [20, 30, 40],
    },
  ];

  res.json({ types });
};

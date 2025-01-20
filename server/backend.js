/* global process */
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Endpoint to fetch ephemeral token from OpenAI Realtime API
app.get('/session', async (req, res) => {
  try {
    const model = 'gpt-4o-realtime-preview-2024-12-17';
    const voice = 'verse';

    const r = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice,
      }),
    });

    const data = await r.json();
    res.json(data);
  } catch (error) {
    console.error('Failed to get ephemeral session token:', error);
    res.status(500).json({ error: 'Failed to retrieve ephemeral session token' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 
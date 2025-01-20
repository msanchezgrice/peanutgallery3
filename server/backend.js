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
    // Verify API key exists
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set in environment');
      return res.status(500).json({ 
        error: 'Server configuration error: API key not found'
      });
    }

    const model = 'gpt-4o-realtime-preview-2024-12-17';
    const voice = 'verse';

    console.log('Attempting to fetch session token...');
    
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
    console.log('OpenAI response:', JSON.stringify(data, null, 2));

    if (data.error) {
      console.error('OpenAI API error:', data.error);
      return res.status(400).json({
        error: data.error.message || 'Error from OpenAI API',
        details: data.error
      });
    }

    if (!data.client_secret?.value) {
      console.error('No client_secret.value in response:', data);
      return res.status(500).json({
        error: 'Invalid response format from OpenAI',
        details: data
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Failed to get ephemeral session token:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve ephemeral session token',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log('API Key present:', !!process.env.OPENAI_API_KEY);
}); 
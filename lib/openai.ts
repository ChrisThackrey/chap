import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
});

export const MODEL = 'gpt-4o-2024-11-20';

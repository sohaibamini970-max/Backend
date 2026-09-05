// config/gemini.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ✅ Get API key from environment (Google AI Studio key)
const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;

if (!apiKey) {
    console.error('❌ GOOGLE_API_KEY is not set in environment variables');
    console.error('Get your API key from: https://aistudio.google.com/app/apikey');
    console.error('Then add it to your .env file: GOOGLE_API_KEY=your-key-here');
}

// Initialize Gemini with your API key
const genAI = new GoogleGenerativeAI(apiKey);

// ✅ CORRECT MODEL NAMES for Google AI Studio
// gemini-1.5-flash - Fast, cheap, good for most tasks (RECOMMENDED)
// gemini-1.5-pro - More capable, more expensive
// gemini-1.0-pro - Older version (fallback)

const MODEL_NAME = "gemini-1.5-flash"; // Best for most use cases

// Get model for content generation
const getModel = () => {
    try {
        return genAI.getGenerativeModel({
            model: MODEL_NAME,
            generationConfig: {
                temperature: 0.3,
                topK: 32,
                topP: 0.95,
                maxOutputTokens: 2048,
            },
        });
    } catch (error) {
        console.error('Error creating model:', error.message);
        // Fallback to gemini-1.0-pro if 1.5-flash isn't available
        try {
            console.log('⚠️ Falling back to gemini-1.0-pro...');
            return genAI.getGenerativeModel({
                model: "gemini-1.0-pro",
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 2048,
                },
            });
        } catch (fallbackError) {
            console.error('❌ Fallback also failed:', fallbackError.message);
            throw new Error('No available Gemini models');
        }
    }
};

// Get chat model with system instruction
const getChatModel = () => {
    try {
        // Use gemini-1.5-flash for chat (it supports system instructions)
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
                temperature: 0.3,
                topK: 32,
                topP: 0.95,
                maxOutputTokens: 2048,
            },
        });
        return model;
    } catch (error) {
        console.error('Error creating chat model:', error.message);
        // Fallback to gemini-1.0-pro (no system instructions, but works)
        try {
            console.log('⚠️ Falling back to gemini-1.0-pro for chat...');
            const model = genAI.getGenerativeModel({
                model: "gemini-1.0-pro",
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 2048,
                },
            });
            return model;
        } catch (fallbackError) {
            console.error('❌ Fallback also failed:', fallbackError.message);
            throw new Error('No available Gemini models');
        }
    }
};

// Optional: List available models (for debugging)
const listAvailableModels = async () => {
    try {
        const models = await genAI.listModels();
        console.log('✅ Available models:', models.models.map(m => m.name).join(', '));
        return models;
    } catch (error) {
        console.error('Error listing models:', error.message);
        return null;
    }
};

module.exports = { 
    getModel, 
    getChatModel,
    listAvailableModels,
    genAI // Export for debugging
};

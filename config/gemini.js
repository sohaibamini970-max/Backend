// config/gemini.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Get API key from environment
const apiKey =
    process.env.GOOGLE_AI_API_KEY;

if (!apiKey) {
    console.error('❌ GOOGLE_API_KEY is not set');
    console.error(
        'Get your API key from: https://aistudio.google.com/app/apikey'
    );
}

// Initialize Gemini
const genAI = new GoogleGenerativeAI(apiKey);

// Current Gemini model
const MODEL_NAME = "gemini-3.5-flash";

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
        throw new Error('Failed to initialize Gemini model');
    }
};

// Get chat model
const getChatModel = () => {
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
        console.error('Error creating chat model:', error.message);
        throw new Error('Failed to initialize chat model');
    }
};

// List available models
const listAvailableModels = async () => {
    try {
        const result = await genAI.listModels();

        console.log(
            '✅ Available models:',
            result.models.map(m => m.name).join(', ')
        );

        return result;
    } catch (error) {
        console.error(
            '❌ Error listing models:',
            error.message
        );

        return null;
    }
};

module.exports = {
    getModel,
    getChatModel,
    listAvailableModels,
};

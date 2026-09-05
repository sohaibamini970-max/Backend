// routes/aiAgentRoutes.js
const express = require('express');
const router = express.Router();
const aiAgentController = require('../controllers/aiAgentController');
const {authenticate} = require('../middleware/authMiddleware'); 

/**
 * @route   POST /api/ai/chat
 * @desc    Chat with the AI agent
 * @access  Private (All authenticated users)
 * @body    { message: string, conversationHistory?: array }
 */
router.post('/chat',authenticate, aiAgentController.handleAIAgent);

/**
 * @route   POST /api/ai/generate-description
 * @desc    Generate a project description
 * @access  Private
 * @body    { projectName: string, domain?: string }
 */
router.post('/generate-description',authenticate, async (req, res) => {
    try {
        const { projectName, domain } = req.body;
        
        if (!projectName) {
            return res.status(400).json({
                success: false,
                error: 'Project name is required'
            });
        }

        // Import the function directly
        const { generateProjectDescription } = require('../controllers/aiAgentController');
        
        const description = await generateProjectDescription(projectName, domain);
        
        return res.status(200).json({
            success: true,
            description: description
        });
    } catch (error) {
        console.error('Generate description error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;

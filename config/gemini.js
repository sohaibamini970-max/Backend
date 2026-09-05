// config/gemini.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Get the model
const getModel = () => {
    return genAI.getGenerativeModel({
        model: "gemini-3.6-pro", // or "gemini-1.5-flash" for faster responses
        generationConfig: {
            temperature: 0.3,
            topK: 32,
            topP: 0.95,
            maxOutputTokens: 8192,
        },
    });
};

// Get chat model with system instruction
const getChatModel = () => {
    return genAI.getGenerativeModel({
        model: "gemini-3.6-pro",
        systemInstruction: `You are an AI assistant for a Project Management System. 
        You can help users manage projects, tasks, assignments, and submissions.
        You have access to the following functions/tools:
        
        1. createProject - Creates a new project
        2. updateProject - Updates existing project
        3. deleteProject - Deletes a project
        4. assignProject - Assigns project to a manager
        5. unassignProject - Unassigns project from manager
        6. createTask - Creates a new task
        7. updateTaskStatus - Updates task status
        8. deleteTask - Deletes a task
        9. submitWork - Submits work for a task
        10. getProjects - Lists all projects
        11. getTasks - Lists tasks for a project or user
        12. getUsers - Lists all users
        13. getProjectManagers - Lists project managers
        
        When a user asks to perform an action, extract the required parameters
        and call the appropriate function. If any required parameters are missing,
        ask the user for them.
        
        For project creation, if no description is provided, generate a professional
        project description based on the project name and domain.
        
        Always check role-based permissions:
        - Only Executive Manager and System Administrator can create projects
        - Only Executive Manager and System Administrator can delete projects
        - Only Project Manager can change project status
        - Only Members can submit work for tasks assigned to them
        
        Respond in a helpful, professional tone. Be concise but thorough.`,
        generationConfig: {
            temperature: 0.3,
            topK: 32,
            topP: 0.95,
            maxOutputTokens: 8192,
        },
    });
};

module.exports = { getModel, getChatModel };

// controllers/aiAgentController.js
const { getChatModel, getModel } = require('../config/gemini');
const projectController = require('./projectcontroller');
const taskController = require('./taskcontroller');
const userController = require('./usercontroller');
const submissionController = require('./tasksubmissioncontroller');

// Helper to get current user
const getCurrentUser = (req) => {
    return req.user || null;
};

// Generate project description
const generateProjectDescription = async (projectName, domain) => {
    try {
        const model = getModel();
        const prompt = `
        Generate a professional project description for a project called "${projectName}" 
        ${domain ? `in the domain of "${domain}"` : ''}.
        
        The description should be 2-3 sentences explaining:
        1. What the project aims to achieve
        2. Key objectives
        3. Expected outcomes
        
        Be professional, concise, and specific.
        `;

        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.error('Error generating description:', error);
        return `A project focused on ${projectName} to deliver value.`;
    }
};

exports.generateProjectDescription = generateProjectDescription;

// Function definitions
const functions = {
    createProject: async (params, user) => {
        const { name, domain, aboutTitle, aboutDescription, startDate, deadline, priority } = params;
        
        if (!['Executive Manager', 'System Administrator'].includes(user?.role)) {
            return { success: false, error: 'Only Executive Managers and System Administrators can create projects.' };
        }

        if (!name) {
            return { success: false, error: 'Project name is required.' };
        }

        let description = aboutDescription;
        if (!description && name) {
            description = await generateProjectDescription(name, domain);
        }

        const req = {
            body: {
                name,
                domain: domain || null,
                aboutTitle: aboutTitle || name,
                aboutDescription: description,
                startDate: startDate || null,
                deadline: deadline || null,
                priority: priority || 'Medium'
            },
            user: user
        };

        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        try {
            const result = await projectController.createProject(req, res);
            return result.data || result;
        } catch (error) {
            return { success: false, error: error.message || 'Failed to create project' };
        }
    },

    getProjects: async (params, user) => {
        const req = { user };
        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        try {
            const result = await projectController.getProjects(req, res);
            return result.data || result;
        } catch (error) {
            return { success: false, error: error.message || 'Failed to get projects' };
        }
    },

    createTask: async (params, user) => {
        const { projectId, name, description, status, priority, assigneeId, startDate, dueDate } = params;

        if (!['Executive Manager', 'System Administrator', 'Project Manager'].includes(user?.role)) {
            return { success: false, error: 'Only Project Managers and above can create tasks.' };
        }

        if (!projectId || !name) {
            return { success: false, error: 'Project ID and Task name are required.' };
        }

        const req = {
            params: { projectId },
            body: {
                name,
                description: description || null,
                status: status || 'To Do',
                priority: priority || 'Medium',
                assigneeId: assigneeId || null,
                startDate: startDate || null,
                dueDate: dueDate || null
            },
            user: user
        };

        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        try {
            const result = await taskController.createTask(req, res);
            return result.data || result;
        } catch (error) {
            return { success: false, error: error.message || 'Failed to create task' };
        }
    },

    assignProject: async (params, user) => {
        const { projectId, managerId } = params;

        if (!['Executive Manager', 'System Administrator', 'Project Manager'].includes(user?.role)) {
            return { success: false, error: 'Only managers can assign projects.' };
        }

        if (!projectId || !managerId) {
            return { success: false, error: 'Project ID and Manager ID are required.' };
        }

        const req = {
            params: { projectId },
            body: { managerId },
            user: user
        };

        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        try {
            const result = await projectController.assignProject(req, res);
            return result.data || result;
        } catch (error) {
            return { success: false, error: error.message || 'Failed to assign project' };
        }
    },

    updateTaskStatus: async (params, user) => {
        const { taskId, status } = params;

        if (!['Executive Manager', 'System Administrator', 'Project Manager'].includes(user?.role)) {
            return { success: false, error: 'Only Project Managers and above can update task status.' };
        }

        if (!taskId || !status) {
            return { success: false, error: 'Task ID and status are required.' };
        }

        const req = {
            params: { taskId },
            body: { status },
            user: user
        };

        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        try {
            const result = await taskController.updateTaskStatus(req, res);
            return result.data || result;
        } catch (error) {
            return { success: false, error: error.message || 'Failed to update task status' };
        }
    },

    deleteTask: async (params, user) => {
        const { taskId } = params;

        if (!['Executive Manager', 'System Administrator', 'Project Manager'].includes(user?.role)) {
            return { success: false, error: 'Only Project Managers and above can delete tasks.' };
        }

        if (!taskId) {
            return { success: false, error: 'Task ID is required.' };
        }

        const req = {
            params: { taskId },
            user: user
        };

        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        try {
            const result = await taskController.deleteTask(req, res);
            return result.data || result;
        } catch (error) {
            return { success: false, error: error.message || 'Failed to delete task' };
        }
    },

    submitWork: async (params, user) => {
        const { taskId, link, description } = params;

        if (user?.role !== 'Member') {
            return { success: false, error: 'Only Members can submit work for tasks.' };
        }

        if (!taskId || !link) {
            return { success: false, error: 'Task ID and link are required.' };
        }

        const req = {
            params: { taskId },
            body: { link, description: description || null },
            user: user
        };

        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        try {
            const result = await submissionController.addSubmission(req, res);
            return result.data || result;
        } catch (error) {
            return { success: false, error: error.message || 'Failed to submit work' };
        }
    },

    getProjectManagers: async (params, user) => {
        const req = { user };
        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        try {
            const result = await projectController.getProjectManagers(req, res);
            return result.data || result;
        } catch (error) {
            return { success: false, error: error.message || 'Failed to get project managers' };
        }
    },

    getUsers: async (params, user) => {
        const req = { user };
        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        try {
            const result = await userController.getUsers(req, res);
            return result.data || result;
        } catch (error) {
            return { success: false, error: error.message || 'Failed to get users' };
        }
    }
};

// Parse AI response for function calls
const parseAIResponse = (response) => {
    const functionRegex = /\[FUNCTION:(\w+)\]({[^}]*})/g;
    const match = functionRegex.exec(response);

    if (match) {
        try {
            const functionName = match[1];
            const arguments = JSON.parse(match[2]);
            return {
                function_call: { name: functionName, arguments: arguments },
                response: response.replace(match[0], '').trim()
            };
        } catch (error) {
            console.error('Failed to parse function call:', error);
        }
    }

    return { function_call: null, response };
};

// Generate final response
const generateFinalResponse = async (functionName, result, user) => {
    try {
        const model = getModel();
        const prompt = `
        A user executed the function "${functionName}".
        Result: ${JSON.stringify(result, null, 2)}
        
        Generate a brief, professional response summarizing what happened.
        If successful, confirm with details.
        If error, explain clearly.
        Keep it to 2-3 sentences.
        `;

        const aiResult = await model.generateContent(prompt);
        return aiResult.response.text().trim();
    } catch (error) {
        console.error('Error generating final response:', error);
        return `Executed ${functionName}. Check the results for details.`;
    }
};

// Main handler
exports.handleAIAgent = async (req, res) => {
    try {
        const { message, conversationHistory = [] } = req.body;
        const user = getCurrentUser(req);

        console.log('=== AI Agent Request ===');
        console.log('User:', user?.id, user?.role);
        console.log('Message:', message?.substring(0, 50) + '...');

        if (!message) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }

        // Check API key
        const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                error: 'Google AI API key is not configured.'
            });
        }

        // Get chat model
        let model;
        try {
            model = getChatModel();
        } catch (error) {
            console.error('Model init error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to initialize AI model. Please check your API key.'
            });
        }

        // Build the prompt with system instructions (since gemini-1.0-pro doesn't support systemInstruction)
        const systemInstruction = `You are an AI assistant for a Project Management System.
        
        You can help users manage projects, tasks, assignments, and submissions.
        
        Available functions:
        1. createProject - Creates a new project (params: name, domain, aboutTitle, aboutDescription, startDate, deadline, priority)
        2. getProjects - Lists all projects
        3. createTask - Creates a new task (params: projectId, name, description, status, priority, assigneeId, startDate, dueDate)
        4. updateTaskStatus - Updates task status (params: taskId, status)
        5. deleteTask - Deletes a task (params: taskId)
        6. assignProject - Assigns project to manager (params: projectId, managerId)
        7. submitWork - Submits work for a task (params: taskId, link, description)
        8. getProjectManagers - Lists project managers
        9. getUsers - Lists all users
        
        When a user asks to perform an action, use this format:
        [FUNCTION:functionName]{"param1":"value1","param2":"value2"}
        
        For project creation, if no description is provided, generate a professional description.
        
        Always check role-based permissions.
        Respond in a helpful, professional tone. Be concise but thorough.`;

        // Start chat with history and system instruction in the prompt
        const chat = model.startChat({
            history: [
                // Add system instruction as first message
                { role: 'user', parts: [{ text: systemInstruction }] },
                { role: 'model', parts: [{ text: 'I understand. I will help with project management tasks.' }] },
                ...conversationHistory.slice(-5).map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                }))
            ]
        });

        // Send message
        console.log('Sending to Gemini...');
        const result = await chat.sendMessage(message);
        const aiResponse = result.response.text();
        console.log('Gemini response received');

        // Parse for function calls
        const parsed = parseAIResponse(aiResponse);

        if (parsed.function_call) {
            const functionName = parsed.function_call.name;
            const params = parsed.function_call.arguments;
            console.log(`Executing: ${functionName}`, params);

            if (functions[functionName]) {
                try {
                    const executionResult = await functions[functionName](params, user);
                    const finalResponse = await generateFinalResponse(functionName, executionResult, user);

                    return res.status(200).json({
                        success: true,
                        message: finalResponse,
                        data: executionResult,
                        function_called: functionName
                    });
                } catch (error) {
                    return res.status(500).json({
                        success: false,
                        error: `Function execution failed: ${error.message}`
                    });
                }
            } else {
                return res.status(400).json({
                    success: false,
                    error: `Function "${functionName}" not found`
                });
            }
        }

        // No function call
        return res.status(200).json({
            success: true,
            message: aiResponse,
            data: null,
            function_called: null
        });

    } catch (error) {
        console.error('AI Agent error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to process AI request'
        });
    }
};

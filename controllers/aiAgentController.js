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

// Helper to safely execute controller functions
const safeExecute = async (controllerFn, req, res) => {
    try {
        const result = await controllerFn(req, res);
        return result;
    } catch (error) {
        console.error('Controller execution error:', error);
        return {
            success: false,
            error: error.message || 'Operation failed'
        };
    }
};

// Function definitions with better error handling
const functions = {
    createProject: async (params, user) => {
        const { name, domain, aboutTitle, aboutDescription, startDate, deadline, priority } = params;
        
        console.log('🔍 createProject called with:', { name, domain, priority, userRole: user?.role });
        
        // Check permissions
        if (!['Executive Manager', 'System Administrator'].includes(user?.role)) {
            console.log('❌ Permission denied. User role:', user?.role);
            return { 
                success: false, 
                error: `Only Executive Managers and System Administrators can create projects. Your role: ${user?.role || 'Unknown'}`
            };
        }

        if (!name) {
            console.log('❌ Project name is missing');
            return { success: false, error: 'Project name is required.' };
        }

        // Generate description if not provided
        let description = aboutDescription;
        if (!description && name) {
            console.log('📝 Generating description for:', name);
            try {
                description = await generateProjectDescription(name, domain);
                console.log('✅ Description generated successfully');
            } catch (error) {
                console.error('❌ Failed to generate description:', error);
                description = `A project focused on ${name} to deliver value.`;
            }
        }

        // Prepare request
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

        console.log('📤 Sending to projectController.createProject');

        const res = {
            status: (code) => ({
                json: (data) => {
                    console.log(`📥 Response status ${code}:`, data);
                    return { status: code, data };
                },
                send: (data) => {
                    console.log('📥 Response send:', data);
                    return { data };
                }
            })
        };

        try {
            const result = await projectController.createProject(req, res);
            console.log('✅ Project creation result:', result);
            
            // Check if result has data property
            if (result && result.data) {
                return result.data;
            }
            return result || { success: true, message: 'Project created successfully' };
        } catch (error) {
            console.error('❌ Project creation error:', error);
            return { 
                success: false, 
                error: error.message || 'Failed to create project',
                details: error.stack
            };
        }
    },

    getProjects: async (params, user) => {
        console.log('🔍 getProjects called for user:', user?.id);
        
        const req = { user };
        const res = {
            status: (code) => ({
                json: (data) => {
                    console.log(`📥 Projects response status ${code}`);
                    return { status: code, data };
                },
                send: (data) => {
                    console.log('📥 Projects response send');
                    return { data };
                }
            })
        };

        try {
            const result = await projectController.getProjects(req, res);
            console.log('✅ Projects fetched successfully');
            return result.data || result || { success: true, projects: [] };
        } catch (error) {
            console.error('❌ Get projects error:', error);
            return { 
                success: false, 
                error: error.message || 'Failed to get projects' 
            };
        }
    },

    createTask: async (params, user) => {
        const { projectId, name, description, status, priority, assigneeId, startDate, dueDate } = params;

        console.log('🔍 createTask called:', { projectId, name, userRole: user?.role });

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
            console.error('❌ Create task error:', error);
            return { success: false, error: error.message || 'Failed to create task' };
        }
    },

    assignProject: async (params, user) => {
        const { projectId, managerId } = params;

        console.log('🔍 assignProject called:', { projectId, managerId, userRole: user?.role });

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
            console.error('❌ Assign project error:', error);
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
            console.error('❌ Update task status error:', error);
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
            console.error('❌ Delete task error:', error);
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
            console.error('❌ Submit work error:', error);
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
            console.error('❌ Get project managers error:', error);
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
            console.error('❌ Get users error:', error);
            return { success: false, error: error.message || 'Failed to get users' };
        }
    }
};

// Parse AI response for function calls
const parseAIResponse = (response) => {
    console.log('🔍 Parsing AI response:', response?.substring(0, 200) + '...');
    
    const functionRegex = /\[FUNCTION:(\w+)\]({[^}]*})/g;
    const match = functionRegex.exec(response);

    if (match) {
        try {
            const functionName = match[1];
            const arguments = JSON.parse(match[2]);
            console.log(`✅ Parsed function: ${functionName}`, arguments);
            return {
                function_call: { name: functionName, arguments: arguments },
                response: response.replace(match[0], '').trim()
            };
        } catch (error) {
            console.error('❌ Failed to parse function call:', error);
            console.error('Raw match:', match[0]);
        }
    }

    console.log('ℹ️ No function call found in response');
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

        console.log('=== 🤖 AI Agent Request ===');
        console.log('User:', user?.id, user?.role);
        console.log('Message:', message?.substring(0, 100) + '...');

        if (!message) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }

        // Check API key
        const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
        if (!apiKey) {
            console.error('❌ Google AI API key is not configured');
            return res.status(500).json({
                success: false,
                error: 'Google AI API key is not configured. Please add GOOGLE_API_KEY to your environment variables.'
            });
        }
        console.log('✅ API key configured');

        // Get chat model
        let model;
        try {
            model = getChatModel();
            console.log('✅ Chat model initialized');
        } catch (error) {
            console.error('❌ Model init error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to initialize AI model. Please check your API key.'
            });
        }

        // Build the prompt with system instructions
        const systemInstruction = `
You are an AI assistant for a Project Management System.

You can help users manage projects, tasks, assignments, and submissions.

AVAILABLE FUNCTIONS:

1. createProject
Parameters:
{
  "name": "string",
  "domain": "string|null",
  "aboutTitle": "string|null",
  "aboutDescription": "string|null",
  "startDate": "YYYY-MM-DD|null",
  "deadline": "YYYY-MM-DD|null",
  "priority": "Low|Medium|High"
}

2. getProjects
Parameters: {}

3. createTask
Parameters:
{
  "projectId": "string",
  "name": "string",
  "description": "string|null",
  "status": "string|null",
  "priority": "Low|Medium|High",
  "assigneeId": "string|null",
  "startDate": "YYYY-MM-DD|null",
  "dueDate": "YYYY-MM-DD|null"
}

4. updateTaskStatus
Parameters:
{
  "taskId": "string",
  "status": "string"
}

5. deleteTask
Parameters:
{
  "taskId": "string"
}

6. assignProject
Parameters:
{
  "projectId": "string",
  "managerId": "string"
}

7. submitWork
Parameters:
{
  "taskId": "string",
  "link": "string",
  "description": "string|null"
}

8. getProjectManagers
Parameters: {}

9. getUsers
Parameters: {}

FUNCTION CALL RULES:

When the user asks you to perform an action, return EXACTLY:

[FUNCTION:functionName]{"param":"value"}

IMPORTANT:
- Return valid JSON.
- Do NOT use Markdown.
- Do NOT wrap the JSON in code fences.
- Do NOT add text before the [FUNCTION:...] marker.
- Do NOT add text after the JSON.
- Use double quotes for JSON keys and string values.
- Do not invent missing IDs.
- Do not invent dates.
- If an optional parameter is not provided, omit it or use null.
- For priority, use exactly Low, Medium, or High.
- For project creation, if the user only provides a name and priority, only send those values.
- Always respect the user's role and the backend permission rules.

Examples:

User: Create a new project called AI Content Generator with high priority
Assistant: [FUNCTION:createProject]{"name":"AI Content Generator","priority":"High"}

User: Create a project called Website Redesign
Assistant: [FUNCTION:createProject]{"name":"Website Redesign"}

User: Create a high priority project called Mobile App
Assistant: [FUNCTION:createProject]{"name":"Mobile App","priority":"High"}

User: Show me all my projects
Assistant: [FUNCTION:getProjects]{}

Be concise and professional.
`;

        // Start chat with history
        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: systemInstruction }] },
                { role: 'model', parts: [{ text: 'I understand. I will help with project management tasks.' }] },
                ...conversationHistory.slice(-5).map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                }))
            ]
        });

        // Send message
        console.log('📤 Sending to Gemini...');
        const result = await chat.sendMessage(message);
        const aiResponse = result.response.text();
        console.log('📥 Gemini response received');

        // Parse for function calls
        const parsed = parseAIResponse(aiResponse);

        if (parsed.function_call) {
            const functionName = parsed.function_call.name;
            const params = parsed.function_call.arguments;
            console.log(`⚡ Executing function: ${functionName}`, params);

            if (functions[functionName]) {
                try {
                    const executionResult = await functions[functionName](params, user);
                    console.log(`✅ Function ${functionName} executed`, executionResult);
                    
                    const finalResponse = await generateFinalResponse(functionName, executionResult, user);

                    return res.status(200).json({
                        success: true,
                        message: finalResponse,
                        data: executionResult,
                        function_called: functionName
                    });
                } catch (error) {
                    console.error(`❌ Function execution failed: ${functionName}`, error);
                    return res.status(500).json({
                        success: false,
                        error: `Function execution failed: ${error.message}`
                    });
                }
            } else {
                console.error(`❌ Function "${functionName}" not found`);
                return res.status(400).json({
                    success: false,
                    error: `Function "${functionName}" not found`,
                    available_functions: Object.keys(functions)
                });
            }
        }

        // No function call - return AI response directly
        console.log('ℹ️ No function call detected, returning AI response');
        return res.status(200).json({
            success: true,
            message: aiResponse,
            data: null,
            function_called: null
        });

    } catch (error) {
        console.error('❌ AI Agent error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to process AI request',
            ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
        });
    }
};

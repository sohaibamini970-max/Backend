// controllers/aiAgentController.js
const { getChatModel } = require('../config/gemini');
const projectController = require('./projectController');
const taskController = require('./taskController');
const userController = require('./userController');
const submissionController = require('./taskSubmissionController');

// Helper to get current user from request
const getCurrentUser = (req) => {
    return req.user || null;
};

// ============================================================
// FUNCTION DEFINITIONS FOR THE AI AGENT
// ============================================================

const functions = {
    // Project functions
    createProject: async (params, user) => {
        const { name, domain, aboutTitle, aboutDescription, startDate, deadline, priority } = params;
        
        // Check permissions
        if (!['Executive Manager', 'System Administrator'].includes(user?.role)) {
            return {
                success: false,
                error: 'Only Executive Managers and System Administrators can create projects.',
                permission_required: 'Executive Manager or System Administrator'
            };
        }

        // Validate required fields
        if (!name) {
            return {
                success: false,
                error: 'Project name is required.',
                missing_fields: ['name']
            };
        }

        // Generate description if not provided
        let description = aboutDescription;
        if (!description && name) {
            description = await generateProjectDescription(name, domain);
        }

        // Create the project
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

        const result = await projectController.createProject(req, res);
        return result.data || result;
    },

    updateProject: async (params, user) => {
        const { projectId, name, domain, aboutTitle, aboutDescription, startDate, deadline, priority } = params;

        if (!['Executive Manager', 'System Administrator'].includes(user?.role)) {
            return {
                success: false,
                error: 'Only Executive Managers and System Administrators can update projects.'
            };
        }

        if (!projectId) {
            return {
                success: false,
                error: 'Project ID is required.',
                missing_fields: ['projectId']
            };
        }

        const req = {
            params: { projectId },
            body: {
                name,
                domain,
                aboutTitle,
                aboutDescription,
                startDate,
                deadline,
                priority
            },
            user: user
        };

        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        const result = await projectController.updateProject(req, res);
        return result.data || result;
    },

    deleteProject: async (params, user) => {
        const { projectId } = params;

        if (!['Executive Manager', 'System Administrator'].includes(user?.role)) {
            return {
                success: false,
                error: 'Only Executive Managers and System Administrators can delete projects.'
            };
        }

        if (!projectId) {
            return {
                success: false,
                error: 'Project ID is required.',
                missing_fields: ['projectId']
            };
        }

        const req = {
            params: { projectId },
            user: user
        };

        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        const result = await projectController.deleteProject(req, res);
        return result.data || result;
    },

    assignProject: async (params, user) => {
        const { projectId, managerId } = params;

        if (!['Executive Manager', 'System Administrator', 'Project Manager'].includes(user?.role)) {
            return {
                success: false,
                error: 'Only Executive Managers, System Administrators, and Project Managers can assign projects.'
            };
        }

        if (!projectId || !managerId) {
            return {
                success: false,
                error: 'Project ID and Manager ID are required.',
                missing_fields: ['projectId', 'managerId']
            };
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

        const result = await projectController.assignProject(req, res);
        return result.data || result;
    },

    unassignProject: async (params, user) => {
        const { projectId } = params;

        if (!['Executive Manager', 'System Administrator', 'Project Manager'].includes(user?.role)) {
            return {
                success: false,
                error: 'Only Executive Managers, System Administrators, and Project Managers can unassign projects.'
            };
        }

        if (!projectId) {
            return {
                success: false,
                error: 'Project ID is required.',
                missing_fields: ['projectId']
            };
        }

        const req = {
            params: { projectId },
            user: user
        };

        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        const result = await projectController.unassignProject(req, res);
        return result.data || result;
    },

    updateProjectStatus: async (params, user) => {
        const { projectId, status } = params;

        if (!['Project Manager'].includes(user?.role)) {
            return {
                success: false,
                error: 'Only Project Managers can update project status.'
            };
        }

        const allowedStatuses = ['Unassigned', 'Backlog', 'In Progress', 'Paused', 'Done'];
        if (!status || !allowedStatuses.includes(status)) {
            return {
                success: false,
                error: `Invalid status. Allowed: ${allowedStatuses.join(', ')}`,
                allowed_statuses: allowedStatuses
            };
        }

        const req = {
            params: { projectId },
            body: { status },
            user: user
        };

        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        const result = await projectController.updateProjectStatus(req, res);
        return result.data || result;
    },

    // Task functions
    createTask: async (params, user) => {
        const { projectId, name, description, status, priority, assigneeId, startDate, dueDate } = params;

        // Check if user can create tasks (Project Manager or higher)
        if (!['Executive Manager', 'System Administrator', 'Project Manager'].includes(user?.role)) {
            return {
                success: false,
                error: 'Only Project Managers, Executive Managers, and System Administrators can create tasks.'
            };
        }

        if (!projectId || !name) {
            return {
                success: false,
                error: 'Project ID and Task name are required.',
                missing_fields: ['projectId', 'name']
            };
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

        // We need to adapt the task creation
        const result = await taskController.createTask(req, res);
        return result.data || result;
    },

    updateTaskStatus: async (params, user) => {
        const { taskId, status } = params;

        if (!['Executive Manager', 'System Administrator', 'Project Manager'].includes(user?.role)) {
            return {
                success: false,
                error: 'Only Project Managers and above can update task status.'
            };
        }

        if (!taskId || !status) {
            return {
                success: false,
                error: 'Task ID and status are required.',
                missing_fields: ['taskId', 'status']
            };
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

        const result = await taskController.updateTaskStatus(req, res);
        return result.data || result;
    },

    deleteTask: async (params, user) => {
        const { taskId } = params;

        if (!['Executive Manager', 'System Administrator', 'Project Manager'].includes(user?.role)) {
            return {
                success: false,
                error: 'Only Project Managers and above can delete tasks.'
            };
        }

        if (!taskId) {
            return {
                success: false,
                error: 'Task ID is required.',
                missing_fields: ['taskId']
            };
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

        const result = await taskController.deleteTask(req, res);
        return result.data || result;
    },

    submitWork: async (params, user) => {
        const { taskId, link, description } = params;

        // Only Members can submit work
        if (user?.role !== 'Member') {
            return {
                success: false,
                error: 'Only Members can submit work for tasks.'
            };
        }

        if (!taskId || !link) {
            return {
                success: false,
                error: 'Task ID and link are required.',
                missing_fields: ['taskId', 'link']
            };
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

        const result = await submissionController.addSubmission(req, res);
        return result.data || result;
    },

    // Get functions
    getProjects: async (params, user) => {
        const req = { user };
        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        const result = await projectController.getProjects(req, res);
        return result.data || result;
    },

    getProjectManagers: async (params, user) => {
        const req = { user };
        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        const result = await projectController.getProjectManagers(req, res);
        return result.data || result;
    },

    getUsers: async (params, user) => {
        const req = { user };
        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        const result = await userController.getUsers(req, res);
        return result.data || result;
    },

    getTasks: async (params, user) => {
        const { projectId, userId } = params;

        if (!projectId && !userId) {
            return {
                success: false,
                error: 'Either projectId or userId is required.',
                missing_fields: ['projectId or userId']
            };
        }

        const req = {
            params: projectId ? { projectId } : {},
            query: userId ? { userId } : {},
            user: user
        };

        const res = {
            status: (code) => ({
                json: (data) => ({ status: code, data }),
                send: (data) => ({ data })
            })
        };

        let result;
        if (projectId) {
            result = await taskController.getTasksByProject(req, res);
        } else {
            result = await taskController.getMyTasks(req, res);
        }
        return result.data || result;
    }
};

// ============================================================
// GENERATE PROJECT DESCRIPTION
// ============================================================

const generateProjectDescription = async (projectName, domain) => {
    try {
        const { getModel } = require('../config/gemini');
        const model = getModel();

        const prompt = `
        Generate a professional project description for a project called "${projectName}" 
        ${domain ? `in the domain of "${domain}"` : ''}.
        
        The description should be 2-3 sentences explaining:
        1. What the project aims to achieve
        2. Key objectives
        3. Expected outcomes
        
        Be professional, concise, and specific. Do not include any markdown or formatting.
        `;

        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.error('Error generating project description:', error);
        return `A project focused on ${projectName} to deliver value and achieve organizational goals.`;
    }
};

// ============================================================
// MAIN AI AGENT HANDLER
// ============================================================

exports.handleAIAgent = async (req, res) => {
    try {
        const { message, conversationHistory = [] } = req.body;
        const user = getCurrentUser(req);

        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        if (!process.env.GOOGLE_AI_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Google AI API key is not configured'
            });
        }

        // Get the chat model
        const model = getChatModel();
        
        // Start chat with history
        const chat = model.startChat({
            history: conversationHistory.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }))
        });

        // Send the user message
        const result = await chat.sendMessage(message);
        const aiResponse = result.response.text();

        // Parse the response for function calls
        const parsed = parseAIResponse(aiResponse);

        if (parsed.function_call) {
            // Execute the requested function
            const functionName = parsed.function_call.name;
            const params = parsed.function_call.arguments;

            if (functions[functionName]) {
                try {
                    const executionResult = await functions[functionName](params, user);
                    
                    // Generate final response based on execution result
                    const finalResponse = await generateFinalResponse(
                        functionName,
                        executionResult,
                        user
                    );

                    return res.status(200).json({
                        success: true,
                        message: finalResponse,
                        data: executionResult,
                        function_called: functionName,
                        requires_action: false
                    });
                } catch (error) {
                    return res.status(500).json({
                        success: false,
                        error: `Failed to execute function ${functionName}: ${error.message}`
                    });
                }
            } else {
                return res.status(400).json({
                    success: false,
                    error: `Function "${functionName}" not found`,
                    available_functions: Object.keys(functions)
                });
            }
        }

        // If no function call, return the AI response
        return res.status(200).json({
            success: true,
            message: aiResponse,
            data: null,
            function_called: null,
            requires_action: false
        });

    } catch (error) {
        console.error('AI Agent error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to process AI request'
        });
    }
};

// ============================================================
// PARSE AI RESPONSE FOR FUNCTION CALLS
// ============================================================

const parseAIResponse = (response) => {
    // Look for function call patterns in the response
    // Format: [FUNCTION:functionName]{"param1":"value1","param2":"value2"}
    const functionRegex = /\[FUNCTION:(\w+)\]({[^}]*})/g;
    const match = functionRegex.exec(response);

    if (match) {
        try {
            const functionName = match[1];
            const arguments = JSON.parse(match[2]);
            return {
                function_call: {
                    name: functionName,
                    arguments: arguments
                },
                response: response.replace(match[0], '').trim()
            };
        } catch (error) {
            console.error('Failed to parse function call:', error);
        }
    }

    // Alternative format: functionName({param1: "value1", param2: "value2"})
    const altRegex = /(\w+)\(({[^}]*})\)/g;
    const altMatch = altRegex.exec(response);

    if (altMatch) {
        try {
            const functionName = altMatch[1];
            // Convert to valid JSON (replace single quotes if needed)
            let argsStr = altMatch[2];
            argsStr = argsStr.replace(/(\w+):/g, '"$1":');
            argsStr = argsStr.replace(/'/g, '"');
            const arguments = JSON.parse(argsStr);
            
            return {
                function_call: {
                    name: functionName,
                    arguments: arguments
                },
                response: response.replace(altMatch[0], '').trim()
            };
        } catch (error) {
            console.error('Failed to parse alternative function call:', error);
        }
    }

    return { function_call: null, response };
};

// ============================================================
// GENERATE FINAL RESPONSE
// ============================================================

const generateFinalResponse = async (functionName, result, user) => {
    try {
        const { getModel } = require('../config/gemini');
        const model = getModel();

        const userContext = user ? `
        Current User:
        - ID: ${user.id}
        - Name: ${user.full_name}
        - Role: ${user.role}
        ` : 'User not authenticated';

        const prompt = `
        You are an AI assistant for a Project Management System.
        
        ${userContext}
        
        A user requested to execute the function "${functionName}".
        The result of the execution was:
        ${JSON.stringify(result, null, 2)}
        
        Generate a clear, professional response summarizing what happened.
        If the operation was successful, confirm success and provide relevant details.
        If there was an error, explain the error clearly and suggest next steps.
        
        Keep your response concise (2-3 sentences) and friendly.
        `;

        const aiResult = await model.generateContent(prompt);
        return aiResult.response.text().trim();
    } catch (error) {
        console.error('Error generating final response:', error);
        return `Successfully executed ${functionName}. Check the results for details.`;
    }
};

// ============================================================
// VALIDATE PROJECT CREATION PARAMETERS
// ============================================================

exports.validateProjectParams = (params) => {
    const required = ['name'];
    const missing = required.filter(field => !params[field]);
    
    if (missing.length > 0) {
        return {
            valid: false,
            missing: missing,
            message: `Missing required fields: ${missing.join(', ')}`
        };
    }

    // Generate description if missing
    if (!params.aboutDescription && params.name) {
        // Will be handled by the function
    }

    return { valid: true };
};

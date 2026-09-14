// controllers/aiProgramAgentController.js
const { getChatModel, getModel } = require('../config/gemini');
const pool = require('../config/db');

/* =========================================================
   HELPER: safe query
========================================================= */

const safeQuery = async (text, params) => {
    const client = await pool.connect();
    try {
        return await client.query(text, params);
    } finally {
        client.release();
    }
};

/* =========================================================
   HELPERS: permission + role utilities
========================================================= */

const MANAGEMENT_ROLES = [
    "Project Manager",
    "Executive Manager",
    "System Administrator",
];

const isManagementRole = (role) => MANAGEMENT_ROLES.includes(role);

const ACTION_PERMISSIONS = {
    // Programs
    createProgram: ["Executive Manager", "System Administrator"],
    updateProgram: ["Executive Manager", "System Administrator"],
    deleteProgram: ["Executive Manager", "System Administrator"],

    // Program Projects
    createProgramProject: [
        "Executive Manager",
        "System Administrator",
        "Project Manager",
    ],
    updateProgramProject: [
        "Executive Manager",
        "System Administrator",
        "Project Manager",
    ],
    assignProgramProject: ["Executive Manager", "System Administrator"],
    assignProgramProjectMembers: [
        "Executive Manager",
        "System Administrator",
        "Project Manager",
    ],

    // Program Tasks
    createProgramTask: [
        "Executive Manager",
        "System Administrator",
        "Project Manager",
        "Member",
    ],
    assignProgramTask: [
        "Executive Manager",
        "System Administrator",
        "Project Manager",
    ],
    assignAllProgramProjectTasks: [
        "Executive Manager",
        "System Administrator",
        "Project Manager",
    ],
    updateProgramTaskStatus: [
        "Executive Manager",
        "System Administrator",
        "Project Manager",
        "Member",
    ],
    deleteProgramTask: [
        "Executive Manager",
        "System Administrator",
        "Project Manager",
    ],
};

const checkActionPermission = (functionName, user) => {
    const allowedRoles = ACTION_PERMISSIONS[functionName];
    if (!allowedRoles) return { allowed: true };

    const userRole = String(user?.role || "").trim();
    if (!allowedRoles.includes(userRole)) {
        return {
            allowed: false,
            message:
                `You are not eligible to perform this action. ` +
                `Required role(s): ${allowedRoles.join(", ")}.`,
        };
    }
    return { allowed: true };
};

/* =========================================================
   HELPERS: resolve names → real DB rows
========================================================= */

const resolveProgram = async (programId, programName) => {
    if (programId) {
        const r = await safeQuery(
            `SELECT id, name FROM programs WHERE id = $1`,
            [programId]
        );
        return { match: r.rows[0] || null, candidates: r.rows };
    }

    if (!programName) return { match: null, candidates: [] };

    const exact = await safeQuery(
        `SELECT id, name FROM programs
         WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`,
        [programName]
    );
    if (exact.rows.length > 0) {
        return { match: exact.rows[0], candidates: exact.rows };
    }

    const partial = await safeQuery(
        `SELECT id, name FROM programs
         WHERE LOWER(name) LIKE LOWER($1)
         ORDER BY name LIMIT 6`,
        [`%${programName.toLowerCase().trim()}%`]
    );
    return { match: partial.rows[0] || null, candidates: partial.rows };
};

const resolveProgramProject = async (programProjectId, programProjectName) => {
    if (programProjectId) {
        const r = await safeQuery(
            `SELECT pp.id, pp.name, pp.program_id, p.name AS program_name
             FROM program_projects pp
             LEFT JOIN programs p ON p.id = pp.program_id
             WHERE pp.id = $1`,
            [programProjectId]
        );
        return { match: r.rows[0] || null, candidates: r.rows };
    }

    if (!programProjectName) return { match: null, candidates: [] };

    const exact = await safeQuery(
        `SELECT pp.id, pp.name, pp.program_id, p.name AS program_name
         FROM program_projects pp
         LEFT JOIN programs p ON p.id = pp.program_id
         WHERE LOWER(TRIM(pp.name)) = LOWER(TRIM($1))`,
        [programProjectName]
    );
    if (exact.rows.length > 0) {
        return { match: exact.rows[0], candidates: exact.rows };
    }

    const partial = await safeQuery(
        `SELECT pp.id, pp.name, pp.program_id, p.name AS program_name
         FROM program_projects pp
         LEFT JOIN programs p ON p.id = pp.program_id
         WHERE LOWER(pp.name) LIKE LOWER($1)
         ORDER BY pp.name LIMIT 6`,
        [`%${programProjectName.toLowerCase().trim()}%`]
    );
    return { match: partial.rows[0] || null, candidates: partial.rows };
};

const resolveProgramTask = async (taskId, taskName, programProjectId) => {
    if (taskId) {
        const r = await safeQuery(
            `SELECT t.id, t.name, t.program_project_id, pp.name AS program_project_name
             FROM program_project_tasks t
             LEFT JOIN program_projects pp ON pp.id = t.program_project_id
             WHERE t.id = $1`,
            [taskId]
        );
        return { match: r.rows[0] || null, candidates: r.rows };
    }

    if (!taskName) return { match: null, candidates: [] };

    const params = [taskName];
    let sql = `
        SELECT t.id, t.name, t.program_project_id, t.assignee_id,
               pp.name AS program_project_name
        FROM program_project_tasks t
        LEFT JOIN program_projects pp ON pp.id = t.program_project_id
        WHERE LOWER(TRIM(t.name)) = LOWER(TRIM($1))
    `;

    if (programProjectId) {
        sql += ` AND t.program_project_id = $2`;
        params.push(programProjectId);
    }

    sql += ` ORDER BY t.created_at DESC LIMIT 6`;

    const r = await safeQuery(sql, params);
    return { match: r.rows[0] || null, candidates: r.rows };
};

const resolveMember = async (memberId, memberName) => {
    if (memberId) {
        const r = await safeQuery(
            `SELECT id, full_name, email, role FROM users
             WHERE id = $1 AND is_active = TRUE`,
            [memberId]
        );
        return { match: r.rows[0] || null, candidates: r.rows };
    }

    if (!memberName) return { match: null, candidates: [] };

    const exact = await safeQuery(
        `SELECT id, full_name, email, role FROM users
         WHERE LOWER(TRIM(full_name)) = LOWER(TRIM($1))
           AND role::text = 'Member'
           AND is_active = TRUE`,
        [memberName]
    );
    if (exact.rows.length > 0) {
        return { match: exact.rows[0], candidates: exact.rows };
    }

    const partial = await safeQuery(
        `SELECT id, full_name, email, role FROM users
         WHERE LOWER(full_name) LIKE LOWER($1)
           AND role::text = 'Member'
           AND is_active = TRUE
         ORDER BY full_name LIMIT 6`,
        [`%${memberName.toLowerCase().trim()}%`]
    );
    return { match: partial.rows[0] || null, candidates: partial.rows };
};

const resolveProjectManager = async (managerId, managerName) => {
    if (managerId) {
        const r = await safeQuery(
            `SELECT id, full_name, email, role FROM users
             WHERE id = $1 AND is_active = TRUE`,
            [managerId]
        );
        return { match: r.rows[0] || null, candidates: r.rows };
    }

    if (!managerName) return { match: null, candidates: [] };

    const exact = await safeQuery(
        `SELECT id, full_name, email, role FROM users
         WHERE LOWER(TRIM(full_name)) = LOWER(TRIM($1))
           AND role::text = 'Project Manager'
           AND is_active = TRUE`,
        [managerName]
    );
    if (exact.rows.length > 0) {
        return { match: exact.rows[0], candidates: exact.rows };
    }

    const partial = await safeQuery(
        `SELECT id, full_name, email, role FROM users
         WHERE LOWER(full_name) LIKE LOWER($1)
           AND role::text = 'Project Manager'
           AND is_active = TRUE
         ORDER BY full_name LIMIT 6`,
        [`%${managerName.toLowerCase().trim()}%`]
    );
    return { match: partial.rows[0] || null, candidates: partial.rows };
};

/* =========================================================
   AI: Generate program / program project descriptions
========================================================= */

const generateProgramDescription = async (programName, domain) => {
    try {
        const model = getModel();
        const prompt = `
You are generating a professional program description for a program management system.

Program Name: "${programName}"
Program Domain: "${domain || 'Not specified'}"

Requirements:
- Write 2-3 sentences.
- Explain what the program is intended to achieve.
- Mention the main purpose or objectives.
- Mention the expected outcome or value.
- Do not invent specific features.
- Do not mention AI.
- No Markdown, no bullet points, no quotes.
- Return ONLY the description.
`.trim();

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        if (!text) throw new Error('Empty description');
        return text;
    } catch (e) {
        console.error('❌ generateProgramDescription:', e);
        return domain
            ? `The ${programName} program focuses on delivering coordinated outcomes in the ${domain} domain through well-managed projects and tasks.`
            : `The ${programName} program focuses on delivering coordinated outcomes through well-managed projects and tasks.`;
    }
};

const generateProgramProjectDescription = async (projectName, domain) => {
    try {
        const model = getModel();
        const prompt = `
You are generating a professional program project description.

Program Project Name: "${projectName}"
Domain: "${domain || 'Not specified'}"

Requirements:
- Write 2-3 sentences.
- Explain what this project is intended to achieve inside the program.
- Mention the expected outcome or value.
- Do not invent specific features.
- Do not mention AI.
- No Markdown, no bullet points, no quotes.
- Return ONLY the description.
`.trim();

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        if (!text) throw new Error('Empty description');
        return text;
    } catch (e) {
        console.error('❌ generateProgramProjectDescription:', e);
        return `The ${projectName} project focuses on delivering measurable outcomes within the program.`;
    }
};

const generateProgramTaskDescription = async (taskName) => {
    try {
        const model = getModel();
        const prompt = `
You are generating a professional task description for a program management system.

Task Name: "${taskName}"

Requirements:
- 1-2 clear sentences.
- Explain what needs to be completed.
- Practical and actionable.
- No Markdown, no bullet points, no quotes.
- Return ONLY the description.
`.trim();

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        if (!text) throw new Error('Empty description');
        return text;
    } catch (e) {
        console.error('❌ generateProgramTaskDescription:', e);
        return `Complete the "${taskName}" task according to the program requirements.`;
    }
};

/* =========================================================
   FUNCTIONS: program/program project/program task operations
========================================================= */

const functions = {

    /* ---------------------------------------------------------
       PROGRAMS
    --------------------------------------------------------- */

    // createProgram
    createProgram: async (params, user) => {
        const { name, description, domain, startDate, endDate, priority } = params;

        if (!name || !String(name).trim()) {
            return { success: false, error: "Program name is required." };
        }
        if (!domain || !String(domain).trim()) {
            return { success: false, error: "Program domain is required." };
        }
        if (!startDate) {
            return { success: false, error: "Program start date is required." };
        }
        if (!endDate) {
            return { success: false, error: "Program end date is required." };
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return { success: false, error: "Invalid date format. Use YYYY-MM-DD." };
        }
        if (end < start) {
            return { success: false, error: "Program end date cannot be earlier than the start date." };
        }

        let finalDescription = description;
        if (!finalDescription || !String(finalDescription).trim()) {
            finalDescription = await generateProgramDescription(name, domain);
        }

        const result = await safeQuery(
            `
            INSERT INTO programs
                (name, description, domain, start_date, end_date, priority, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            `,
            [
                String(name).trim(),
                finalDescription,
                String(domain).trim(),
                startDate,
                endDate,
                priority || "Medium",
                user.id,
            ]
        );

        return {
            success: true,
            program: result.rows[0],
            programName: result.rows[0].name,
            programId: result.rows[0].id,
        };
    },

    // getPrograms
    getPrograms: async (params, user) => {
        const { status, priority, sortBy, sortOrder } = params || {};

        let sql = `
            SELECT
                p.id, p.name, p.description, p.domain,
                p.start_date, p.end_date, p.priority, p.status,
                u.full_name AS created_by_name,
                COALESCE(pc.project_count, 0)::INTEGER AS project_count,
                COALESCE(pc.completed_count, 0)::INTEGER AS completed_count
            FROM programs p
            LEFT JOIN users u ON u.id = p.created_by
            LEFT JOIN (
                SELECT program_id,
                       COUNT(*) AS project_count,
                       COUNT(*) FILTER (WHERE status = 'Done') AS completed_count
                FROM program_projects
                GROUP BY program_id
            ) pc ON pc.program_id = p.id
            WHERE 1=1
        `;
        const q = [];

        if (status) {
            q.push(status.toLowerCase());
            sql += ` AND LOWER(p.status) = $${q.length}`;
        }
        if (priority) {
            q.push(priority.toLowerCase());
            sql += ` AND LOWER(p.priority) = $${q.length}`;
        }

        const sortFieldMap = {
            name: "p.name",
            startDate: "p.start_date",
            endDate: "p.end_date",
            priority: "p.priority",
            status: "p.status",
        };
        const sortField = sortFieldMap[sortBy] || "p.created_at";
        const sortDir = String(sortOrder || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
        sql += ` ORDER BY ${sortField} ${sortDir}`;

        const result = await safeQuery(sql, q);
        return { success: true, programs: result.rows };
    },

    // getProgramById
    getProgramById: async (params, user) => {
        const { programId, programName } = params || {};

        const { match, candidates } = await resolveProgram(programId, programName);

        if (!match && candidates.length === 0) {
            return {
                success: false,
                error: `No program found matching "${programName || programId}".`,
            };
        }
        if (!match && candidates.length > 1) {
            return {
                success: false,
                requiresProgramSelection: true,
                multiplePrograms: true,
                message: `Multiple programs match "${programName}". Please provide the program ID.`,
                programs: candidates.map(p => ({ id: p.id, name: p.name })),
            };
        }

        const programRow = await safeQuery(
            `
            SELECT p.*, u.full_name AS created_by_name
            FROM programs p
            LEFT JOIN users u ON u.id = p.created_by
            WHERE p.id = $1
            `,
            [match.id]
        );

        const projectsRow = await safeQuery(
            `
            SELECT pp.*,
                   cu.full_name AS created_by_name,
                   au.full_name AS assigned_to_name,
                   au.email AS assigned_to_email,
                   au.role AS assigned_to_role,
                   (SELECT COUNT(*)::int FROM program_project_tasks
                    WHERE program_project_id = pp.id) AS task_count,
                   (SELECT COUNT(*)::int FROM program_project_tasks
                    WHERE program_project_id = pp.id AND status = 'Done') AS completed_task_count
            FROM program_projects pp
            LEFT JOIN users cu ON pp.created_by = cu.id
            LEFT JOIN users au ON pp.assigned_to = au.id
            WHERE pp.program_id = $1
            ORDER BY pp.created_at DESC
            `,
            [match.id]
        );

        return {
            success: true,
            program: programRow.rows[0],
            projects: projectsRow.rows,
        };
    },

    // updateProgram
    updateProgram: async (params, user) => {
        const {
            programId, programName,
            name, description, domain,
            startDate, endDate, priority, status,
        } = params || {};

        const { match, candidates } = await resolveProgram(programId, programName);
        if (!match) {
            if (candidates.length > 1) {
                return {
                    success: false,
                    requiresProgramSelection: true,
                    multiplePrograms: true,
                    programs: candidates.map(p => ({ id: p.id, name: p.name })),
                    message: `Multiple programs match "${programName}". Please provide the program ID.`,
                };
            }
            return { success: false, error: `No program found matching "${programName || programId}".` };
        }

        if (startDate && endDate && endDate < startDate) {
            return { success: false, error: "End date cannot be earlier than start date." };
        }

        const result = await safeQuery(
            `
            UPDATE programs
            SET
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                domain = COALESCE($3, domain),
                start_date = COALESCE($4, start_date),
                end_date = COALESCE($5, end_date),
                priority = COALESCE($6, priority),
                status = COALESCE($7, status)
            WHERE id = $8
            RETURNING *
            `,
            [
                name || null,
                description || null,
                domain || null,
                startDate || null,
                endDate || null,
                priority || null,
                status || null,
                match.id,
            ]
        );

        return { success: true, program: result.rows[0] };
    },

    // deleteProgram
    deleteProgram: async (params, user) => {
        const { programId, programName } = params || {};

        const { match, candidates } = await resolveProgram(programId, programName);
        if (!match) {
            if (candidates.length > 1) {
                return {
                    success: false,
                    requiresProgramSelection: true,
                    multiplePrograms: true,
                    programs: candidates.map(p => ({ id: p.id, name: p.name })),
                    message: `Multiple programs match "${programName}". Please provide the program ID.`,
                };
            }
            return { success: false, error: `No program found matching "${programName || programId}".` };
        }

        await safeQuery(`DELETE FROM programs WHERE id = $1`, [match.id]);
        return { success: true, message: `Program "${match.name}" deleted.` };
    },

    /* ---------------------------------------------------------
       PROGRAM PROJECTS
    --------------------------------------------------------- */

    // createProgramProject
    createProgramProject: async (params, user) => {
        const {
            programId, programName,
            name, domain, aboutTitle, aboutDescription,
            startDate, deadline, priority, assignedToId, assignedToName,
        } = params || {};

        if (!name || !String(name).trim()) {
            return { success: false, error: "Program project name is required." };
        }

        const { match: programMatch, candidates: programCandidates } =
            await resolveProgram(programId, programName);

        if (!programMatch) {
            if (programCandidates.length > 1) {
                return {
                    success: false,
                    requiresProgramSelection: true,
                    multiplePrograms: true,
                    programs: programCandidates.map(p => ({ id: p.id, name: p.name })),
                    message: `Multiple programs match "${programName}". Please provide the program ID.`,
                };
            }
            return { success: false, error: `No program found matching "${programName || programId}".` };
        }

        let finalDescription = aboutDescription;
        if (!finalDescription || !String(finalDescription).trim()) {
            finalDescription = await generateProgramProjectDescription(name, domain);
        }

        let finalAssignedTo = null;
        if (assignedToId || assignedToName) {
            const { match: pm, candidates } = await resolveProjectManager(assignedToId, assignedToName);
            if (!pm) {
                if (candidates.length > 1) {
                    return {
                        success: false,
                        requiresManagerSelection: true,
                        multipleManagers: true,
                        managers: candidates.map(m => ({ id: m.id, fullName: m.full_name, email: m.email })),
                        message: `Multiple Project Managers match "${assignedToName}". Please provide the manager ID.`,
                    };
                }
                return { success: false, error: `No active Project Manager found matching "${assignedToName || assignedToId}".` };
            }
            finalAssignedTo = pm.id;
        }

        const result = await safeQuery(
            `
            INSERT INTO program_projects (
                program_id, name, domain, about_title, about_description,
                start_date, deadline, priority,
                assigned_to, assigned_by, assigned_at,
                status, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
            `,
            [
                programMatch.id,
                String(name).trim(),
                domain || null,
                aboutTitle || String(name).trim(),
                finalDescription,
                startDate || null,
                deadline || null,
                priority || "Medium",
                finalAssignedTo,
                finalAssignedTo ? user.id : null,
                finalAssignedTo ? new Date() : null,
                finalAssignedTo ? "Backlog" : "Unassigned",
                user.id,
            ]
        );

        return {
            success: true,
            project: result.rows[0],
            programName: programMatch.name,
            programId: programMatch.id,
        };
    },

    // getProgramProjects
    getProgramProjects: async (params, user) => {
        const {
            programId, programName,
            status, priority,
            managerId, managerName,
            sortBy, sortOrder,
        } = params || {};

        let programResolvedId = programId || null;

        if (!programResolvedId && programName) {
            const { match, candidates } = await resolveProgram(null, programName);
            if (!match) {
                if (candidates.length > 1) {
                    return {
                        success: false,
                        requiresProgramSelection: true,
                        multiplePrograms: true,
                        programs: candidates.map(p => ({ id: p.id, name: p.name })),
                        message: `Multiple programs match "${programName}". Please provide the program ID.`,
                    };
                }
                return { success: false, error: `No program found matching "${programName}".` };
            }
            programResolvedId = match.id;
        }

        let sql = `
            SELECT pp.*,
                   p.name AS program_name,
                   cu.full_name AS created_by_name,
                   au.full_name AS assigned_to_name,
                   au.email AS assigned_to_email,
                   au.role AS assigned_to_role,
                   (SELECT COUNT(*)::int FROM program_project_tasks
                    WHERE program_project_id = pp.id) AS task_count,
                   (SELECT COUNT(*)::int FROM program_project_tasks
                    WHERE program_project_id = pp.id AND status = 'Done') AS completed_task_count
            FROM program_projects pp
            LEFT JOIN programs p ON p.id = pp.program_id
            LEFT JOIN users cu ON cu.id = pp.created_by
            LEFT JOIN users au ON au.id = pp.assigned_to
            WHERE 1=1
        `;
        const q = [];

        if (programResolvedId) {
            q.push(programResolvedId);
            sql += ` AND pp.program_id = $${q.length}`;
        }
        if (status) {
            q.push(status.toLowerCase());
            sql += ` AND LOWER(pp.status) = $${q.length}`;
        }
        if (priority) {
            q.push(priority.toLowerCase());
            sql += ` AND LOWER(pp.priority) = $${q.length}`;
        }
        if (managerId) {
            q.push(managerId);
            sql += ` AND pp.assigned_to = $${q.length}`;
        } else if (managerName) {
            q.push(managerName.toLowerCase().trim());
            sql += ` AND LOWER(au.full_name) = $${q.length}`;
        }

        const sortFieldMap = {
            name: "pp.name",
            startDate: "pp.start_date",
            deadline: "pp.deadline",
            priority: "pp.priority",
            status: "pp.status",
        };
        const sortField = sortFieldMap[sortBy] || "pp.created_at";
        const sortDir = String(sortOrder || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
        sql += ` ORDER BY ${sortField} ${sortDir}`;

        const result = await safeQuery(sql, q);
        return { success: true, programProjects: result.rows };
    },

    // getProgramProjectById
    getProgramProjectById: async (params, user) => {
        const { programProjectId, programProjectName } = params || {};

        const { match, candidates } = await resolveProgramProject(
            programProjectId,
            programProjectName
        );

        if (!match) {
            if (candidates.length > 1) {
                return {
                    success: false,
                    requiresProgramProjectSelection: true,
                    multipleProgramProjects: true,
                    programProjects: candidates.map(p => ({ id: p.id, name: p.name })),
                    message: `Multiple program projects match "${programProjectName}". Please provide the project ID.`,
                };
            }
            return { success: false, error: `No program project found matching "${programProjectName || programProjectId}".` };
        }

        const detail = await safeQuery(
            `
            SELECT pp.*,
                   p.name AS program_name,
                   cu.full_name AS created_by_name,
                   au.full_name AS assigned_to_name,
                   au.email AS assigned_to_email
            FROM program_projects pp
            LEFT JOIN programs p ON p.id = pp.program_id
            LEFT JOIN users cu ON cu.id = pp.created_by
            LEFT JOIN users au ON au.id = pp.assigned_to
            WHERE pp.id = $1
            `,
            [match.id]
        );

        const members = await safeQuery(
            `
            SELECT ppm.id, ppm.user_id, ppm.assigned_at,
                   u.full_name, u.email, u.role, u.job_title
            FROM program_project_members ppm
            JOIN users u ON u.id = ppm.user_id
            WHERE ppm.program_project_id = $1
            ORDER BY u.full_name ASC
            `,
            [match.id]
        );

        const taskStats = await safeQuery(
            `
            SELECT
                COUNT(*)::int AS total_tasks,
                COUNT(*) FILTER (WHERE status = 'Done')::int AS completed_tasks,
                COUNT(*) FILTER (WHERE status = 'In Progress')::int AS in_progress_tasks,
                COUNT(*) FILTER (WHERE status = 'To Do')::int AS todo_tasks,
                COUNT(*) FILTER (WHERE status = 'Completed')::int AS pending_review_tasks
            FROM program_project_tasks
            WHERE program_project_id = $1
            `,
            [match.id]
        );

        return {
            success: true,
            programProject: detail.rows[0],
            members: members.rows,
            taskStats: taskStats.rows[0],
        };
    },

    // updateProgramProject
    updateProgramProject: async (params, user) => {
        const {
            programProjectId, programProjectName,
            name, domain, aboutTitle, aboutDescription,
            startDate, deadline, priority, status,
        } = params || {};

        const { match, candidates } = await resolveProgramProject(
            programProjectId,
            programProjectName
        );

        if (!match) {
            if (candidates.length > 1) {
                return {
                    success: false,
                    requiresProgramProjectSelection: true,
                    multipleProgramProjects: true,
                    programProjects: candidates.map(p => ({ id: p.id, name: p.name })),
                    message: `Multiple program projects match "${programProjectName}". Please provide the project ID.`,
                };
            }
            return { success: false, error: `No program project found matching "${programProjectName || programProjectId}".` };
        }

        if (startDate && deadline && deadline < startDate) {
            return { success: false, error: "Deadline cannot be earlier than start date." };
        }

        const result = await safeQuery(
            `
            UPDATE program_projects
            SET
                name = COALESCE($1, name),
                domain = COALESCE($2, domain),
                about_title = COALESCE($3, about_title),
                about_description = COALESCE($4, about_description),
                start_date = COALESCE($5, start_date),
                deadline = COALESCE($6, deadline),
                priority = COALESCE($7, priority),
                status = COALESCE($8, status)
            WHERE id = $9
            RETURNING *
            `,
            [
                name || null,
                domain || null,
                aboutTitle || null,
                aboutDescription || null,
                startDate || null,
                deadline || null,
                priority || null,
                status || null,
                match.id,
            ]
        );

        return { success: true, programProject: result.rows[0] };
    },

    // assignProgramProject
    assignProgramProject: async (params, user) => {
        const {
            programProjectId, programProjectName,
            managerId, managerName,
        } = params || {};

        const { match: ppMatch, candidates: ppCandidates } =
            await resolveProgramProject(programProjectId, programProjectName);

        if (!ppMatch) {
            if (ppCandidates.length > 1) {
                return {
                    success: false,
                    requiresProgramProjectSelection: true,
                    multipleProgramProjects: true,
                    programProjects: ppCandidates.map(p => ({ id: p.id, name: p.name })),
                    message: `Multiple program projects match "${programProjectName}". Please provide the project ID.`,
                };
            }
            return { success: false, error: `No program project found matching "${programProjectName || programProjectId}".` };
        }

        const { match: pmMatch, candidates: pmCandidates } =
            await resolveProjectManager(managerId, managerName);

        if (!pmMatch) {
            if (pmCandidates.length > 1) {
                return {
                    success: false,
                    requiresManagerSelection: true,
                    multipleManagers: true,
                    managers: pmCandidates.map(m => ({ id: m.id, fullName: m.full_name, email: m.email })),
                    message: `Multiple Project Managers match "${managerName}". Please provide the manager ID.`,
                };
            }
            return { success: false, error: `No active Project Manager found matching "${managerName || managerId}".` };
        }

        const result = await safeQuery(
            `
            UPDATE program_projects
            SET
                assigned_to = $1,
                assigned_by = $2,
                assigned_at = CURRENT_TIMESTAMP,
                status = CASE WHEN status = 'Unassigned' THEN 'Backlog' ELSE status END
            WHERE id = $3
            RETURNING *
            `,
            [pmMatch.id, user.id, ppMatch.id]
        );

        return {
            success: true,
            programProject: result.rows[0],
            managerName: pmMatch.full_name,
            programProjectName: ppMatch.name,
        };
    },

    // assignProgramProjectMembers
    assignProgramProjectMembers: async (params, user) => {
        const {
            programProjectId, programProjectName,
            memberIds, memberNames,
        } = params || {};

        const { match: ppMatch, candidates: ppCandidates } =
            await resolveProgramProject(programProjectId, programProjectName);

        if (!ppMatch) {
            if (ppCandidates.length > 1) {
                return {
                    success: false,
                    requiresProgramProjectSelection: true,
                    multipleProgramProjects: true,
                    programProjects: ppCandidates.map(p => ({ id: p.id, name: p.name })),
                    message: `Multiple program projects match "${programProjectName}". Please provide the project ID.`,
                };
            }
            return { success: false, error: `No program project found matching "${programProjectName || programProjectId}".` };
        }

        // Build the list of resolved member IDs
        const resolvedMemberIds = [];
        const unresolved = [];

        if (Array.isArray(memberIds)) {
            resolvedMemberIds.push(...memberIds.map(String));
        }

        if (Array.isArray(memberNames)) {
            for (const name of memberNames) {
                const { match, candidates } = await resolveMember(null, name);
                if (!match && candidates.length > 1) {
                    unresolved.push({ name, candidates });
                } else if (match) {
                    resolvedMemberIds.push(String(match.id));
                }
            }
        }

        if (unresolved.length > 0) {
            return {
                success: false,
                requiresAssigneeSelection: true,
                multipleAssignees: true,
                message: `Some member names matched more than one record. Please provide IDs.`,
                unresolved,
            };
        }

        if (resolvedMemberIds.length === 0) {
            return { success: false, error: "No valid Members supplied." };
        }

        // Validate all are Members
        const check = await safeQuery(
            `SELECT id, role FROM users WHERE id = ANY($1::uuid[]) AND is_active = TRUE`,
            [resolvedMemberIds]
        );
        const invalid = check.rows.filter(u => u.role !== "Member");
        if (invalid.length > 0) {
            return { success: false, error: "Only Members can be assigned to program projects." };
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            await client.query(
                `DELETE FROM program_project_members WHERE program_project_id = $1`,
                [ppMatch.id]
            );

            const values = resolvedMemberIds.map(
                (_, i) => `($1, $${i + 2}, $${resolvedMemberIds.length + 2})`
            );
            const qp = [ppMatch.id, ...resolvedMemberIds, user.id];

            await client.query(
                `INSERT INTO program_project_members (program_project_id, user_id, assigned_by)
                 VALUES ${values.join(", ")}
                 ON CONFLICT (program_project_id, user_id) DO NOTHING`,
                qp
            );

            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }

        return {
            success: true,
            programProjectId: ppMatch.id,
            programProjectName: ppMatch.name,
            memberCount: resolvedMemberIds.length,
            message: `Assigned ${resolvedMemberIds.length} member(s) to "${ppMatch.name}".`,
        };
    },

    /* ---------------------------------------------------------
       PROGRAM TASKS
    --------------------------------------------------------- */

    // createProgramTask
    createProgramTask: async (params, user) => {
        const {
            programProjectId, programProjectName,
            name, description, objectives, instructionsText,
            status, priority,
            assigneeId, assigneeName,
            startDate, dueDate,
        } = params || {};

        if (!name || !String(name).trim()) {
            return { success: false, error: "Task name is required." };
        }

        const { match: ppMatch, candidates: ppCandidates } =
            await resolveProgramProject(programProjectId, programProjectName);

        if (!ppMatch) {
            if (ppCandidates.length > 1) {
                return {
                    success: false,
                    requiresProgramProjectSelection: true,
                    multipleProgramProjects: true,
                    programProjects: ppCandidates.map(p => ({ id: p.id, name: p.name })),
                    message: `Multiple program projects match "${programProjectName}". Please provide the project ID.`,
                };
            }
            return { success: false, error: `No program project found matching "${programProjectName || programProjectId}".` };
        }

        // Member: force self
        let finalAssigneeId = null;
        if (user.role === "Member") {
            finalAssigneeId = user.id;
        } else if (assigneeId || assigneeName) {
            const { match: member, candidates } =
                await resolveMember(assigneeId, assigneeName);
            if (!member) {
                if (candidates.length > 1) {
                    return {
                        success: false,
                        requiresAssigneeSelection: true,
                        multipleAssignees: true,
                        members: candidates.map(m => ({ id: m.id, fullName: m.full_name, email: m.email })),
                        message: `Multiple Members match "${assigneeName}". Please provide the Member ID.`,
                    };
                }
                return { success: false, error: `No active Member found matching "${assigneeName || assigneeId}".` };
            }
            finalAssigneeId = member.id;
        }

        let finalDescription = description;
        if (!finalDescription || !String(finalDescription).trim()) {
            finalDescription = await generateProgramTaskDescription(name);
        }

        const result = await safeQuery(
            `
            INSERT INTO program_project_tasks (
                program_project_id, name, description, objectives, instructions_text,
                status, priority, assignee_id, created_by, start_date, due_date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
            `,
            [
                ppMatch.id,
                String(name).trim(),
                finalDescription,
                objectives || null,
                instructionsText || null,
                status || "To Do",
                priority || "Medium",
                finalAssigneeId,
                user.id,
                startDate || null,
                dueDate || null,
            ]
        );

        return {
            success: true,
            task: result.rows[0],
            programProjectName: ppMatch.name,
        };
    },

    // getProgramTasks
    getProgramTasks: async (params, user) => {
        const {
            programId, programName,
            programProjectId, programProjectName,
            taskName, taskId,
            status, priority,
            assigneeId, assigneeName,
            scope, // "mine" | "all"
        } = params || {};

        let sql = `
            SELECT
                t.*,
                u.full_name AS assignee_name,
                u.email     AS assignee_email,
                pp.name      AS program_project_name,
                pp.domain    AS program_project_domain,
                pp.assigned_to AS program_project_manager_id,
                au.full_name AS program_project_manager_name,
                pg.name      AS program_name
            FROM program_project_tasks t
            LEFT JOIN users u ON u.id = t.assignee_id
            LEFT JOIN program_projects pp ON pp.id = t.program_project_id
            LEFT JOIN users au ON au.id = pp.assigned_to
            LEFT JOIN programs pg ON pg.id = pp.program_id
            WHERE 1=1
        `;
        const q = [];

        if (taskId) {
            q.push(taskId);
            sql += ` AND t.id = $${q.length}`;
        }
        if (taskName) {
            q.push(taskName.toLowerCase().trim());
            sql += ` AND LOWER(t.name) = $${q.length}`;
        }
        if (status) {
            q.push(status.toLowerCase());
            sql += ` AND LOWER(t.status) = $${q.length}`;
        }
        if (priority) {
            q.push(priority.toLowerCase());
            sql += ` AND LOWER(t.priority) = $${q.length}`;
        }
        if (assigneeId) {
            q.push(assigneeId);
            sql += ` AND t.assignee_id = $${q.length}`;
        } else if (assigneeName) {
            q.push(assigneeName.toLowerCase().trim());
            sql += ` AND LOWER(u.full_name) = $${q.length}`;
        }

        // Resolve program project if provided
        if (programProjectId || programProjectName) {
            const { match, candidates } =
                await resolveProgramProject(programProjectId, programProjectName);
            if (!match) {
                if (candidates.length > 1) {
                    return {
                        success: false,
                        requiresProgramProjectSelection: true,
                        multipleProgramProjects: true,
                        programProjects: candidates.map(p => ({ id: p.id, name: p.name })),
                        message: `Multiple program projects match "${programProjectName}". Please provide the project ID.`,
                    };
                }
                return { success: false, error: `No program project found matching "${programProjectName}".` };
            }
            q.push(match.id);
            sql += ` AND t.program_project_id = $${q.length}`;
        }

        // Resolve program if provided
        if (programId || programName) {
            const { match, candidates } =
                await resolveProgram(programId, programName);
            if (!match) {
                if (candidates.length > 1) {
                    return {
                        success: false,
                        requiresProgramSelection: true,
                        multiplePrograms: true,
                        programs: candidates.map(p => ({ id: p.id, name: p.name })),
                        message: `Multiple programs match "${programName}". Please provide the program ID.`,
                    };
                }
                return { success: false, error: `No program found matching "${programName}".` };
            }
            q.push(match.id);
            sql += ` AND pg.id = $${q.length}`;
        }

        // Scope: managers see everything in their scope; members see only their own
        if (user.role === "Member" && scope !== "all") {
            q.push(user.id);
            sql += ` AND t.assignee_id = $${q.length}`;
        } else if (user.role === "Project Manager") {
            q.push(user.id);
            sql += ` AND pp.assigned_to = $${q.length}`;
        }

        sql += ` ORDER BY t.created_at DESC`;

        const result = await safeQuery(sql, q);
        return { success: true, tasks: result.rows };
    },

    // getProgramTaskById
    getProgramTaskById: async (params, user) => {
        const { taskId, taskName, programProjectId, programProjectName } = params || {};

        let resolvedProjectId = programProjectId;
        if (!resolvedProjectId && programProjectName) {
            const { match } = await resolveProgramProject(null, programProjectName);
            if (match) resolvedProjectId = match.id;
        }

        const { match, candidates } = await resolveProgramTask(
            taskId,
            taskName,
            resolvedProjectId
        );

        if (!match) {
            if (candidates.length > 1) {
                return {
                    success: false,
                    requiresTaskSelection: true,
                    multipleTasks: true,
                    tasks: candidates.map(t => ({ id: t.id, name: t.name })),
                    message: `Multiple tasks match "${taskName}". Please provide the task ID.`,
                };
            }
            return { success: false, error: `No program task found matching "${taskName || taskId}".` };
        }

        const detail = await safeQuery(
            `
            SELECT
                t.*,
                u.full_name AS assignee_name,
                u.email AS assignee_email,
                pp.name AS program_project_name,
                pp.domain AS program_project_domain,
                pp.assigned_to AS program_project_manager_id,
                au.full_name AS program_project_manager_name,
                pg.name AS program_name,
                (SELECT COUNT(*)::int FROM program_task_work_parts WHERE program_task_id = t.id) AS work_part_count,
                (SELECT COUNT(*)::int FROM program_task_submissions WHERE program_task_id = t.id) AS submission_count,
                (SELECT COUNT(*)::int FROM program_task_challenges WHERE program_task_id = t.id) AS challenge_count,
                (SELECT COUNT(*)::int FROM program_task_attachments WHERE program_task_id = t.id) AS attachment_count
            FROM program_project_tasks t
            LEFT JOIN users u ON u.id = t.assignee_id
            LEFT JOIN program_projects pp ON pp.id = t.program_project_id
            LEFT JOIN users au ON au.id = pp.assigned_to
            LEFT JOIN programs pg ON pg.id = pp.program_id
            WHERE t.id = $1
            `,
            [match.id]
        );

        return { success: true, task: detail.rows[0] };
    },

    // assignProgramTask
    assignProgramTask: async (params, user) => {
        const {
            taskId, taskName, programProjectId, programProjectName,
            assigneeId, assigneeName,
        } = params || {};

        let resolvedProjectId = programProjectId;
        if (!resolvedProjectId && programProjectName) {
            const { match } = await resolveProgramProject(null, programProjectName);
            if (match) resolvedProjectId = match.id;
        }

        const { match: taskMatch, candidates: taskCandidates } =
            await resolveProgramTask(taskId, taskName, resolvedProjectId);

        if (!taskMatch) {
            if (taskCandidates.length > 1) {
                return {
                    success: false,
                    requiresTaskSelection: true,
                    multipleTasks: true,
                    tasks: taskCandidates.map(t => ({ id: t.id, name: t.name })),
                    message: `Multiple tasks match "${taskName}". Please provide the task ID.`,
                };
            }
            return { success: false, error: `No program task found matching "${taskName || taskId}".` };
        }

        const { match: member, candidates: memberCandidates } =
            await resolveMember(assigneeId, assigneeName);

        if (!member) {
            if (memberCandidates.length > 1) {
                return {
                    success: false,
                    requiresAssigneeSelection: true,
                    multipleAssignees: true,
                    members: memberCandidates.map(m => ({ id: m.id, fullName: m.full_name, email: m.email })),
                    message: `Multiple Members match "${assigneeName}". Please provide the Member ID.`,
                };
            }
            return { success: false, error: `No active Member found matching "${assigneeName || assigneeId}".` };
        }

        await safeQuery(
            `UPDATE program_project_tasks
             SET assignee_id = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [member.id, taskMatch.id]
        );

        return {
            success: true,
            taskName: taskMatch.name,
            assigneeName: member.full_name,
            message: `Assigned "${taskMatch.name}" to ${member.full_name}.`,
        };
    },

    // assignAllProgramProjectTasks
    assignAllProgramProjectTasks: async (params, user) => {
        const {
            programProjectId, programProjectName,
            assigneeId, assigneeName,
        } = params || {};

        const { match: ppMatch, candidates: ppCandidates } =
            await resolveProgramProject(programProjectId, programProjectName);

        if (!ppMatch) {
            if (ppCandidates.length > 1) {
                return {
                    success: false,
                    requiresProgramProjectSelection: true,
                    multipleProgramProjects: true,
                    programProjects: ppCandidates.map(p => ({ id: p.id, name: p.name })),
                    message: `Multiple program projects match "${programProjectName}". Please provide the project ID.`,
                };
            }
            return { success: false, error: `No program project found matching "${programProjectName || programProjectId}".` };
        }

        const { match: member, candidates: memberCandidates } =
            await resolveMember(assigneeId, assigneeName);

        if (!member) {
            if (memberCandidates.length > 1) {
                return {
                    success: false,
                    requiresAssigneeSelection: true,
                    multipleAssignees: true,
                    members: memberCandidates.map(m => ({ id: m.id, fullName: m.full_name, email: m.email })),
                    message: `Multiple Members match "${assigneeName}". Please provide the Member ID.`,
                };
            }
            return { success: false, error: `No active Member found matching "${assigneeName || assigneeId}".` };
        }

        const tasks = await safeQuery(
            `SELECT id, name FROM program_project_tasks
             WHERE program_project_id = $1`,
            [ppMatch.id]
        );

        if (tasks.rows.length === 0) {
            return {
                success: false,
                message: `The program project "${ppMatch.name}" has no tasks to assign.`,
                totalTasks: 0,
            };
        }

        const results = { succeeded: 0, failed: 0, alreadyAssigned: 0 };

        for (const t of tasks.rows) {
            try {
                await safeQuery(
                    `UPDATE program_project_tasks
                     SET assignee_id = $1, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $2`,
                    [member.id, t.id]
                );
                results.succeeded += 1;
            } catch (e) {
                console.error('assignAllProgramProjectTasks task error:', e);
                results.failed += 1;
            }
        }

        return {
            success: results.failed === 0,
            programProjectName: ppMatch.name,
            assigneeName: member.full_name,
            totalTasks: tasks.rows.length,
            succeeded: results.succeeded,
            failed: results.failed,
            message: `Assigned ${results.succeeded} of ${tasks.rows.length} tasks in "${ppMatch.name}" to ${member.full_name}.`,
        };
    },

    // updateProgramTaskStatus
    updateProgramTaskStatus: async (params, user) => {
        const {
            taskId, taskName, programProjectId, programProjectName,
            status,
        } = params || {};

        const ALLOWED = ["To Do", "In Progress", "Completed", "Done"];
        if (!ALLOWED.includes(status)) {
            return { success: false, error: `Invalid status. Allowed: ${ALLOWED.join(", ")}.` };
        }

        let resolvedProjectId = programProjectId;
        if (!resolvedProjectId && programProjectName) {
            const { match } = await resolveProgramProject(null, programProjectName);
            if (match) resolvedProjectId = match.id;
        }

        const { match: taskMatch, candidates } =
            await resolveProgramTask(taskId, taskName, resolvedProjectId);

        if (!taskMatch) {
            if (candidates.length > 1) {
                return {
                    success: false,
                    requiresTaskSelection: true,
                    multipleTasks: true,
                    tasks: candidates.map(t => ({ id: t.id, name: t.name })),
                    message: `Multiple tasks match "${taskName}". Please provide the task ID.`,
                };
            }
            return { success: false, error: `No program task found matching "${taskName || taskId}".` };
        }

        if (user.role === "Member" && status === "Done") {
            return {
                success: false,
                error:
                    "Members cannot mark program tasks as Done. Mark the task Completed and the manager will review.",
            };
        }

        await safeQuery(
            `UPDATE program_project_tasks
             SET status = $1,
                 updated_at = CURRENT_TIMESTAMP,
                 completed_at = CASE WHEN $1 = 'Done' THEN CURRENT_TIMESTAMP ELSE completed_at END
             WHERE id = $2`,
            [status, taskMatch.id]
        );

        return {
            success: true,
            taskName: taskMatch.name,
            status,
            message: `Status updated to ${status}.`,
        };
    },

    // deleteProgramTask
    deleteProgramTask: async (params, user) => {
        const { taskId, taskName, programProjectId, programProjectName } = params || {};

        let resolvedProjectId = programProjectId;
        if (!resolvedProjectId && programProjectName) {
            const { match } = await resolveProgramProject(null, programProjectName);
            if (match) resolvedProjectId = match.id;
        }

        const { match: taskMatch, candidates } =
            await resolveProgramTask(taskId, taskName, resolvedProjectId);

        if (!taskMatch) {
            if (candidates.length > 1) {
                return {
                    success: false,
                    requiresTaskSelection: true,
                    multipleTasks: true,
                    tasks: candidates.map(t => ({ id: t.id, name: t.name })),
                    message: `Multiple tasks match "${taskName}". Please provide the task ID.`,
                };
            }
            return { success: false, error: `No program task found matching "${taskName || taskId}".` };
        }

        await safeQuery(`DELETE FROM program_project_tasks WHERE id = $1`, [taskMatch.id]);

        return { success: true, message: `Program task "${taskMatch.name}" deleted.` };
    },

    /* ---------------------------------------------------------
       INFO: members / managers of a program project
    --------------------------------------------------------- */

    getProgramProjectMembers: async (params, user) => {
        const { programProjectId, programProjectName } = params || {};

        const { match, candidates } =
            await resolveProgramProject(programProjectId, programProjectName);

        if (!match) {
            if (candidates.length > 1) {
                return {
                    success: false,
                    requiresProgramProjectSelection: true,
                    multipleProgramProjects: true,
                    programProjects: candidates.map(p => ({ id: p.id, name: p.name })),
                    message: `Multiple program projects match "${programProjectName}". Please provide the project ID.`,
                };
            }
            return { success: false, error: `No program project found matching "${programProjectName || programProjectId}".` };
        }

        const members = await safeQuery(
            `
            SELECT ppm.id, ppm.user_id, ppm.assigned_at,
                   u.full_name, u.email, u.role, u.job_title
            FROM program_project_members ppm
            JOIN users u ON u.id = ppm.user_id
            WHERE ppm.program_project_id = $1
            ORDER BY u.full_name ASC
            `,
            [match.id]
        );

        return {
            success: true,
            programProjectName: match.name,
            members: members.rows,
        };
    },

       /* ---------------------------------------------------------
       PERFORMANCE
    --------------------------------------------------------- */

    // getMemberPerformance
    // Returns a full performance snapshot for one user:
    //   - normal tasks (projects table)
    //   - program tasks (program_project_tasks table)
    //   - aggregates + breakdowns + recent history
    //
    // Managers/Admins can ask for anyone.
    // Members can only ask for themselves.
    getMemberPerformance: async (params, user) => {
        const { memberId, memberName } = params || {};

        // Resolve target user
        let target = null;

        if (memberId) {
            const r = await safeQuery(
                `SELECT id, full_name, email, role FROM users
                 WHERE id = $1 AND is_active = TRUE`,
                [memberId]
            );
            target = r.rows[0] || null;
        } else if (memberName) {
            // Accept any active role for performance lookup
            const exact = await safeQuery(
                `SELECT id, full_name, email, role FROM users
                 WHERE LOWER(TRIM(full_name)) = LOWER(TRIM($1))
                   AND is_active = TRUE`,
                [memberName]
            );
            if (exact.rows.length === 1) {
                target = exact.rows[0];
            } else if (exact.rows.length > 1) {
                return {
                    success: false,
                    requiresAssigneeSelection: true,
                    multipleAssignees: true,
                    members: exact.rows.map(u => ({
                        id: u.id,
                        fullName: u.full_name,
                        email: u.email,
                        role: u.role,
                    })),
                    message: `Multiple users match "${memberName}". Please provide the user ID.`,
                };
            } else {
                const partial = await safeQuery(
                    `SELECT id, full_name, email, role FROM users
                     WHERE LOWER(full_name) LIKE LOWER($1)
                       AND is_active = TRUE
                     ORDER BY full_name LIMIT 6`,
                    [`%${memberName.toLowerCase().trim()}%`]
                );
                if (partial.rows.length === 1) {
                    target = partial.rows[0];
                } else if (partial.rows.length > 1) {
                    return {
                        success: false,
                        requiresAssigneeSelection: true,
                        multipleAssignees: true,
                        members: partial.rows.map(u => ({
                            id: u.id,
                            fullName: u.full_name,
                            email: u.email,
                            role: u.role,
                        })),
                        message: `Multiple users match "${memberName}". Please provide the user ID.`,
                    };
                }
            }
        } else {
            // Default to the calling user
            const r = await safeQuery(
                `SELECT id, full_name, email, role FROM users
                 WHERE id = $1 AND is_active = TRUE`,
                [user.id]
            );
            target = r.rows[0] || null;
        }

        if (!target) {
            return {
                success: false,
                error: `No user found${memberName ? ` matching "${memberName}"` : ""}.`,
            };
        }

        // Authorization: members can only see themselves
        if (user.role === "Member" && String(user.id) !== String(target.id)) {
            return {
                success: false,
                error: "Members can only view their own performance.",
            };
        }

        // =========================================================
        // NORMAL TASK PERFORMANCE
        // =========================================================

        const normalStats = await safeQuery(
            `
            SELECT
                COUNT(t.id)::INTEGER AS total_tasks,
                COUNT(t.id) FILTER (WHERE t.status = 'Done')::INTEGER AS completed_tasks,
                COUNT(t.id) FILTER (WHERE t.status IN ('To Do', 'In Progress'))::INTEGER AS pending_tasks,
                COUNT(t.id) FILTER (
                    WHERE t.due_date < CURRENT_DATE AND t.status != 'Done'
                )::INTEGER AS overdue_tasks,
                COUNT(t.id) FILTER (
                    WHERE t.status = 'Done'
                      AND t.completed_at IS NOT NULL
                      AND t.due_date IS NOT NULL
                      AND t.completed_at::DATE > t.due_date::DATE
                )::INTEGER AS overdue_done_tasks,
                COUNT(DISTINCT t.project_id)::INTEGER AS project_count,
                ROUND(
                    COUNT(t.id) FILTER (WHERE t.status = 'Done')::NUMERIC /
                    NULLIF(COUNT(t.id), 0) * 100, 1
                )::NUMERIC AS completion_rate,
                ROUND(
                    COUNT(t.id) FILTER (
                        WHERE t.status = 'Done'
                          AND t.completed_at IS NOT NULL
                          AND (t.due_date IS NULL OR t.completed_at::DATE <= t.due_date::DATE)
                    )::NUMERIC /
                    NULLIF(COUNT(t.id) FILTER (WHERE t.status = 'Done'), 0) * 100, 1
                )::NUMERIC AS on_time_rate
            FROM tasks t
            WHERE t.assignee_id = $1
            `,
            [target.id]
        );

        const normalStatusBreakdown = await safeQuery(
            `
            SELECT status, COUNT(*)::INTEGER AS count
            FROM tasks
            WHERE assignee_id = $1
            GROUP BY status
            `,
            [target.id]
        );

        const normalPriorityBreakdown = await safeQuery(
            `
            SELECT priority, COUNT(*)::INTEGER AS count
            FROM tasks
            WHERE assignee_id = $1
            GROUP BY priority
            `,
            [target.id]
        );

        const normalProjectBreakdown = await safeQuery(
            `
            SELECT
                p.id AS project_id,
                p.name AS project_name,
                COUNT(t.id)::INTEGER AS total_tasks,
                COUNT(t.id) FILTER (WHERE t.status = 'Done')::INTEGER AS completed_tasks,
                COUNT(t.id) FILTER (
                    WHERE t.due_date < CURRENT_DATE AND t.status != 'Done'
                )::INTEGER AS overdue_tasks
            FROM tasks t
            JOIN projects p ON p.id = t.project_id
            WHERE t.assignee_id = $1
            GROUP BY p.id, p.name
            ORDER BY total_tasks DESC
            `,
            [target.id]
        );

        const normalRecent = await safeQuery(
            `
            SELECT
                t.id, t.name, t.status, t.priority,
                t.due_date, t.completed_at, t.updated_at,
                p.name AS project_name
            FROM tasks t
            JOIN projects p ON p.id = t.project_id
            WHERE t.assignee_id = $1
            ORDER BY COALESCE(t.completed_at, t.updated_at, t.created_at) DESC
            LIMIT 10
            `,
            [target.id]
        );

        // =========================================================
        // PROGRAM TASK PERFORMANCE
        // =========================================================

        const programStats = await safeQuery(
            `
            SELECT
                COUNT(t.id)::INTEGER AS total_tasks,
                COUNT(t.id) FILTER (WHERE t.status = 'Done')::INTEGER AS completed_tasks,
                COUNT(t.id) FILTER (
                    WHERE t.status IN ('To Do', 'In Progress', 'Completed')
                )::INTEGER AS pending_tasks,
                COUNT(t.id) FILTER (
                    WHERE t.due_date < CURRENT_DATE AND t.status != 'Done'
                )::INTEGER AS overdue_tasks,
                COUNT(t.id) FILTER (
                    WHERE t.status = 'Done'
                      AND t.completed_at IS NOT NULL
                      AND t.due_date IS NOT NULL
                      AND t.completed_at::DATE > t.due_date::DATE
                )::INTEGER AS overdue_done_tasks,
                COUNT(DISTINCT t.program_project_id)::INTEGER AS program_project_count,
                ROUND(
                    COUNT(t.id) FILTER (WHERE t.status = 'Done')::NUMERIC /
                    NULLIF(COUNT(t.id), 0) * 100, 1
                )::NUMERIC AS completion_rate,
                ROUND(
                    COUNT(t.id) FILTER (
                        WHERE t.status = 'Done'
                          AND t.completed_at IS NOT NULL
                          AND (t.due_date IS NULL OR t.completed_at::DATE <= t.due_date::DATE)
                    )::NUMERIC /
                    NULLIF(COUNT(t.id) FILTER (WHERE t.status = 'Done'), 0) * 100, 1
                )::NUMERIC AS on_time_rate
            FROM program_project_tasks t
            WHERE t.assignee_id = $1
            `,
            [target.id]
        );

        const programStatusBreakdown = await safeQuery(
            `
            SELECT status, COUNT(*)::INTEGER AS count
            FROM program_project_tasks
            WHERE assignee_id = $1
            GROUP BY status
            `,
            [target.id]
        );

        const programPriorityBreakdown = await safeQuery(
            `
            SELECT priority, COUNT(*)::INTEGER AS count
            FROM program_project_tasks
            WHERE assignee_id = $1
            GROUP BY priority
            `,
            [target.id]
        );

        const programProjectBreakdown = await safeQuery(
            `
            SELECT
                pp.id AS program_project_id,
                pp.name AS program_project_name,
                pg.name AS program_name,
                COUNT(t.id)::INTEGER AS total_tasks,
                COUNT(t.id) FILTER (WHERE t.status = 'Done')::INTEGER AS completed_tasks,
                COUNT(t.id) FILTER (
                    WHERE t.due_date < CURRENT_DATE AND t.status != 'Done'
                )::INTEGER AS overdue_tasks
            FROM program_project_tasks t
            JOIN program_projects pp ON pp.id = t.program_project_id
            LEFT JOIN programs pg ON pg.id = pp.program_id
            WHERE t.assignee_id = $1
            GROUP BY pp.id, pp.name, pg.name
            ORDER BY total_tasks DESC
            `,
            [target.id]
        );

        const programRecent = await safeQuery(
            `
            SELECT
                t.id, t.name, t.status, t.priority,
                t.due_date, t.completed_at, t.updated_at,
                pp.name AS program_project_name,
                pg.name AS program_name
            FROM program_project_tasks t
            JOIN program_projects pp ON pp.id = t.program_project_id
            LEFT JOIN programs pg ON pg.id = pp.program_id
            WHERE t.assignee_id = $1
            ORDER BY COALESCE(t.completed_at, t.updated_at, t.created_at) DESC
            LIMIT 10
            `,
            [target.id]
        );

        const n = normalStats.rows[0] || {};
        const p = programStats.rows[0] || {};

        return {
            success: true,
            target: {
                id: target.id,
                fullName: target.full_name,
                email: target.email,
                role: target.role,
            },

            normal: {
                stats: {
                    totalTasks: parseInt(n.total_tasks || 0),
                    completedTasks: parseInt(n.completed_tasks || 0),
                    pendingTasks: parseInt(n.pending_tasks || 0),
                    overdueTasks: parseInt(n.overdue_tasks || 0),
                    overdueDoneTasks: parseInt(n.overdue_done_tasks || 0),
                    projectCount: parseInt(n.project_count || 0),
                    completionRate: parseFloat(n.completion_rate || 0),
                    onTimeRate: parseFloat(n.on_time_rate || 0),
                },
                statusBreakdown: normalStatusBreakdown.rows,
                priorityBreakdown: normalPriorityBreakdown.rows,
                projectBreakdown: normalProjectBreakdown.rows,
                recentTasks: normalRecent.rows,
            },

            program: {
                stats: {
                    totalTasks: parseInt(p.total_tasks || 0),
                    completedTasks: parseInt(p.completed_tasks || 0),
                    pendingTasks: parseInt(p.pending_tasks || 0),
                    overdueTasks: parseInt(p.overdue_tasks || 0),
                    overdueDoneTasks: parseInt(p.overdue_done_tasks || 0),
                    programProjectCount: parseInt(p.program_project_count || 0),
                    completionRate: parseFloat(p.completion_rate || 0),
                    onTimeRate: parseFloat(p.on_time_rate || 0),
                },
                statusBreakdown: programStatusBreakdown.rows,
                priorityBreakdown: programPriorityBreakdown.rows,
                programProjectBreakdown: programProjectBreakdown.rows,
                recentTasks: programRecent.rows,
            },
        };
    },

    // getProgramTaskInfo (stats)
    getProgramStats: async (params, user) => {
        const { programId, programName } = params || {};

        const { match, candidates } =
            await resolveProgram(programId, programName);

        if (!match) {
            if (candidates.length > 1) {
                return {
                    success: false,
                    requiresProgramSelection: true,
                    multiplePrograms: true,
                    programs: candidates.map(p => ({ id: p.id, name: p.name })),
                    message: `Multiple programs match "${programName}". Please provide the program ID.`,
                };
            }
            return { success: false, error: `No program found matching "${programName || programId}".` };
        }

        const stats = await safeQuery(
            `
            SELECT
                COUNT(DISTINCT pp.id)::int AS total_program_projects,
                COUNT(DISTINCT pp.id) FILTER (WHERE pp.status = 'Done')::int AS completed_program_projects,
                COUNT(DISTINCT t.id)::int AS total_tasks,
                COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'Done')::int AS completed_tasks,
                COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'In Progress')::int AS in_progress_tasks,
                COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'To Do')::int AS todo_tasks,
                COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'Completed')::int AS pending_review_tasks
            FROM programs p
            LEFT JOIN program_projects pp ON pp.program_id = p.id
            LEFT JOIN program_project_tasks t ON t.program_project_id = pp.id
            WHERE p.id = $1
            `,
            [match.id]
        );

        return {
            success: true,
            programName: match.name,
            programId: match.id,
            stats: stats.rows[0],
        };
    },
};

/* =========================================================
   AI ACTION PLAN PARSER (same format as aiAgentController)
========================================================= */

const extractJsonObject = (text) => {
    if (!text || typeof text !== "string") return null;
    const start = text.indexOf("{");
    if (start === -1) return null;

    let depth = 0, inString = false, escaped = false;

    for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (escaped) { escaped = false; continue; }
        if (char === "\\") { escaped = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (char === "{") depth++;
        else if (char === "}") {
            depth--;
            if (depth === 0) return text.substring(start, i + 1);
        }
    }
    return null;
};

const parseAIResponse = (response) => {
    if (!response) return { actions: [], response: "" };

    const jsonText = extractJsonObject(response);
    if (jsonText) {
        try {
            const parsed = JSON.parse(jsonText);
            if (Array.isArray(parsed.actions)) {
                const actions = parsed.actions
                    .filter(a => a && typeof a.function === "string")
                    .map(a => ({
                        function: a.function.trim(),
                        arguments:
                            a.arguments && typeof a.arguments === "object"
                                ? a.arguments
                                : {},
                    }));
                return { actions, response: "" };
            }
        } catch (e) {
            console.error("❌ Failed to parse action JSON:", e);
        }
    }

    // Legacy format: [FUNCTION:foo]{...}
    const actions = [];
    const functionRegex =
        /\[FUNCTION:(\w+)\]\s*(\{(?:[^{}]|"(?:\\.|[^"\\])*")*\})/g;
    let match;
    while ((match = functionRegex.exec(response)) !== null) {
        try {
            actions.push({
                function: match[1],
                arguments: JSON.parse(match[2]),
            });
        } catch (e) {
            console.error("❌ Failed to parse legacy function:", match[0]);
        }
    }

    if (actions.length > 0) {
        return { actions, response: response.replace(functionRegex, "").trim() };
    }
    return { actions: [], response };
};

/* =========================================================
   ACTION EXECUTOR
========================================================= */

const executeAIAction = async (action, user, index) => {
    const functionName = action?.function;
    const params = action?.arguments || {};

    if (!functionName || !functions[functionName]) {
        return {
            index,
            function: functionName || "unknown",
            success: false,
            error: `The requested operation "${functionName || "unknown"}" is not available.`,
        };
    }

    const perm = checkActionPermission(functionName, user);
    if (!perm.allowed) {
        return {
            index,
            function: functionName,
            arguments: params,
            success: false,
            permissionDenied: true,
            error: perm.message,
        };
    }

    try {
        const result = await functions[functionName](params, user);
        return {
            index,
            function: functionName,
            arguments: params,
            success: result?.success !== false,
            result,
        };
    } catch (e) {
        console.error(`❌ Program action ${index + 1} failed:`, functionName, e);
        return {
            index,
            function: functionName,
            arguments: params,
            success: false,
            error: e.message || "Operation failed.",
        };
    }
};

const executeAIActions = async (actions, user) => {
    if (!Array.isArray(actions) || actions.length === 0) {
        return { results: [], success: true };
    }

    const MAX_CONCURRENT = 5;
    const results = new Array(actions.length);

    for (let start = 0; start < actions.length; start += MAX_CONCURRENT) {
        const batch = actions.slice(start, start + MAX_CONCURRENT);
        const batchResults = await Promise.all(
            batch.map((action, batchIndex) =>
                executeAIAction(action, user, start + batchIndex)
            )
        );
        batchResults.forEach((r, i) => {
            results[start + i] = r;
        });
    }

    const success =
        results.length > 0 && results.every(r => r.success === true);

    return { results, success };
};

/* =========================================================
   ACTION MESSAGE FORMATTER (human-readable summary)
========================================================= */

const formatMessage = (item) => {
    const fn = item.function;
    const result = item.result || {};
    const params = item.arguments || {};

    if (item.permissionDenied) return `❌ ${item.error}`;
    if (!item.success) {
        return `❌ ${result.error || result.message || item.error || "Operation failed."}`;
    }

    switch (fn) {
        case "createProgram":
            return `✅ Program "${result.program?.name || params.name}" created.`;

        case "getPrograms": {
            const list = result.programs || [];
            if (!list.length) return "ℹ️ No programs found.";
            return (
                `📋 Found ${list.length} program(s):\n\n` +
                list
                    .map(
                        (p, i) =>
                            `${i + 1}. ${p.name}` +
                            (p.domain ? ` — ${p.domain}` : "") +
                            (p.status ? ` [${p.status}]` : "") +
                            (p.project_count != null
                                ? ` — ${p.completed_count}/${p.project_count} projects done`
                                : "")
                    )
                    .join("\n")
            );
        }

        case "getProgramById": {
            if (!result.program) return "ℹ️ No program found.";
            const p = result.program;
            const projects = result.projects || [];
            let msg = `📋 Program: ${p.name}\n`;
            if (p.domain) msg += `   • Domain: ${p.domain}\n`;
            if (p.status) msg += `   • Status: ${p.status}\n`;
            if (p.priority) msg += `   • Priority: ${p.priority}\n`;
            if (p.start_date) msg += `   • Start: ${p.start_date}\n`;
            if (p.end_date) msg += `   • End: ${p.end_date}\n`;
            msg += `   • Projects: ${projects.length}\n`;
            if (projects.length) {
                msg += "\nProjects:\n";
                projects.forEach((pp, i) => {
                    msg += `${i + 1}. ${pp.name}`;
                    if (pp.status) msg += ` [${pp.status}]`;
                    if (pp.task_count != null) {
                        msg += ` — ${pp.completed_task_count}/${pp.task_count} tasks done`;
                    }
                    msg += "\n";
                });
            }
            return msg.trim();
        }

        case "updateProgram":
            return `✅ Program "${result.program?.name || params.name}" updated.`;

        case "deleteProgram":
            return `✅ ${result.message || "Program deleted."}`;

        case "createProgramProject":
            return `✅ Program project "${result.project?.name || params.name}" created${
                result.programName ? ` under program "${result.programName}"` : ""
            }.`;

        case "getProgramProjects": {
            const list = result.programProjects || [];
            if (!list.length) return "ℹ️ No program projects found.";
            return (
                `📋 Found ${list.length} program project(s):\n\n` +
                list
                    .map(
                        (pp, i) =>
                            `${i + 1}. ${pp.name}` +
                            (pp.program_name ? ` (Program: ${pp.program_name})` : "") +
                            (pp.status ? ` [${pp.status}]` : "") +
                            (pp.assigned_to_name
                                ? ` — PM: ${pp.assigned_to_name}`
                                : " — PM: Unassigned") +
                            (pp.task_count != null
                                ? ` — ${pp.completed_task_count}/${pp.task_count} tasks done`
                                : "")
                    )
                    .join("\n")
            );
        }

        case "getProgramProjectById": {
            if (!result.programProject) return "ℹ️ No program project found.";
            const pp = result.programProject;
            const stats = result.taskStats || {};
            let msg = `📋 Program project: ${pp.name}\n`;
            if (pp.program_name) msg += `   • Program: ${pp.program_name}\n`;
            if (pp.status) msg += `   • Status: ${pp.status}\n`;
            if (pp.assigned_to_name) msg += `   • PM: ${pp.assigned_to_name}\n`;
            if (stats.total_tasks != null) {
                msg +=
                    `   • Tasks: ${stats.completed_tasks}/${stats.total_tasks} done` +
                    ` (in-progress: ${stats.in_progress_tasks}, todo: ${stats.todo_tasks}, pending review: ${stats.pending_review_tasks})\n`;
            }
            if (result.members?.length) {
                msg += `   • Members: ${result.members.length}\n`;
            }
            return msg.trim();
        }

        case "updateProgramProject":
            return `✅ Program project "${result.programProject?.name || params.name}" updated.`;

        case "assignProgramProject":
            return `✅ Program project "${result.programProjectName || params.programProjectName}" assigned to ${result.managerName || params.managerName}.`;

        case "assignProgramProjectMembers":
            return `✅ ${result.message || "Members assigned."}`;

        case "createProgramTask":
            return `✅ Program task "${result.task?.name || params.name}" created${
                result.programProjectName
                    ? ` under "${result.programProjectName}"`
                    : ""
            }.`;

        case "getProgramTasks": {
            const list = result.tasks || [];
            if (!list.length) return "ℹ️ No program tasks found.";
            return (
                `📋 Found ${list.length} program task(s):\n\n` +
                list
                    .map(
                        (t, i) =>
                            `${i + 1}. ${t.name}` +
                            (t.program_project_name
                                ? ` (Project: ${t.program_project_name})`
                                : "") +
                            (t.program_name ? ` [Program: ${t.program_name}]` : "") +
                            (t.status ? ` — ${t.status}` : "") +
                            (t.assignee_name ? ` — Assigned to ${t.assignee_name}` : "")
                    )
                    .join("\n")
            );
        }

                  case "getMemberPerformance": {
            const t = result.target || {};
            const nStats = result.normal?.stats || {};
            const pStats = result.program?.stats || {};

            const normalProjects = result.normal?.projectBreakdown || [];
            const programProjects = result.program?.programProjectBreakdown || [];

            let msg = `📊 Performance — ${t.fullName || "User"} (${t.role || ""})\n`;

            msg += `\n── NORMAL PROJECTS & TASKS ──\n`;
            msg += `   • Total tasks: ${nStats.totalTasks}\n`;
            msg += `   • Completed: ${nStats.completedTasks}\n`;
            msg += `   • Pending: ${nStats.pendingTasks}\n`;
            msg += `   • Overdue: ${nStats.overdueTasks}\n`;
            msg += `   • Completion rate: ${nStats.completionRate}%\n`;
            msg += `   • On-time rate: ${nStats.onTimeRate}%\n`;
            msg += `   • Projects involved: ${nStats.projectCount}\n`;

            if (normalProjects.length) {
                msg += `\n   Per project:\n`;
                normalProjects.slice(0, 5).forEach((pr) => {
                    msg += `      - ${pr.project_name}: ${pr.completed_tasks}/${pr.total_tasks} done` +
                           (pr.overdue_tasks > 0 ? ` (${pr.overdue_tasks} overdue)` : "") + `\n`;
                });
            }

            msg += `\n── PROGRAM PROJECTS & TASKS ──\n`;
            msg += `   • Total program tasks: ${pStats.totalTasks}\n`;
            msg += `   • Completed: ${pStats.completedTasks}\n`;
            msg += `   • Pending: ${pStats.pendingTasks}\n`;
            msg += `   • Overdue: ${pStats.overdueTasks}\n`;
            msg += `   • Completion rate: ${pStats.completionRate}%\n`;
            msg += `   • On-time rate: ${pStats.onTimeRate}%\n`;
            msg += `   • Program projects involved: ${pStats.programProjectCount}\n`;

            if (programProjects.length) {
                msg += `\n   Per program project:\n`;
                programProjects.slice(0, 5).forEach((pr) => {
                    msg += `      - ${pr.program_project_name}` +
                           (pr.program_name ? ` (${pr.program_name})` : "") +
                           `: ${pr.completed_tasks}/${pr.total_tasks} done` +
                           (pr.overdue_tasks > 0 ? ` (${pr.overdue_tasks} overdue)` : "") + `\n`;
                });
            }

            return msg.trim();
        }

        case "getProgramTaskById": {
            if (!result.task) return "ℹ️ No program task found.";
            const t = result.task;
            let msg = `📋 Program task: ${t.name}\n`;
            if (t.program_name) msg += `   • Program: ${t.program_name}\n`;
            if (t.program_project_name) msg += `   • Project: ${t.program_project_name}\n`;
            if (t.status) msg += `   • Status: ${t.status}\n`;
            if (t.priority) msg += `   • Priority: ${t.priority}\n`;
            if (t.assignee_name) msg += `   • Assignee: ${t.assignee_name}\n`;
            if (t.start_date) msg += `   • Start: ${t.start_date}\n`;
            if (t.due_date) msg += `   • Due: ${t.due_date}\n`;
            msg += `   • Work parts: ${t.work_part_count}, Submissions: ${t.submission_count}, Challenges: ${t.challenge_count}, Files: ${t.attachment_count}\n`;
            return msg.trim();
        }

        case "assignProgramTask":
            return `✅ Task "${result.taskName || params.taskName}" assigned to ${result.assigneeName || params.assigneeName}.`;

        case "assignAllProgramProjectTasks":
            return `✅ ${result.message || "Tasks assigned."}`;

        case "updateProgramTaskStatus":
            return `✅ Task "${result.taskName || params.taskName}" status updated to ${result.status || params.status}.`;

        case "deleteProgramTask":
            return `✅ ${result.message || "Program task deleted."}`;

        case "getProgramProjectMembers": {
            const list = result.members || [];
            if (!list.length) return "ℹ️ No members assigned to this program project.";
            return (
                `👥 Members of "${result.programProjectName}":\n\n` +
                list
                    .map((m, i) => `${i + 1}. ${m.full_name} (${m.email}) — ${m.role}`)
                    .join("\n")
            );
        }

        case "getProgramStats": {
            const s = result.stats || {};
            return (
                `📊 Program "${result.programName}" stats:\n` +
                `   • Projects: ${s.completed_program_projects}/${s.total_program_projects} done\n` +
                `   • Tasks: ${s.completed_tasks}/${s.total_tasks} done\n` +
                `   • In progress: ${s.in_progress_tasks}\n` +
                `   • To do: ${s.todo_tasks}\n` +
                `   • Pending review: ${s.pending_review_tasks}`
            );
        }

        default:
            return `✅ Operation "${fn}" completed.`;
    }
};

const generateMultiActionResponse = async (results) => {
    if (!results || results.length === 0) {
        return "I couldn't identify an operation to perform.";
    }

    const messages = results.map(formatMessage);

    if (messages.length === 1) return messages[0];

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;

    let response = `I processed ${results.length} requested operation(s).\n\n`;
    messages.forEach((msg, i) => {
        response += `${i + 1}. ${msg}\n`;
    });

    if (failed === 0) {
        response += `\n✅ All ${successful} operations completed successfully.`;
    } else if (successful > 0) {
        response += `\n⚠️ ${successful} succeeded, ${failed} failed.`;
    } else {
        response += `\n❌ None of the requested operations completed.`;
    }

    return response.trim();
};

/* =========================================================
   MAIN HANDLER
========================================================= */

exports.handleProgramAIAgent = async (req, res) => {
    try {
        const { message, conversationHistory = [] } = req.body;
        const user = req.user;

        console.log("=== 🤖 Program AI Agent Request ===");
        console.log("User:", user?.id, user?.role);
        console.log("Message:", message?.substring(0, 120));

        if (!message) {
            return res.status(400).json({ success: false, error: "Message is required" });
        }

        const apiKey =
            process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                error: "Google AI API key is not configured.",
            });
        }

        let model;
        try {
            model = getChatModel();
        } catch (e) {
            console.error("❌ Model init:", e);
            return res.status(500).json({
                success: false,
                error: "Failed to initialize AI model.",
            });
        }

        // Load the system instruction from a separate file (see below)
        const { PROGRAM_AI_SYSTEM_INSTRUCTION } = require("./programAgentPrompt");
        const systemInstruction = PROGRAM_AI_SYSTEM_INSTRUCTION;

        const chat = model.startChat({
            history: [
                { role: "user", parts: [{ text: systemInstruction }] },
                {
                    role: "model",
                    parts: [{ text: "I understand. I will help with program management." }],
                },
                ...conversationHistory.slice(-5).map(msg => ({
                    role: msg.role === "assistant" ? "model" : "user",
                    parts: [{ text: msg.content }],
                })),
            ],
        });

        const result = await chat.sendMessage(message);
        const aiResponse = result.response.text();

        const parsed = parseAIResponse(aiResponse);
        const actions = parsed.actions || [];

        if (actions.length === 0) {
            return res.status(200).json({
                success: true,
                message: parsed.response || aiResponse,
                data: null,
                function_called: null,
                actions: [],
            });
        }

        const execution = await executeAIActions(actions, user);

        // Selection handling — one selection at a time
        const selectionRequired = execution.results.find(
            item =>
                item.result?.requiresProgramSelection ||
                item.result?.requiresProgramProjectSelection ||
                item.result?.requiresTaskSelection ||
                item.result?.requiresManagerSelection ||
                item.result?.requiresAssigneeSelection
        );

        if (selectionRequired) {
            const r = selectionRequired.result;

            const listMap = {
                requiresProgramSelection: {
                    key: "programs",
                    label: "Program ID",
                },
                requiresProgramProjectSelection: {
                    key: "programProjects",
                    label: "Program Project ID",
                },
                requiresTaskSelection: {
                    key: "tasks",
                    label: "Task ID",
                },
                requiresManagerSelection: {
                    key: "managers",
                    label: "Manager ID",
                },
                requiresAssigneeSelection: {
                    key: "members",
                    label: "Member ID",
                },
            };

            for (const [flag, cfg] of Object.entries(listMap)) {
                if (r[flag]) {
                    const list = r[cfg.key] || [];
                    const formatted = list
                        .map((item, i) =>
                            `${i + 1}. ${item.name || item.fullName} — ID: ${item.id}`
                        )
                        .join("\n");

                    return res.status(200).json({
                        success: false,
                        [flag]: true,
                        message:
                            (r.message || `Please provide the ${cfg.label}.`) +
                            (formatted ? `\n\n${formatted}` : ""),
                        data: execution.results,
                        function_called: selectionRequired.function,
                        actions,
                    });
                }
            }
        }

        const finalMessage = await generateMultiActionResponse(execution.results);

        return res.status(200).json({
            success: execution.success,
            message: finalMessage,
            data: execution.results,
            function_called:
                execution.results.length === 1
                    ? execution.results[0].function
                    : null,
            actions: execution.results.map(item => ({
                function: item.function,
                success: item.success,
                result: item.result || null,
                error: item.error || null,
                permissionDenied: item.permissionDenied || false,
            })),
        });
    } catch (error) {
        console.error("❌ Program AI Agent error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Internal server error",
        });
    }
};

// controllers/programTaskController.js
const pool = require("../config/db");

const MANAGEMENT_ROLES = [
    "Project Manager",
    "Executive Manager",
    "System Administrator",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
];
const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "txt"];

const safeQuery = async (text, params) => {
    const client = await pool.connect();
    try {
        return await client.query(text, params);
    } finally {
        client.release();
    }
};

const isManagementRole = (role) => MANAGEMENT_ROLES.includes(role);

/* =========================================================
   AUTHORIZATION HELPERS
========================================================= */

const getProgramProject = async (programProjectId) => {
    const r = await safeQuery(
        `SELECT pp.*, p.name AS program_name
         FROM program_projects pp
         LEFT JOIN programs p ON p.id = pp.program_id
         WHERE pp.id = $1 LIMIT 1`,
        [programProjectId]
    );
    return r.rows[0] || null;
};

const getProgramTask = async (taskId) => {
    const r = await safeQuery(
        `SELECT * FROM program_project_tasks WHERE id = $1 LIMIT 1`,
        [taskId]
    );
    return r.rows[0] || null;
};

const canManageProgramProject = async (user, programProject) => {
    if (!programProject) return false;
    if (user.role === "System Administrator" || user.role === "Executive Manager") {
        return true;
    }
    if (user.role === "Project Manager") {
        return String(programProject.assigned_to) === String(user.id);
    }
    return false;
};

/* =========================================================
   CREATE PROGRAM TASK
   POST /api/program-tasks/program-project/:programProjectId
========================================================= */

const createProgramTask = async (req, res) => {
    try {
        const { programProjectId } = req.params;
        const {
            name,
            description,
            objectives,
            status,
            priority,
            assigneeId,
            startDate,
            dueDate,
        } = req.body;

        if (!isManagementRole(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Only managers can create program tasks.",
            });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Task name is required.",
            });
        }

        const programProject = await getProgramProject(programProjectId);
        if (!programProject) {
            return res.status(404).json({
                success: false,
                message: "Program project not found.",
            });
        }

        const allowed = await canManageProgramProject(req.user, programProject);
        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: "You are not the Project Manager for this program project.",
            });
        }

        // Assignee must be a Member
        if (assigneeId) {
            const u = await safeQuery(
                `SELECT id, role FROM users WHERE id = $1 AND is_active = TRUE`,
                [assigneeId]
            );
            if (u.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Assignee not found.",
                });
            }
            if (u.rows[0].role !== "Member") {
                return res.status(400).json({
                    success: false,
                    message: "Only Members can be assigned to program tasks.",
                });
            }
        }

        const result = await safeQuery(
            `
            INSERT INTO program_project_tasks (
                program_project_id,
                name,
                description,
                objectives,
                status,
                priority,
                assignee_id,
                created_by,
                start_date,
                due_date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
            `,
            [
                programProjectId,
                name.trim(),
                description?.trim() || null,
                objectives?.trim() || null,
                status || "To Do",
                priority || "Medium",
                assigneeId || null,
                req.user.id,
                startDate || null,
                dueDate || null,
            ]
        );

        return res.status(201).json({
            success: true,
            task: result.rows[0],
        });
    } catch (error) {
        console.error("Create program task error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to create program task.",
            ...(process.env.NODE_ENV !== "production" && { error: error.message }),
        });
    }
};

/* =========================================================
   LIST PROGRAM TASKS FOR A PROGRAM PROJECT
   GET /api/program-tasks/program-project/:programProjectId
========================================================= */

const getProgramProjectTasks = async (req, res) => {
    try {
        const { programProjectId } = req.params;
        const programProject = await getProgramProject(programProjectId);
        if (!programProject) {
            return res.status(404).json({
                success: false,
                message: "Program project not found.",
            });
        }

        const allowed =
            isManagementRole(req.user.role) ||
            String(programProject.assigned_to) === String(req.user.id);

        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: "Not authorized to view tasks for this program project.",
            });
        }

        let query = `
            SELECT
                t.*,
                u.full_name AS assignee_name,
                u.email     AS assignee_email,
                pp.name      AS program_project_name,
                pp.assigned_to AS program_project_manager_id,
                pg.name      AS program_name
            FROM program_project_tasks t
            LEFT JOIN users u ON u.id = t.assignee_id
            LEFT JOIN program_projects pp ON pp.id = t.program_project_id
            LEFT JOIN programs pg ON pg.id = pp.program_id
            WHERE t.program_project_id = $1
        `;
        const params = [programProjectId];

        // Project Manager only sees tasks assigned to Members
        if (req.user.role === "Project Manager") {
            // no additional filter — they already own the program project
        }

        query += ` ORDER BY t.created_at DESC`;

        const result = await safeQuery(query, params);
        return res.status(200).json({
            success: true,
            tasks: result.rows,
        });
    } catch (error) {
        console.error("List program tasks error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch program tasks.",
        });
    }
};

/* =========================================================
   MEMBER: MY PROGRAM TASKS
   GET /api/program-tasks/my/tasks
========================================================= */

const getMyProgramTasks = async (req, res) => {
    try {
        const result = await safeQuery(
            `
            SELECT
                t.*,
                u.full_name AS assignee_name,
                pp.name      AS program_project_name,
                pp.domain    AS program_project_domain,
                pp.assigned_to AS program_project_manager_id,
                pg.name      AS program_name
            FROM program_project_tasks t
            LEFT JOIN users u ON u.id = t.assignee_id
            LEFT JOIN program_projects pp ON pp.id = t.program_project_id
            LEFT JOIN programs pg ON pg.id = pp.program_id
            WHERE t.assignee_id = $1
            ORDER BY t.created_at DESC
            `,
            [req.user.id]
        );

        return res.status(200).json({
            success: true,
            tasks: result.rows,
        });
    } catch (error) {
        console.error("Get my program tasks error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch your program tasks.",
        });
    }
};

/* =========================================================
   MANAGERS: ALL PROGRAM TASKS IN THEIR SCOPE
   GET /api/program-tasks/all
========================================================= */

const getAllProgramTasks = async (req, res) => {
    try {
        if (!isManagementRole(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Only managers can view all program tasks.",
            });
        }

        let query = `
            SELECT
                t.*,
                u.full_name AS assignee_name,
                pp.name      AS program_project_name,
                pp.domain    AS program_project_domain,
                pp.assigned_to AS program_project_manager_id,
                pg.name      AS program_name
            FROM program_project_tasks t
            LEFT JOIN users u ON u.id = t.assignee_id
            LEFT JOIN program_projects pp ON pp.id = t.program_project_id
            LEFT JOIN programs pg ON pg.id = pp.program_id
        `;
        const params = [];

        if (req.user.role === "Project Manager") {
            query += ` WHERE pp.assigned_to = $1 `;
            params.push(req.user.id);
        }

        query += ` ORDER BY t.created_at DESC `;

        const result = await safeQuery(query, params);
        return res.status(200).json({
            success: true,
            tasks: result.rows,
        });
    } catch (error) {
        console.error("Get all program tasks error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch program tasks.",
        });
    }
};

/* =========================================================
   GET SINGLE PROGRAM TASK
   GET /api/program-tasks/:taskId
========================================================= */

const getProgramTaskById = async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = await getProgramTask(taskId);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Program task not found.",
            });
        }

        const pp = await getProgramProject(task.program_project_id);

        const isManager = isManagementRole(req.user.role);
        const isAssignee =
            String(task.assignee_id || "") === String(req.user.id);
        const isOwnerPM =
            req.user.role === "Project Manager" &&
            String(pp?.assigned_to) === String(req.user.id);

        if (!isManager && !isAssignee && !isOwnerPM) {
            return res.status(403).json({
                success: false,
                message: "Not authorized to view this program task.",
            });
        }

        const detail = await safeQuery(
            `
            SELECT
                t.*,
                u.full_name AS assignee_name,
                u.email     AS assignee_email,
                pp.name     AS program_project_name,
                pp.domain   AS program_project_domain,
                pp.assigned_to AS program_project_manager_id,
                pg.name     AS program_name
            FROM program_project_tasks t
            LEFT JOIN users u ON u.id = t.assignee_id
            LEFT JOIN program_projects pp ON pp.id = t.program_project_id
            LEFT JOIN programs pg ON pg.id = pp.program_id
            WHERE t.id = $1
            `,
            [taskId]
        );

        return res.status(200).json({
            success: true,
            task: detail.rows[0],
        });
    } catch (error) {
        console.error("Get program task error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch program task.",
        });
    }
};

/* =========================================================
   UPDATE PROGRAM TASK STATUS
   PATCH /api/program-tasks/:taskId/status
========================================================= */

const updateProgramTaskStatus = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { status } = req.body;

        const ALLOWED = ["To Do", "In Progress", "Completed", "Done"];
        if (!ALLOWED.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status.",
            });
        }

        const task = await getProgramTask(taskId);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Program task not found.",
            });
        }

        const isManager = isManagementRole(req.user.role);
        const isAssignee =
            String(task.assignee_id || "") === String(req.user.id);

        if (!isManager && !isAssignee) {
            return res.status(403).json({
                success: false,
                message: "Not authorized to change this task.",
            });
        }

        // Member rules: cannot set Done
        if (req.user.role === "Member" && status === "Done") {
            return res.status(403).json({
                success: false,
                message:
                    "Members cannot mark program tasks as Done. Please mark it Completed and the manager will review.",
            });
        }

        // Managers can only set Done if task is Completed
        if (isManager && status === "Done" && task.status !== "Completed") {
            return res.status(400).json({
                success: false,
                message:
                    "Task must be marked Completed by the assignee before it can be marked Done.",
            });
        }

        await safeQuery(
            `
            UPDATE program_project_tasks
            SET status = $1,
                updated_at = CURRENT_TIMESTAMP,
                completed_at = CASE
                    WHEN $1 = 'Done' THEN CURRENT_TIMESTAMP
                    ELSE completed_at
                END
            WHERE id = $2
            `,
            [status, taskId]
        );

        return res.status(200).json({
            success: true,
            message: "Status updated.",
        });
    } catch (error) {
        console.error("Update program task status error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update status.",
        });
    }
};

/* =========================================================
   MARK PROGRAM TASK DONE
   PATCH /api/program-tasks/:taskId/mark-done
========================================================= */

const markProgramTaskDone = async (req, res) => {
    try {
        const { taskId } = req.params;

        if (!isManagementRole(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Only managers can mark program tasks as Done.",
            });
        }

        const result = await safeQuery(
            `
            SELECT
                t.status,
                (SELECT COUNT(*)::int FROM program_task_submissions WHERE program_task_id = t.id) AS sub_count,
                (SELECT COUNT(*)::int FROM program_task_work_parts WHERE program_task_id = t.id) AS part_count,
                (SELECT COUNT(*)::int FROM program_task_work_parts
                    WHERE program_task_id = t.id AND status = 'Done') AS done_part_count,
                (SELECT COUNT(*)::int FROM program_task_submissions
                    WHERE program_task_id = t.id AND link IS NOT NULL AND TRIM(link) <> '') AS link_count
            FROM program_project_tasks t
            WHERE t.id = $1
            `,
            [taskId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Program task not found.",
            });
        }

        const t = result.rows[0];

        if (t.status !== "Completed") {
            return res.status(400).json({
                success: false,
                message: "Task must be Completed by the assignee first.",
            });
        }

        if (t.part_count === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one work part is required.",
            });
        }

        if (t.done_part_count === 0 && t.link_count === 0) {
            return res.status(400).json({
                success: false,
                message:
                    "At least one work part must be Done, or one submission link provided.",
            });
        }

        await safeQuery(
            `
            UPDATE program_project_tasks
            SET status = 'Done',
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            `,
            [taskId]
        );

        return res.status(200).json({
            success: true,
            message: "Program task marked as Done.",
        });
    } catch (error) {
        console.error("Mark program task done error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to mark task as Done.",
        });
    }
};

/* =========================================================
   DELETE PROGRAM TASK
   DELETE /api/program-tasks/:taskId
========================================================= */

const deleteProgramTask = async (req, res) => {
    try {
        const { taskId } = req.params;

        if (!isManagementRole(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Only managers can delete program tasks.",
            });
        }

        const task = await getProgramTask(taskId);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Program task not found.",
            });
        }

        const pp = await getProgramProject(task.program_project_id);
        const allowed = await canManageProgramProject(req.user, pp);
        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: "Not authorized to delete this task.",
            });
        }

        await safeQuery(
            `DELETE FROM program_project_tasks WHERE id = $1`,
            [taskId]
        );

        return res.status(200).json({
            success: true,
            message: "Program task deleted.",
        });
    } catch (error) {
        console.error("Delete program task error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete program task.",
        });
    }
};

/* =========================================================
   INSTRUCTION FILE
   POST /api/program-tasks/:taskId/instructions
========================================================= */

const uploadInstructionFile = async (req, res) => {
    try {
        const { taskId } = req.params;

        if (!isManagementRole(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Only managers can upload instruction files.",
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file provided.",
            });
        }

        const { originalname, buffer, size, mimetype } = req.file;

        if (size > MAX_FILE_SIZE) {
            return res.status(400).json({
                success: false,
                message: "File exceeds 10 MB.",
            });
        }

        const ext = originalname.split(".").pop().toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return res.status(400).json({
                success: false,
                message: `Only ${ALLOWED_EXTENSIONS.join(", ")} allowed.`,
            });
        }

        if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
            return res.status(400).json({
                success: false,
                message: "Unsupported MIME type.",
            });
        }

        const task = await getProgramTask(taskId);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Program task not found.",
            });
        }

        const r = await safeQuery(
            `
            INSERT INTO program_task_instruction_files (
                program_task_id, file_name, file_type, mime_type,
                file_size, file_content, uploaded_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, program_task_id, file_name, file_type, mime_type,
                      file_size, uploaded_by, created_at
            `,
            [
                taskId,
                originalname,
                ext,
                mimetype,
                size,
                buffer,
                req.user.id,
            ]
        );

        return res.status(201).json({
            success: true,
            instruction: r.rows[0],
        });
    } catch (error) {
        console.error("Upload instruction error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to upload instruction file.",
        });
    }
};

const getInstructionFiles = async (req, res) => {
    try {
        const { taskId } = req.params;

        const task = await getProgramTask(taskId);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Program task not found.",
            });
        }

        const isManager = isManagementRole(req.user.role);
        const isAssignee =
            String(task.assignee_id || "") === String(req.user.id);

        if (!isManager && !isAssignee) {
            return res.status(403).json({
                success: false,
                message: "Not authorized.",
            });
        }

        const r = await safeQuery(
            `
            SELECT id, program_task_id, file_name, file_type, mime_type,
                   file_size, uploaded_by, created_at
            FROM program_task_instruction_files
            WHERE program_task_id = $1
            ORDER BY created_at DESC
            `,
            [taskId]
        );

        return res.status(200).json({
            success: true,
            instructions: r.rows,
        });
    } catch (error) {
        console.error("Get instructions error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load instructions.",
        });
    }
};

const downloadInstructionFile = async (req, res) => {
    try {
        const { instructionId } = req.params;

        const r = await safeQuery(
            `
            SELECT i.*, t.assignee_id
            FROM program_task_instruction_files i
            INNER JOIN program_project_tasks t ON t.id = i.program_task_id
            WHERE i.id = $1
            `,
            [instructionId]
        );

        if (r.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Instruction not found.",
            });
        }

        const file = r.rows[0];

        const isManager = isManagementRole(req.user.role);
        const isAssignee =
            String(file.assignee_id || "") === String(req.user.id);

        if (!isManager && !isAssignee) {
            return res.status(403).json({
                success: false,
                message: "Not authorized.",
            });
        }

        const buffer = Buffer.isBuffer(file.file_content)
            ? file.file_content
            : Buffer.from(file.file_content);

        res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(file.file_name)}"`
        );
        res.setHeader("Content-Length", buffer.length);
        return res.status(200).send(buffer);
    } catch (error) {
        console.error("Download instruction error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to download.",
        });
    }
};

const previewInstructionFile = async (req, res) => {
    try {
        const { instructionId } = req.params;

        const r = await safeQuery(
            `
            SELECT i.*, t.assignee_id
            FROM program_task_instruction_files i
            INNER JOIN program_project_tasks t ON t.id = i.program_task_id
            WHERE i.id = $1
            `,
            [instructionId]
        );

        if (r.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Instruction not found.",
            });
        }

        const file = r.rows[0];
        const isManager = isManagementRole(req.user.role);
        const isAssignee =
            String(file.assignee_id || "") === String(req.user.id);

        if (!isManager && !isAssignee) {
            return res.status(403).json({
                success: false,
                message: "Not authorized.",
            });
        }

        const buffer = Buffer.isBuffer(file.file_content)
            ? file.file_content
            : Buffer.from(file.file_content);

        res.setHeader("Content-Type", file.mime_type || "application/octet-stream");
        res.setHeader(
            "Content-Disposition",
            `inline; filename="${encodeURIComponent(file.file_name)}"`
        );
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "private, no-store, max-age=0");
        return res.status(200).send(buffer);
    } catch (error) {
        console.error("Preview instruction error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to preview.",
        });
    }
};

const deleteInstructionFile = async (req, res) => {
    try {
        const { instructionId } = req.params;

        if (!isManagementRole(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Only managers can delete instruction files.",
            });
        }

        await safeQuery(
            `DELETE FROM program_task_instruction_files WHERE id = $1`,
            [instructionId]
        );

        return res.status(200).json({
            success: true,
            message: "Instruction file deleted.",
        });
    } catch (error) {
        console.error("Delete instruction error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete.",
        });
    }
};

/* =========================================================
   ASSIGN MEMBERS TO PROGRAM PROJECT
   POST /api/program-tasks/program-project/:id/members
   body: { userIds: string[] }   (replaces the current set)
========================================================= */

const assignProgramProjectMembers = async (req, res) => {
    try {
        const { programProjectId } = req.params;
        const { userIds } = req.body;

        if (!isManagementRole(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Only managers can assign members.",
            });
        }

        if (!Array.isArray(userIds)) {
            return res.status(400).json({
                success: false,
                message: "userIds must be an array.",
            });
        }

        const pp = await getProgramProject(programProjectId);
        if (!pp) {
            return res.status(404).json({
                success: false,
                message: "Program project not found.",
            });
        }

        const allowed = await canManageProgramProject(req.user, pp);
        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: "You are not the Project Manager for this program project.",
            });
        }

        // Validate that every user is an active Member
        if (userIds.length > 0) {
            const check = await safeQuery(
                `SELECT id, role FROM users WHERE id = ANY($1::uuid[]) AND is_active = TRUE`,
                [userIds]
            );
            const invalid = check.rows.filter((u) => u.role !== "Member");
            if (invalid.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Only Members can be assigned to program projects.",
                });
            }
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            await client.query(
                `DELETE FROM program_project_members WHERE program_project_id = $1`,
                [programProjectId]
            );

            if (userIds.length > 0) {
                const values = userIds.map((_, i) => `($1, $${i + 2}, $${userIds.length + 2})`);
                const params = [programProjectId, ...userIds, req.user.id];

                await client.query(
                    `INSERT INTO program_project_members (program_project_id, user_id, assigned_by)
                     VALUES ${values.join(", ")}
                     ON CONFLICT (program_project_id, user_id) DO NOTHING`,
                    params
                );
            }

            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }

        return res.status(200).json({ success: true, message: "Members updated." });
    } catch (error) {
        console.error("Assign program project members error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to assign members.",
        });
    }
};

/* =========================================================
   GET MEMBERS OF PROGRAM PROJECT
   GET /api/program-tasks/program-project/:id/members
========================================================= */

const getProgramProjectMembers = async (req, res) => {
    try {
        const { programProjectId } = req.params;

        const pp = await getProgramProject(programProjectId);
        if (!pp) {
            return res.status(404).json({
                success: false,
                message: "Program project not found.",
            });
        }

        const r = await safeQuery(
            `
            SELECT
                ppm.id,
                ppm.user_id,
                ppm.assigned_at,
                u.full_name,
                u.email,
                u.role,
                u.job_title
            FROM program_project_members ppm
            JOIN users u ON u.id = ppm.user_id
            WHERE ppm.program_project_id = $1
            ORDER BY u.full_name ASC
            `,
            [programProjectId]
        );

        return res.status(200).json({ success: true, members: r.rows });
    } catch (error) {
        console.error("Get program project members error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load members.",
        });
    }
};

/* =========================================================
   MEMBER: MY PROGRAM PROJECTS
   GET /api/program-tasks/my/program-projects
========================================================= */

const getMyProgramProjects = async (req, res) => {
    try {
        const r = await safeQuery(
            `
            SELECT
                pp.*,
                pg.name AS program_name,
                pm.full_name AS assigned_to_name,
                (
                    SELECT COUNT(*)::int
                    FROM program_project_tasks
                    WHERE program_project_id = pp.id
                ) AS task_count,
                (
                    SELECT COUNT(*)::int
                    FROM program_project_tasks
                    WHERE program_project_id = pp.id AND status = 'Done'
                ) AS completed_task_count,
                (
                    SELECT COUNT(*)::int
                    FROM program_project_tasks
                    WHERE program_project_id = pp.id AND assignee_id = $1
                ) AS my_task_count,
                (
                    SELECT COUNT(*)::int
                    FROM program_project_tasks
                    WHERE program_project_id = pp.id
                      AND assignee_id = $1
                      AND status = 'Done'
                ) AS my_completed_task_count
            FROM program_project_members ppm
            JOIN program_projects pp ON pp.id = ppm.program_project_id
            LEFT JOIN programs pg ON pg.id = pp.program_id
            LEFT JOIN users pm ON pm.id = pp.assigned_to
            WHERE ppm.user_id = $1
            ORDER BY pp.created_at DESC
            `,
            [req.user.id]
        );

        return res.status(200).json({
            success: true,
            programProjects: r.rows,
        });
    } catch (error) {
        console.error("Get my program projects error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load your program projects.",
        });
    }
};

/* =========================================================
   MEMBER: TASKS I CAN SEE INSIDE A PROGRAM PROJECT I'M IN
   GET /api/program-tasks/my/program-project/:id/tasks
========================================================= */

const getMyProgramProjectTasks = async (req, res) => {
    try {
        const { programProjectId } = req.params;

        // Confirm the requester is a member of this program project
        const membership = await safeQuery(
            `SELECT 1 FROM program_project_members
             WHERE program_project_id = $1 AND user_id = $2`,
            [programProjectId, req.user.id]
        );

        if (membership.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this program project.",
            });
        }

        const r = await safeQuery(
            `
            SELECT
                t.*,
                u.full_name AS assignee_name,
                u.email AS assignee_email,
                pp.name AS program_project_name,
                pg.name AS program_name
            FROM program_project_tasks t
            LEFT JOIN users u ON u.id = t.assignee_id
            LEFT JOIN program_projects pp ON pp.id = t.program_project_id
            LEFT JOIN programs pg ON pg.id = pp.program_id
            WHERE t.program_project_id = $1
            ORDER BY t.created_at DESC
            `,
            [programProjectId]
        );

        return res.status(200).json({ success: true, tasks: r.rows });
    } catch (error) {
        console.error("Get my program project tasks error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load tasks.",
        });
    }
};

module.exports = {
    createProgramTask,
    getProgramProjectTasks,
    getMyProgramTasks,
    getAllProgramTasks,
    getProgramTaskById,
    updateProgramTaskStatus,
    markProgramTaskDone,
    deleteProgramTask,

    uploadInstructionFile,
    getInstructionFiles,
    downloadInstructionFile,
    previewInstructionFile,
    deleteInstructionFile,
    assignProgramProjectMembers,
    getProgramProjectMembers,
    getMyProgramProjects,
    getMyProgramProjectTasks,
};

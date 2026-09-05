// controllers/projectcontroller.js
const pool = require("../config/db");

/* =========================================================
   HELPER: SAFE DATABASE QUERY WITH CONNECTION RELEASE
========================================================= */

const safeQuery = async (text, params) => {
    const client = await pool.connect();
    try {
        const result = await client.query(text, params);
        return result;
    } finally {
        client.release(); // ✅ Always release connection back to pool
    }
};

const safeTransaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/* =========================================================
   GET PROJECTS
========================================================= */

const getProjects = async (req, res) => {
    try {
        console.log('🔍 Fetching projects for user:', req.user?.id);

        const result = await safeQuery(`
            SELECT 
                p.id,
                p.name,
                p.domain,
                p.about_title,
                p.about_description,
                p.status,
                p.priority,
                p.start_date,
                p.deadline,
                p.progress,
                p.created_at,
                p.updated_at,

                creator.id AS creator_id,
                creator.full_name AS creator_name,
                creator.role AS creator_role,

                manager.id AS manager_id,
                manager.full_name AS manager_name,
                manager.email AS manager_email,
                manager.role AS manager_role

            FROM projects p

            JOIN users creator
                ON creator.id = p.created_by

            LEFT JOIN users manager
                ON manager.id = p.project_manager_id

            ORDER BY p.created_at DESC
        `);

        console.log(`✅ Found ${result.rows.length} projects`);

        return res.status(200).json({
            success: true,
            projects: result.rows
        });

    } catch (error) {
        console.error("❌ Get projects error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve projects.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   GET PROJECT MANAGERS
========================================================= */

const getProjectManagers = async (req, res) => {
    try {
        console.log('🔍 Fetching project managers');

        const result = await safeQuery(`
            SELECT
                id,
                full_name,
                email,
                role
            FROM users
            WHERE role = 'Project Manager'
              AND is_active = TRUE
            ORDER BY full_name
        `);

        console.log(`✅ Found ${result.rows.length} project managers`);

        return res.status(200).json({
            success: true,
            managers: result.rows
        });

    } catch (error) {
        console.error("❌ Get project managers error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve project managers.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   CREATE PROJECT
========================================================= */

const createProject = async (req, res) => {
    try {
        const {
            name,
            domain,
            aboutTitle,
            aboutDescription,
            startDate,
            deadline,
            priority
        } = req.body;

        console.log('🔍 Creating project:', { name, domain, priority, user: req.user?.id });

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Project name is required."
            });
        }

        const result = await safeQuery(
            `
            INSERT INTO projects (
                name,
                domain,
                about_title,
                about_description,
                start_date,
                deadline,
                priority,
                created_by
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8
            )
            RETURNING *
            `,
            [
                name.trim(),
                domain || null,
                aboutTitle || null,
                aboutDescription || null,
                startDate || null,
                deadline || null,
                priority || "Medium",
                req.user.id
            ]
        );

        console.log('✅ Project created:', result.rows[0].id);

        return res.status(201).json({
            success: true,
            message: "Project created successfully.",
            project: result.rows[0]
        });

    } catch (error) {
        console.error("❌ Create project error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to create project.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   UPDATE PROJECT
========================================================= */

const updateProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const {
            name,
            domain,
            aboutTitle,
            aboutDescription,
            startDate,
            deadline,
            priority
        } = req.body;

        console.log('🔍 Updating project:', { projectId, name, user: req.user?.id });

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Project name is required."
            });
        }

        /* ---------------------------------------------------------
           Validate dates
        --------------------------------------------------------- */
        if (startDate && deadline && deadline < startDate) {
            return res.status(400).json({
                success: false,
                message: "Deadline must be greater than or equal to the start date."
            });
        }

        /* ---------------------------------------------------------
           Check project exists
        --------------------------------------------------------- */
        const projectResult = await safeQuery(
            `SELECT id FROM projects WHERE id = $1`,
            [projectId]
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found."
            });
        }

        /* ---------------------------------------------------------
           Update project
        --------------------------------------------------------- */
        const result = await safeQuery(
            `
            UPDATE projects
            SET
                name = $1,
                domain = $2,
                about_title = $3,
                about_description = $4,
                start_date = $5,
                deadline = $6,
                priority = $7,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $8
            RETURNING *
            `,
            [
                name.trim(),
                domain || null,
                aboutTitle || null,
                aboutDescription || null,
                startDate || null,
                deadline || null,
                priority || "Medium",
                projectId
            ]
        );

        console.log('✅ Project updated:', projectId);

        return res.status(200).json({
            success: true,
            message: "Project updated successfully.",
            project: result.rows[0]
        });

    } catch (error) {
        console.error("❌ Update project error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to update project.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   UPDATE PROJECT DEADLINE
========================================================= */

const updateProjectDeadline = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { deadline } = req.body;

        console.log('🔍 Updating deadline for project:', { projectId, deadline });

        /* ---------------------------------------------------------
           Check project exists and get start_date
        --------------------------------------------------------- */
        const projectResult = await safeQuery(
            `SELECT start_date FROM projects WHERE id = $1`,
            [projectId]
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found."
            });
        }

        const startDate = projectResult.rows[0].start_date;

        /* ---------------------------------------------------------
           Validate deadline
        --------------------------------------------------------- */
        if (deadline && startDate && deadline < startDate) {
            return res.status(400).json({
                success: false,
                message: "Deadline must be greater than or equal to the start date."
            });
        }

        /* ---------------------------------------------------------
           Update deadline
        --------------------------------------------------------- */
        const result = await safeQuery(
            `
            UPDATE projects
            SET
                deadline = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
            `,
            [
                deadline || null,
                projectId
            ]
        );

        console.log('✅ Deadline updated for project:', projectId);

        return res.status(200).json({
            success: true,
            message: "Project deadline updated successfully.",
            project: result.rows[0]
        });

    } catch (error) {
        console.error("❌ Update deadline error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to update project deadline.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   DELETE PROJECT
========================================================= */

const deleteProject = async (req, res) => {
    try {
        const { projectId } = req.params;

        console.log('🔍 Deleting project:', { projectId, user: req.user?.id });

        const result = await safeTransaction(async (client) => {
            /* ---------------------------------------------------------
               Check project exists
            --------------------------------------------------------- */
            const projectResult = await client.query(
                `SELECT id, name FROM projects WHERE id = $1`,
                [projectId]
            );

            if (projectResult.rows.length === 0) {
                throw new Error("Project not found");
            }

            const projectName = projectResult.rows[0].name;

            /* ---------------------------------------------------------
               Delete tasks first (cascade will handle this, but we want count)
            --------------------------------------------------------- */
            const deletedTasks = await client.query(
                `DELETE FROM tasks WHERE project_id = $1 RETURNING id`,
                [projectId]
            );

            /* ---------------------------------------------------------
               Delete project
            --------------------------------------------------------- */
            await client.query(
                `DELETE FROM projects WHERE id = $1`,
                [projectId]
            );

            return {
                projectId,
                projectName,
                deletedTasks: deletedTasks.rowCount
            };
        });

        console.log('✅ Project deleted:', result.projectId, `(${result.deletedTasks} tasks deleted)`);

        return res.status(200).json({
            success: true,
            message: "Project and its tasks deleted successfully.",
            projectId: result.projectId,
            projectName: result.projectName,
            deletedTasks: result.deletedTasks
        });

    } catch (error) {
        console.error("❌ Delete project error:", error);
        console.error("Stack:", error.stack);

        if (error.message === "Project not found") {
            return res.status(404).json({
                success: false,
                message: "Project not found."
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to delete project.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   ASSIGN PROJECT
========================================================= */

const assignProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { managerId } = req.body;

        console.log('🔍 Assigning project:', { projectId, managerId, user: req.user?.id });

        if (!managerId) {
            return res.status(400).json({
                success: false,
                message: "Project manager is required."
            });
        }

        /* ---------------------------------------------------------
           Verify manager exists and is active
        --------------------------------------------------------- */
        const managerResult = await safeQuery(
            `
            SELECT id, full_name, email, role, is_active
            FROM users
            WHERE id = $1
              AND role = 'Project Manager'
              AND is_active = TRUE
            `,
            [managerId]
        );

        if (managerResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Selected user is not an active Project Manager."
            });
        }

        /* ---------------------------------------------------------
           Verify project exists
        --------------------------------------------------------- */
        const projectResult = await safeQuery(
            `SELECT id FROM projects WHERE id = $1`,
            [projectId]
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found."
            });
        }

        /* ---------------------------------------------------------
           Assign project
        --------------------------------------------------------- */
        const result = await safeQuery(
            `
            UPDATE projects
            SET
                project_manager_id = $1,
                status = CASE
                    WHEN status = 'Unassigned' THEN 'Backlog'
                    ELSE status
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
            `,
            [managerId, projectId]
        );

        console.log('✅ Project assigned:', projectId, 'to manager:', managerId);

        return res.status(200).json({
            success: true,
            message: "Project assigned successfully.",
            project: result.rows[0],
            manager: managerResult.rows[0]
        });

    } catch (error) {
        console.error("❌ Assign project error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to assign project.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   UNASSIGN PROJECT
========================================================= */

const unassignProject = async (req, res) => {
    try {
        const { projectId } = req.params;

        console.log('🔍 Unassigning project:', { projectId, user: req.user?.id });

        const result = await safeQuery(
            `
            UPDATE projects
            SET
                project_manager_id = NULL,
                status = 'Unassigned',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
            `,
            [projectId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found."
            });
        }

        console.log('✅ Project unassigned:', projectId);

        return res.status(200).json({
            success: true,
            message: "Project unassigned successfully.",
            project: result.rows[0]
        });

    } catch (error) {
        console.error("❌ Unassign project error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to unassign project.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   UPDATE PROJECT STATUS
========================================================= */

const updateProjectStatus = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { status } = req.body;

        console.log('🔍 Updating project status:', { projectId, status, user: req.user?.id });

        /* ---------------------------------------------------------
           Validate status
        --------------------------------------------------------- */
        const allowedStatuses = [
            "Unassigned",
            "Backlog",
            "In Progress",
            "Paused",
            "Done"
        ];

        if (!status || !allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid project status. Allowed statuses are: Unassigned, Backlog, In Progress, Paused, Done."
            });
        }

        /* ---------------------------------------------------------
           Check project exists and get current status
        --------------------------------------------------------- */
        const projectResult = await safeQuery(
            `
            SELECT id, name, status, project_manager_id
            FROM projects
            WHERE id = $1
            `,
            [projectId]
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found."
            });
        }

        const project = projectResult.rows[0];

        /* ---------------------------------------------------------
           Validate status transitions
        --------------------------------------------------------- */
        // Prevent assigned project from becoming Unassigned
        if (status === "Unassigned" && project.project_manager_id) {
            return res.status(400).json({
                success: false,
                message: "A project with an assigned Project Manager cannot have Unassigned status. Unassign the project first."
            });
        }

        // Prevent unassigned project from changing status
        if (status !== "Unassigned" && !project.project_manager_id) {
            return res.status(400).json({
                success: false,
                message: "A Project Manager must be assigned before changing the project status."
            });
        }

        /* ---------------------------------------------------------
           Update status
        --------------------------------------------------------- */
        const result = await safeQuery(
            `
            UPDATE projects
            SET
                status = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
            `,
            [status, projectId]
        );

        console.log('✅ Project status updated:', projectId, 'to', status);

        return res.status(200).json({
            success: true,
            message: "Project status updated successfully.",
            project: result.rows[0]
        });

    } catch (error) {
        console.error("❌ Update project status error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to update project status.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   GET PROJECT BY ID
========================================================= */

const getProjectById = async (req, res) => {
    try {
        const { projectId } = req.params;

        console.log('🔍 Fetching project by ID:', { projectId, user: req.user?.id });

        const result = await safeQuery(
            `
            SELECT 
                p.id,
                p.name,
                p.domain,
                p.about_title,
                p.about_description,
                p.status,
                p.priority,
                p.start_date,
                p.deadline,
                p.progress,
                p.created_at,
                p.updated_at,

                creator.id AS creator_id,
                creator.full_name AS creator_name,
                creator.role AS creator_role,

                manager.id AS manager_id,
                manager.full_name AS manager_name,
                manager.email AS manager_email,
                manager.role AS manager_role

            FROM projects p

            JOIN users creator
                ON creator.id = p.created_by

            LEFT JOIN users manager
                ON manager.id = p.project_manager_id

            WHERE p.id = $1
            `,
            [projectId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found."
            });
        }

        console.log('✅ Project found:', projectId);

        return res.status(200).json({
            success: true,
            project: result.rows[0]
        });

    } catch (error) {
        console.error("❌ Get project by ID error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve project.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

module.exports = {
    getProjects,
    getProjectManagers,
    getProjectById,
    createProject,
    updateProject,
    updateProjectDeadline,
    deleteProject,
    assignProject,
    unassignProject,
    updateProjectStatus
};

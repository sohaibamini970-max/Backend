const pool = require("../config/db");

/*
============================================================
GET PROJECTS
============================================================
*/

const getProjects = async (req, res) => {
    try {
        const result = await pool.query(`
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

        return res.status(200).json({
            success: true,
            projects: result.rows
        });

    } catch (error) {
        console.error("Get projects error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve projects."
        });
    }
};


/*
============================================================
GET PROJECT MANAGERS
============================================================
*/

const getProjectManagers = async (req, res) => {
    try {
        const result = await pool.query(`
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

        return res.status(200).json({
            success: true,
            managers: result.rows
        });

    } catch (error) {
        console.error("Get project managers error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve project managers."
        });
    }
};


/*
============================================================
CREATE PROJECT
============================================================
ONLY EXECUTIVE MANAGER
*/

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

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Project name is required."
            });
        }

        const result = await pool.query(
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

        return res.status(201).json({
            success: true,
            message: "Project created successfully.",
            project: result.rows[0]
        });

    } catch (error) {
        console.error("Create project error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create project."
        });
    }
};


/*
============================================================
UPDATE PROJECT
============================================================
ONLY EXECUTIVE MANAGER

Updates:
- name
- domain
- about title
- description
- start date
- deadline
- priority
*/

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

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Project name is required."
            });
        }

        /*
        --------------------------------------------------------
        Validate dates on backend as well
        --------------------------------------------------------
        */

        if (startDate && deadline && deadline < startDate) {
            return res.status(400).json({
                success: false,
                message:
                    "Deadline must be greater than or equal to the start date."
            });
        }

        const projectResult = await pool.query(
            `
            SELECT id
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

        const result = await pool.query(
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

        return res.status(200).json({
            success: true,
            message: "Project updated successfully.",
            project: result.rows[0]
        });

    } catch (error) {
        console.error("Update project error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update project."
        });
    }
};


/*
============================================================
UPDATE PROJECT DEADLINE
============================================================
ONLY EXECUTIVE MANAGER
*/

const updateProjectDeadline = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { deadline } = req.body;

        const projectResult = await pool.query(
            `
            SELECT start_date
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

        const startDate = projectResult.rows[0].start_date;

        if (deadline && startDate && deadline < startDate) {
            return res.status(400).json({
                success: false,
                message:
                    "Deadline must be greater than or equal to the start date."
            });
        }

        const result = await pool.query(
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

        return res.status(200).json({
            success: true,
            message: "Project deadline updated successfully.",
            project: result.rows[0]
        });

    } catch (error) {
        console.error("Update deadline error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update project deadline."
        });
    }
};


/*
============================================================
DELETE PROJECT
============================================================
ONLY EXECUTIVE MANAGER

Deletes:
1. All tasks belonging to project
2. Project itself

Uses transaction for safety.
*/

const deleteProject = async (req, res) => {
    const client = await pool.connect();

    try {
        const { projectId } = req.params;

        await client.query("BEGIN");

        /*
        --------------------------------------------------------
        Check project exists
        --------------------------------------------------------
        */

        const projectResult = await client.query(
            `
            SELECT id, name
            FROM projects
            WHERE id = $1
            `,
            [projectId]
        );

        if (projectResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Project not found."
            });
        }

        const projectName = projectResult.rows[0].name;

        /*
        --------------------------------------------------------
        Delete tasks first
        --------------------------------------------------------
        */

        const deletedTasks = await client.query(
            `
            DELETE FROM tasks
            WHERE project_id = $1
            RETURNING id
            `,
            [projectId]
        );

        /*
        --------------------------------------------------------
        Delete project
        --------------------------------------------------------
        */

        await client.query(
            `
            DELETE FROM projects
            WHERE id = $1
            `,
            [projectId]
        );

        await client.query("COMMIT");

        return res.status(200).json({
            success: true,
            message: "Project and its tasks deleted successfully.",
            projectId,
            projectName,
            deletedTasks: deletedTasks.rowCount
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Delete project error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to delete project."
        });

    } finally {
        client.release();
    }
};


/*
============================================================
ASSIGN PROJECT
============================================================
ONLY PROJECT MANAGER
*/

const assignProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { managerId } = req.body;

        if (!managerId) {
            return res.status(400).json({
                success: false,
                message: "Project manager is required."
            });
        }

        const managerResult = await pool.query(
            `
            SELECT
                id,
                full_name,
                email,
                role,
                is_active
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
                message:
                    "Selected user is not an active Project Manager."
            });
        }

        const projectResult = await pool.query(
            `
            SELECT id
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

        const result = await pool.query(
            `
            UPDATE projects
            SET
                project_manager_id = $1,
                status =
                    CASE
                        WHEN status = 'Unassigned'
                        THEN 'Backlog'
                        ELSE status
                    END
            WHERE id = $2
            RETURNING *
            `,
            [
                managerId,
                projectId
            ]
        );

        return res.status(200).json({
            success: true,
            message: "Project assigned successfully.",
            project: result.rows[0],
            manager: managerResult.rows[0]
        });

    } catch (error) {
        console.error("Assign project error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to assign project."
        });
    }
};


/*
============================================================
UNASSIGN PROJECT
============================================================
ONLY PROJECT MANAGER
*/

const unassignProject = async (req, res) => {
    try {
        const { projectId } = req.params;

        const result = await pool.query(
            `
            UPDATE projects
            SET
                project_manager_id = NULL,
                status = 'Unassigned'
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

        return res.status(200).json({
            success: true,
            message: "Project unassigned successfully.",
            project: result.rows[0]
        });

    } catch (error) {
        console.error("Unassign project error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to unassign project."
        });
    }
};

/*
============================================================
UPDATE PROJECT STATUS
============================================================
ONLY PROJECT MANAGER
============================================================

Allowed statuses:

- Unassigned
- Backlog
- In Progress
- Paused
- Done
*/

const updateProjectStatus = async (req, res) => {
    try {
        const { projectId } = req.params;
        const { status } = req.body;

        /*
        --------------------------------------------------------
        Validate status
        --------------------------------------------------------
        */

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
                message:
                    "Invalid project status. Allowed statuses are: Unassigned, Backlog, In Progress, Paused, Done."
            });
        }

        /*
        --------------------------------------------------------
        Check project exists
        --------------------------------------------------------
        */

        const projectResult = await pool.query(
            `
            SELECT
                id,
                name,
                status,
                project_manager_id
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

        /*
        --------------------------------------------------------
        Prevent assigned project from becoming Unassigned
        --------------------------------------------------------
        
        If a project still has a Project Manager, its status
        should not be changed to Unassigned.
        */

        if (
            status === "Unassigned" &&
            project.project_manager_id
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "A project with an assigned Project Manager cannot have Unassigned status. Unassign the project first."
            });
        }

        /*
        --------------------------------------------------------
        Prevent assigned project from remaining Unassigned
        --------------------------------------------------------
        */

        if (
            status !== "Unassigned" &&
            !project.project_manager_id
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "A Project Manager must be assigned before changing the project status."
            });
        }

        /*
        --------------------------------------------------------
        Update status
        --------------------------------------------------------
        */

        const result = await pool.query(
            `
            UPDATE projects
            SET
                status = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
            `,
            [
                status,
                projectId
            ]
        );

        return res.status(200).json({
            success: true,
            message: "Project status updated successfully.",
            project: result.rows[0]
        });

    } catch (error) {
        console.error("Update project status error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update project status."
        });
    }
};


module.exports = {
    getProjects,
    getProjectManagers,
    createProject,
    updateProject,
    updateProjectDeadline,
    deleteProject,
    assignProject,
    unassignProject,
    updateProjectStatus
};

const pool = require("../config/db");

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
Used by assignment board.
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

        console.error(
            "Get project managers error:",
            error
        );

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

        console.error(
            "Create project error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to create project."
        });
    }
};


/*
============================================================
ASSIGN PROJECT
============================================================
ONLY PROJECT MANAGER

The selected user MUST also be a Project Manager.
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


        /*
        --------------------------------------------------------
        Verify selected user is a Project Manager
        --------------------------------------------------------
        */

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


        /*
        --------------------------------------------------------
        Verify project exists
        --------------------------------------------------------
        */

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


        /*
        --------------------------------------------------------
        Assign project
        --------------------------------------------------------
        */

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

        console.error(
            "Assign project error:",
            error
        );

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

        console.error(
            "Unassign project error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to unassign project."
        });
    }
};


module.exports = {
    getProjects,
    getProjectManagers,
    createProject,
    assignProject,
    unassignProject
};



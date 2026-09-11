// controllers/programTaskChildControllers.js
const pool = require("../config/db");

const MANAGEMENT_ROLES = [
    "Project Manager",
    "Executive Manager",
    "System Administrator",
];
const isManagementRole = (r) => MANAGEMENT_ROLES.includes(r);

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
];
const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "txt"];

const safeQuery = async (text, params) => {
    const c = await pool.connect();
    try {
        return await c.query(text, params);
    } finally {
        c.release();
    }
};

/* =========================================================
   CHALLENGES
========================================================= */

const getProgramTaskChallenges = async (req, res) => {
    try {
        const { taskId } = req.params;

        const t = await safeQuery(
            `SELECT id, assignee_id FROM program_project_tasks WHERE id = $1`,
            [taskId]
        );
        if (t.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Task not found." });
        }

        const isManager = isManagementRole(req.user.role);
        const isAssignee =
            String(t.rows[0].assignee_id || "") === String(req.user.id);

        if (!isManager && !isAssignee) {
            return res.status(403).json({ success: false, message: "Not authorized." });
        }

        const r = await safeQuery(
            `
            SELECT c.*, u.full_name AS author_name, u.email AS author_email
            FROM program_task_challenges c
            LEFT JOIN users u ON u.id = c.user_id
            WHERE c.program_task_id = $1
            ORDER BY c.created_at ASC
            `,
            [taskId]
        );

        return res.status(200).json({ success: true, challenges: r.rows });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: "Failed to fetch." });
    }
};

const createProgramTaskChallenge = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { challenge } = req.body;

        if (req.user.role !== "Member") {
            return res.status(403).json({
                success: false,
                message: "Only Members can add challenges.",
            });
        }
        if (!challenge || !challenge.trim()) {
            return res.status(400).json({
                success: false,
                message: "Challenge text is required.",
            });
        }

        const t = await safeQuery(
            `SELECT assignee_id FROM program_project_tasks WHERE id = $1`,
            [taskId]
        );
        if (t.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Task not found." });
        }
        if (String(t.rows[0].assignee_id || "") !== String(req.user.id)) {
            return res.status(403).json({
                success: false,
                message: "You can only add challenges to tasks assigned to you.",
            });
        }

        const r = await safeQuery(
            `
            INSERT INTO program_task_challenges (program_task_id, user_id, challenge)
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [taskId, req.user.id, challenge.trim()]
        );

        return res.status(201).json({
            success: true,
            challenge: r.rows[0],
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: "Failed to add challenge." });
    }
};

const deleteProgramTaskChallenge = async (req, res) => {
    try {
        const { challengeId } = req.params;

        const r = await safeQuery(
            `SELECT * FROM program_task_challenges WHERE id = $1`,
            [challengeId]
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Challenge not found." });
        }
        const ch = r.rows[0];
        const isManager = isManagementRole(req.user.role);
        const isOwner = String(ch.user_id) === String(req.user.id);
        if (!isManager && !isOwner) {
            return res.status(403).json({ success: false, message: "Not authorized." });
        }

        await safeQuery(
            `DELETE FROM program_task_challenges WHERE id = $1`,
            [challengeId]
        );

        return res.status(200).json({ success: true, message: "Deleted." });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ success: false, message: "Failed to delete." });
    }
};

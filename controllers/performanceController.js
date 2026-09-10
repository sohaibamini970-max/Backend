// controllers/performanceController.js
const pool = require("../config/db");

/* =========================================================
   HELPER: SAFE QUERY
========================================================= */

const safeQuery = async (text, params) => {
    const client = await pool.connect();
    try {
        const result = await client.query(text, params);
        return result;
    } finally {
        client.release();
    }
};

/* =========================================================
   GET MEMBER PERFORMANCE
   GET /api/performance/member/:userId
========================================================= */

const getMemberPerformance = async (req, res) => {
    try {
        const { userId } = req.params;

        console.log('📊 Fetching performance for member:', userId);

        // Authorization check
        const requestingUser = req.user;
        const isSelf = String(requestingUser.id) === String(userId);
        const isManagerOrAdmin = ['Project Manager', 'Executive Manager', 'System Administrator']
            .includes(requestingUser.role);

        if (!isSelf && !isManagerOrAdmin) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to view this performance data."
            });
        }

        // Get user info
        const userResult = await safeQuery(
            `SELECT id, full_name, email, role FROM users WHERE id = $1 AND is_active = TRUE`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const user = userResult.rows[0];

        // Get performance stats
        const statsResult = await safeQuery(
            `
            SELECT 
                COUNT(t.id)::INTEGER AS total_tasks,
                
                COUNT(t.id) FILTER (WHERE t.status = 'Done')::INTEGER AS completed_tasks,
                
                COUNT(t.id) FILTER (WHERE t.status IN ('To Do', 'In Progress'))::INTEGER AS pending_tasks,
                
                COUNT(t.id) FILTER (
                    WHERE t.due_date < CURRENT_DATE 
                    AND t.status != 'Done'
                )::INTEGER AS overdue_tasks,
                
                COUNT(t.id) FILTER (
                    WHERE t.status = 'Done' 
                    AND t.completed_at IS NOT NULL
                    AND t.due_date IS NOT NULL
                    AND t.completed_at::DATE > t.due_date::DATE
                )::INTEGER AS overdue_done_tasks,
                
                COUNT(t.id) FILTER (
                    WHERE t.due_date < CURRENT_DATE 
                    AND t.status != 'Done'
                )::INTEGER AS not_completed_tasks,
                
                COUNT(DISTINCT t.project_id)::INTEGER AS project_count,
                
                ROUND(
                    COUNT(t.id) FILTER (WHERE t.status = 'Done')::NUMERIC / 
                    NULLIF(COUNT(t.id), 0) * 100, 
                    1
                )::NUMERIC AS completion_rate,
                
                ROUND(
                    COUNT(t.id) FILTER (
                        WHERE t.status = 'Done' 
                        AND t.completed_at IS NOT NULL
                        AND (t.due_date IS NULL OR t.completed_at::DATE <= t.due_date::DATE)
                    )::NUMERIC / 
                    NULLIF(COUNT(t.id) FILTER (WHERE t.status = 'Done'), 0) * 100,
                    1
                )::NUMERIC AS on_time_rate,
                
                ROUND(
                    AVG(
                        EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 86400
                    ) FILTER (WHERE t.status = 'Done' AND t.completed_at IS NOT NULL),
                    1
                )::NUMERIC AS avg_completion_days,
                
                MAX(t.updated_at) AS last_activity
                
            FROM tasks t
            WHERE t.assignee_id = $1
            `,
            [userId]
        );

        const stats = statsResult.rows[0] || {};

        // Get task breakdown by status
        const statusBreakdown = await safeQuery(
            `
            SELECT 
                status,
                COUNT(*)::INTEGER AS count
            FROM tasks
            WHERE assignee_id = $1
            GROUP BY status
            `,
            [userId]
        );

        // Get task breakdown by priority
        const priorityBreakdown = await safeQuery(
            `
            SELECT 
                priority,
                COUNT(*)::INTEGER AS count
            FROM tasks
            WHERE assignee_id = $1
            GROUP BY priority
            `,
            [userId]
        );

        // Get tasks per project
        const projectBreakdown = await safeQuery(
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
            JOIN projects p ON t.project_id = p.id
            WHERE t.assignee_id = $1
            GROUP BY p.id, p.name
            ORDER BY total_tasks DESC
            `,
            [userId]
        );

        // Get recent completed tasks (last 5)
        const recentTasks = await safeQuery(
            `
            SELECT 
                t.id,
                t.name,
                t.status,
                t.priority,
                t.due_date,
                t.completed_at,
                p.name AS project_name
            FROM tasks t
            JOIN projects p ON t.project_id = p.id
            WHERE t.assignee_id = $1
            ORDER BY t.updated_at DESC
            LIMIT 5
            `,
            [userId]
        );

        // Calculate performance grade
        const completionRate = parseFloat(stats.completion_rate || 0);
        const onTimeRate = parseFloat(stats.on_time_rate || 0);
        const overdueCount = parseInt(stats.overdue_tasks || 0);
        const totalTasks = parseInt(stats.total_tasks || 0);

        let performanceGrade = 'C';
        let performanceLabel = 'Average';

        const score = (completionRate * 0.4) + (onTimeRate * 0.4) - (overdueCount * 5);

        if (totalTasks === 0) {
            performanceGrade = 'N/A';
            performanceLabel = 'No Tasks';
        } else if (score >= 85) {
            performanceGrade = 'A+';
            performanceLabel = 'Outstanding';
        } else if (score >= 70) {
            performanceGrade = 'A';
            performanceLabel = 'Excellent';
        } else if (score >= 55) {
            performanceGrade = 'B';
            performanceLabel = 'Good';
        } else if (score >= 40) {
            performanceGrade = 'C';
            performanceLabel = 'Average';
        } else if (score >= 25) {
            performanceGrade = 'D';
            performanceLabel = 'Needs Improvement';
        } else {
            performanceGrade = 'F';
            performanceLabel = 'Critical';
        }

        console.log('✅ Performance data fetched for:', user.full_name);

        return res.status(200).json({
            success: true,
            user,
            stats: {
                totalTasks: parseInt(stats.total_tasks || 0),
                completedTasks: parseInt(stats.completed_tasks || 0),
                pendingTasks: parseInt(stats.pending_tasks || 0),
                overdueTasks: parseInt(stats.overdue_tasks || 0),
                overdueDoneTasks: parseInt(stats.overdue_done_tasks || 0),
                notCompletedTasks: parseInt(stats.not_completed_tasks || 0),
                projectCount: parseInt(stats.project_count || 0),
                completionRate: parseFloat(stats.completion_rate || 0),
                onTimeRate: parseFloat(stats.on_time_rate || 0),
                avgCompletionDays: parseFloat(stats.avg_completion_days || 0),
                lastActivity: stats.last_activity
            },
            performance: {
                grade: performanceGrade,
                label: performanceLabel,
                score: Math.max(0, Math.min(100, Math.round(score)))
            },
            statusBreakdown: statusBreakdown.rows,
            priorityBreakdown: priorityBreakdown.rows,
            projectBreakdown: projectBreakdown.rows,
            recentTasks: recentTasks.rows
        });

    } catch (error) {
        console.error("❌ Get member performance error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve performance data.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   GET ALL MEMBERS PERFORMANCE (Leaderboard)
   GET /api/performance/team
========================================================= */

const getTeamPerformance = async (req, res) => {
    try {
        const requestingUser = req.user;

        // Only managers and admins can view team performance
        if (!['Project Manager', 'Executive Manager', 'System Administrator'].includes(requestingUser.role)) {
            return res.status(403).json({
                success: false,
                message: "Only managers and administrators can view team performance."
            });
        }

        console.log('📊 Fetching team performance for:', requestingUser.role);

        let query = `
            SELECT 
                u.id,
                u.full_name,
                u.email,
                u.role,
                
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
                
                ROUND(
                    COUNT(t.id) FILTER (WHERE t.status = 'Done')::NUMERIC / 
                    NULLIF(COUNT(t.id), 0) * 100, 
                    1
                )::NUMERIC AS completion_rate,
                
                ROUND(
                    COUNT(t.id) FILTER (
                        WHERE t.status = 'Done' 
                        AND t.completed_at IS NOT NULL
                        AND (t.due_date IS NULL OR t.completed_at::DATE <= t.due_date::DATE)
                    )::NUMERIC / 
                    NULLIF(COUNT(t.id) FILTER (WHERE t.status = 'Done'), 0) * 100,
                    1
                )::NUMERIC AS on_time_rate
                
            FROM users u
            LEFT JOIN tasks t ON t.assignee_id = u.id
            WHERE u.role = 'Member' AND u.is_active = TRUE
        `;

        const params = [];

        // If Project Manager, filter to their projects
        if (requestingUser.role === 'Project Manager') {
            query += `
                AND (
                    t.project_id IN (
                        SELECT id FROM projects WHERE project_manager_id = $1
                    )
                    OR t.id IS NULL
                )
            `;
            params.push(requestingUser.id);
        }

        query += `
            GROUP BY u.id, u.full_name, u.email, u.role
            ORDER BY completion_rate DESC NULLS LAST, total_tasks DESC
        `;

        const result = await safeQuery(query, params);

        const members = result.rows.map(row => {
            const completionRate = parseFloat(row.completion_rate || 0);
            const onTimeRate = parseFloat(row.on_time_rate || 0);
            const overdueCount = parseInt(row.overdue_tasks || 0);
            const totalTasks = parseInt(row.total_tasks || 0);

            const score = (completionRate * 0.4) + (onTimeRate * 0.4) - (overdueCount * 5);

            let grade = 'N/A';
            let label = 'No Tasks';

            if (totalTasks > 0) {
                if (score >= 85) { grade = 'A+'; label = 'Outstanding'; }
                else if (score >= 70) { grade = 'A'; label = 'Excellent'; }
                else if (score >= 55) { grade = 'B'; label = 'Good'; }
                else if (score >= 40) { grade = 'C'; label = 'Average'; }
                else if (score >= 25) { grade = 'D'; label = 'Needs Improvement'; }
                else { grade = 'F'; label = 'Critical'; }
            }

            return {
                ...row,
                total_tasks: totalTasks,
                completed_tasks: parseInt(row.completed_tasks || 0),
                pending_tasks: parseInt(row.pending_tasks || 0),
                overdue_tasks: overdueCount,
                overdue_done_tasks: parseInt(row.overdue_done_tasks || 0),
                completion_rate: completionRate,
                on_time_rate: onTimeRate,
                performance: {
                    grade,
                    label,
                    score: Math.max(0, Math.min(100, Math.round(score)))
                }
            };
        });

        console.log(`✅ Team performance fetched: ${members.length} members`);

        return res.status(200).json({
            success: true,
            members,
            count: members.length
        });

    } catch (error) {
        console.error("❌ Get team performance error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve team performance.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   GET PERFORMANCE TRENDS
   GET /api/performance/member/:userId/trends
========================================================= */

const getPerformanceTrends = async (req, res) => {
    try {
        const { userId } = req.params;
        const { days = 30 } = req.query;

        const requestingUser = req.user;
        const isSelf = String(requestingUser.id) === String(userId);
        const isManagerOrAdmin = ['Project Manager', 'Executive Manager', 'System Administrator']
            .includes(requestingUser.role);

        if (!isSelf && !isManagerOrAdmin) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to view this data."
            });
        }

        const result = await safeQuery(
            `
            SELECT 
                DATE(completed_at) AS date,
                COUNT(*)::INTEGER AS completed_count
            FROM tasks
            WHERE assignee_id = $1
                AND status = 'Done'
                AND completed_at >= CURRENT_DATE - INTERVAL '1 day' * $2
            GROUP BY DATE(completed_at)
            ORDER BY date ASC
            `,
            [userId, parseInt(days)]
        );

        return res.status(200).json({
            success: true,
            trends: result.rows
        });

    } catch (error) {
        console.error("❌ Get performance trends error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve performance trends."
        });
    }
};

/* =========================================================
   SNAPSHOT PERFORMANCE (Cron job endpoint)
   POST /api/performance/snapshot
========================================================= */

const createPerformanceSnapshot = async (req, res) => {
    try {
        // Only admins can trigger snapshots manually
        if (req.user.role !== 'System Administrator') {
            return res.status(403).json({
                success: false,
                message: "Only system administrators can create snapshots."
            });
        }

        const result = await safeQuery(
            `
            INSERT INTO performance_snapshots (
                user_id, snapshot_date, total_tasks, completed_tasks, 
                pending_tasks, overdue_tasks, overdue_done_tasks, 
                not_completed_tasks, completion_rate, on_time_rate
            )
            SELECT 
                u.id,
                CURRENT_DATE,
                COUNT(t.id),
                COUNT(t.id) FILTER (WHERE t.status = 'Done'),
                COUNT(t.id) FILTER (WHERE t.status IN ('To Do', 'In Progress')),
                COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status != 'Done'),
                COUNT(t.id) FILTER (
                    WHERE t.status = 'Done' 
                    AND t.completed_at::DATE > t.due_date::DATE
                ),
                COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status != 'Done'),
                ROUND(
                    COUNT(t.id) FILTER (WHERE t.status = 'Done')::NUMERIC / 
                    NULLIF(COUNT(t.id), 0) * 100, 2
                ),
                ROUND(
                    COUNT(t.id) FILTER (
                        WHERE t.status = 'Done' 
                        AND t.completed_at::DATE <= t.due_date::DATE
                    )::NUMERIC / 
                    NULLIF(COUNT(t.id) FILTER (WHERE t.status = 'Done'), 0) * 100, 2
                )
            FROM users u
            LEFT JOIN tasks t ON t.assignee_id = u.id
            WHERE u.role = 'Member' AND u.is_active = TRUE
            GROUP BY u.id
            ON CONFLICT (user_id, snapshot_date) 
            DO UPDATE SET
                total_tasks = EXCLUDED.total_tasks,
                completed_tasks = EXCLUDED.completed_tasks,
                pending_tasks = EXCLUDED.pending_tasks,
                overdue_tasks = EXCLUDED.overdue_tasks,
                overdue_done_tasks = EXCLUDED.overdue_done_tasks,
                not_completed_tasks = EXCLUDED.not_completed_tasks,
                completion_rate = EXCLUDED.completion_rate,
                on_time_rate = EXCLUDED.on_time_rate
            RETURNING id
            `
        );

        return res.status(200).json({
            success: true,
            message: `Snapshots created for ${result.rowCount} members.`,
            count: result.rowCount
        });

    } catch (error) {
        console.error("❌ Create snapshot error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to create performance snapshots."
        });
    }
};

module.exports = {
    getMemberPerformance,
    getTeamPerformance,
    getPerformanceTrends,
    createPerformanceSnapshot
};

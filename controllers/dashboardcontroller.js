// controllers/dashboardcontroller.js
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

/* =========================================================
   HELPER: CLASSIFY USER ROLE
========================================================= */

const classifyUserRole = (user) => {
    const role = String(user.role || "")
        .toLowerCase()
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");

    const jobTitle = String(user.job_title || "")
        .toLowerCase()
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");

    const combined = `${role} ${jobTitle}`;

    /* ---------------------------------------------------------
       1. MANAGERS
    --------------------------------------------------------- */
    const isManager =
        role === "project manager" ||
        role === "executive manager" ||
        role === "team manager" ||
        role === "engineering manager" ||
        role === "product manager" ||
        role === "program manager" ||
        role === "manager" ||
        role.includes("manager") ||
        jobTitle.includes("manager") ||
        jobTitle.includes("team lead") ||
        jobTitle.includes("technical lead") ||
        jobTitle.includes("project lead");

    if (isManager) return { category: 'manager', label: 'Managers' };

    /* ---------------------------------------------------------
       2. DESIGNERS
    --------------------------------------------------------- */
    const isDesigner =
        combined.includes("frontend developer") ||
        combined.includes("front end developer") ||
        combined.includes("frontend engineer") ||
        combined.includes("front end engineer") ||
        combined.includes("ui developer") ||
        combined.includes("ux developer") ||
        combined.includes("ui/ux") ||
        combined.includes("ui ux") ||
        combined.includes("ui designer") ||
        combined.includes("ux designer") ||
        combined.includes("web designer") ||
        combined.includes("product designer") ||
        combined.includes("graphic designer") ||
        combined.includes("interaction designer") ||
        combined.includes("frontend");

    if (isDesigner) return { category: 'designer', label: 'Designers' };

    /* ---------------------------------------------------------
       3. DEVELOPERS
    --------------------------------------------------------- */
    const isDeveloper =
        combined.includes("full stack") ||
        combined.includes("fullstack") ||
        combined.includes("backend") ||
        combined.includes("back end") ||
        combined.includes("java") ||
        combined.includes("node") ||
        combined.includes("nodejs") ||
        combined.includes("node.js") ||
        combined.includes(".net") ||
        combined.includes("dotnet") ||
        combined.includes("c#") ||
        combined.includes("asp.net") ||
        combined.includes("php") ||
        combined.includes("python") ||
        combined.includes("django") ||
        combined.includes("flask") ||
        combined.includes("spring") ||
        combined.includes("software engineer") ||
        combined.includes("software developer") ||
        combined.includes("web developer") ||
        combined.includes("mobile developer") ||
        combined.includes("app developer") ||
        combined.includes("application developer") ||
        combined.includes("developer") ||
        combined.includes("engineer") ||
        role.includes("developer") ||
        jobTitle.includes("developer");

    if (isDeveloper) return { category: 'developer', label: 'Developers' };

    /* ---------------------------------------------------------
       4. QA / TESTING
    --------------------------------------------------------- */
    const isQA =
        combined.includes("qa") ||
        combined.includes("quality assurance") ||
        combined.includes("quality analyst") ||
        combined.includes("quality engineer") ||
        combined.includes("test engineer") ||
        combined.includes("software tester") ||
        combined.includes("tester") ||
        combined.includes("testing");

    if (isQA) return { category: 'qa', label: 'QA' };

    /* ---------------------------------------------------------
       5. OTHER
    --------------------------------------------------------- */
    return { category: 'other', label: 'Other' };
};

/* =========================================================
   DASHBOARD TEAM OVERVIEW
========================================================= */

const getDashboardTeamOverview = async (req, res) => {
    try {
        console.log('🔍 Fetching dashboard team overview for user:', req.user?.id);

        /* ---------------------------------------------------------
           FETCH ALL USERS - Using safeQuery
        --------------------------------------------------------- */
        const result = await safeQuery(`
            SELECT
                id,
                role,
                job_title,
                is_active
            FROM users
            WHERE is_active = TRUE
            ORDER BY id
        `);

        const users = result.rows;

        if (users.length === 0) {
            console.log('ℹ️ No active users found');
            return res.status(200).json({
                success: true,
                total: 0,
                developers: 0,
                designers: 0,
                managers: 0,
                qa: 0,
                other: 0,
                message: 'No active users found'
            });
        }

        console.log(`📊 Processing ${users.length} active users`);

        /* ---------------------------------------------------------
           CLASSIFY EACH USER
        --------------------------------------------------------- */
        let developers = 0;
        let designers = 0;
        let managers = 0;
        let qa = 0;
        let other = 0;

        const userCategories = [];

        users.forEach((user) => {
            const classification = classifyUserRole(user);
            
            // Count by category
            switch (classification.category) {
                case 'developer':
                    developers++;
                    break;
                case 'designer':
                    designers++;
                    break;
                case 'manager':
                    managers++;
                    break;
                case 'qa':
                    qa++;
                    break;
                default:
                    other++;
                    break;
            }
            
            userCategories.push({
                id: user.id,
                role: user.role,
                jobTitle: user.job_title,
                category: classification.category,
                categoryLabel: classification.label
            });
        });

        console.log('📊 Team breakdown:', {
            managers,
            developers,
            designers,
            qa,
            other,
            total: users.length
        });

        /* ---------------------------------------------------------
           RESPONSE
        --------------------------------------------------------- */
        return res.status(200).json({
            success: true,
            total: users.length,
            developers,
            designers,
            managers,
            qa,
            other,
            breakdown: userCategories, // Optional: detailed breakdown
        });

    } catch (error) {
        console.error("❌ Dashboard team overview error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to load dashboard team overview.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   DASHBOARD PROJECT STATS
========================================================= */

const getDashboardProjectStats = async (req, res) => {
    try {
        console.log('🔍 Fetching dashboard project stats');

        /* ---------------------------------------------------------
           GET PROJECT STATS
        --------------------------------------------------------- */
        const statsResult = await safeQuery(`
            SELECT 
                COUNT(*) as total_projects,
                COUNT(CASE WHEN status = 'Done' THEN 1 END) as completed_projects,
                COUNT(CASE WHEN status = 'In Progress' THEN 1 END) as in_progress_projects,
                COUNT(CASE WHEN status = 'Backlog' THEN 1 END) as backlog_projects,
                COUNT(CASE WHEN status = 'Unassigned' THEN 1 END) as unassigned_projects,
                COUNT(CASE WHEN status = 'Paused' THEN 1 END) as paused_projects,
                COALESCE(AVG(progress), 0) as avg_progress
            FROM projects
        `);

        /* ---------------------------------------------------------
           GET RECENT PROJECTS
        --------------------------------------------------------- */
        const recentProjectsResult = await safeQuery(`
            SELECT 
                p.id,
                p.name,
                p.status,
                p.priority,
                p.progress,
                p.created_at,
                u.full_name as created_by_name
            FROM projects p
            LEFT JOIN users u ON p.created_by = u.id
            ORDER BY p.created_at DESC
            LIMIT 10
        `);

        const stats = statsResult.rows[0];

        console.log('📊 Project stats:', stats);

        return res.status(200).json({
            success: true,
            stats: {
                total: parseInt(stats.total_projects) || 0,
                completed: parseInt(stats.completed_projects) || 0,
                inProgress: parseInt(stats.in_progress_projects) || 0,
                backlog: parseInt(stats.backlog_projects) || 0,
                unassigned: parseInt(stats.unassigned_projects) || 0,
                paused: parseInt(stats.paused_projects) || 0,
                averageProgress: Math.round(parseFloat(stats.avg_progress) || 0),
            },
            recentProjects: recentProjectsResult.rows || [],
        });

    } catch (error) {
        console.error("❌ Dashboard project stats error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to load dashboard project stats.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   DASHBOARD TASK STATS
========================================================= */

const getDashboardTaskStats = async (req, res) => {
    try {
        console.log('🔍 Fetching dashboard task stats');

        /* ---------------------------------------------------------
           GET TASK STATS
        --------------------------------------------------------- */
        const statsResult = await safeQuery(`
            SELECT 
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN status = 'Done' THEN 1 END) as completed_tasks,
                COUNT(CASE WHEN status = 'In Progress' THEN 1 END) as in_progress_tasks,
                COUNT(CASE WHEN status = 'To Do' THEN 1 END) as todo_tasks,
                COUNT(CASE WHEN status = 'Backlog' THEN 1 END) as backlog_tasks,
                COALESCE(AVG(
                    CASE 
                        WHEN due_date IS NOT NULL 
                        AND status != 'Done' 
                        AND due_date < CURRENT_DATE 
                        THEN 1 
                        ELSE 0 
                    END
                ) * 100, 0) as overdue_percentage
            FROM tasks
        `);

        /* ---------------------------------------------------------
           GET TASKS BY PRIORITY
        --------------------------------------------------------- */
        const priorityResult = await safeQuery(`
            SELECT 
                priority,
                COUNT(*) as count,
                COUNT(CASE WHEN status = 'Done' THEN 1 END) as completed
            FROM tasks
            WHERE priority IS NOT NULL
            GROUP BY priority
            ORDER BY 
                CASE priority
                    WHEN 'High' THEN 1
                    WHEN 'Medium' THEN 2
                    WHEN 'Low' THEN 3
                    ELSE 4
                END
        `);

        /* ---------------------------------------------------------
           GET RECENT TASKS
        --------------------------------------------------------- */
        const recentTasksResult = await safeQuery(`
            SELECT 
                t.id,
                t.name,
                t.status,
                t.priority,
                t.due_date,
                t.created_at,
                p.name as project_name,
                u.full_name as assignee_name
            FROM tasks t
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u ON t.assignee_id = u.id
            ORDER BY t.created_at DESC
            LIMIT 10
        `);

        const stats = statsResult.rows[0];

        console.log('📊 Task stats:', stats);

        return res.status(200).json({
            success: true,
            stats: {
                total: parseInt(stats.total_tasks) || 0,
                completed: parseInt(stats.completed_tasks) || 0,
                inProgress: parseInt(stats.in_progress_tasks) || 0,
                todo: parseInt(stats.todo_tasks) || 0,
                backlog: parseInt(stats.backlog_tasks) || 0,
                overduePercentage: Math.round(parseFloat(stats.overdue_percentage) || 0),
            },
            byPriority: priorityResult.rows || [],
            recentTasks: recentTasksResult.rows || [],
        });

    } catch (error) {
        console.error("❌ Dashboard task stats error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to load dashboard task stats.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

/* =========================================================
   COMPLETE DASHBOARD DATA
========================================================= */

const getCompleteDashboard = async (req, res) => {
    try {
        console.log('🔍 Fetching complete dashboard data');

        /* ---------------------------------------------------------
           FETCH ALL DASHBOARD DATA IN PARALLEL
        --------------------------------------------------------- */
        const [
            teamOverview,
            projectStats,
            taskStats
        ] = await Promise.all([
            // Get team overview
            safeQuery(`
                SELECT id, role, job_title, is_active
                FROM users
                WHERE is_active = TRUE
            `),
            
            // Get project stats
            safeQuery(`
                SELECT 
                    COUNT(*) as total_projects,
                    COUNT(CASE WHEN status = 'Done' THEN 1 END) as completed_projects,
                    COUNT(CASE WHEN status = 'In Progress' THEN 1 END) as in_progress_projects,
                    COALESCE(AVG(progress), 0) as avg_progress
                FROM projects
            `),
            
            // Get task stats
            safeQuery(`
                SELECT 
                    COUNT(*) as total_tasks,
                    COUNT(CASE WHEN status = 'Done' THEN 1 END) as completed_tasks,
                    COUNT(CASE WHEN status = 'In Progress' THEN 1 END) as in_progress_tasks,
                    COUNT(CASE WHEN status = 'To Do' THEN 1 END) as todo_tasks,
                    COUNT(CASE WHEN status = 'Backlog' THEN 1 END) as backlog_tasks
                FROM tasks
            `)
        ]);

        /* ---------------------------------------------------------
           PROCESS TEAM DATA
        --------------------------------------------------------- */
        let developers = 0, designers = 0, managers = 0, qa = 0, other = 0;

        teamOverview.rows.forEach((user) => {
            const classification = classifyUserRole(user);
            switch (classification.category) {
                case 'developer': developers++; break;
                case 'designer': designers++; break;
                case 'manager': managers++; break;
                case 'qa': qa++; break;
                default: other++; break;
            }
        });

        const projectStatsData = projectStats.rows[0];
        const taskStatsData = taskStats.rows[0];

        return res.status(200).json({
            success: true,
            team: {
                total: teamOverview.rows.length,
                developers,
                designers,
                managers,
                qa,
                other,
            },
            projects: {
                total: parseInt(projectStatsData.total_projects) || 0,
                completed: parseInt(projectStatsData.completed_projects) || 0,
                inProgress: parseInt(projectStatsData.in_progress_projects) || 0,
                averageProgress: Math.round(parseFloat(projectStatsData.avg_progress) || 0),
            },
            tasks: {
                total: parseInt(taskStatsData.total_tasks) || 0,
                completed: parseInt(taskStatsData.completed_tasks) || 0,
                inProgress: parseInt(taskStatsData.in_progress_tasks) || 0,
                todo: parseInt(taskStatsData.todo_tasks) || 0,
                backlog: parseInt(taskStatsData.backlog_tasks) || 0,
            },
        });

    } catch (error) {
        console.error("❌ Complete dashboard error:", error);
        console.error("Stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: "Failed to load dashboard data.",
            ...(process.env.NODE_ENV !== 'production' && { error: error.message })
        });
    }
};

module.exports = {
    getDashboardTeamOverview,
    getDashboardProjectStats,
    getDashboardTaskStats,
    getCompleteDashboard,
};

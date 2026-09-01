const pool = require("../config/db");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const PDFDocument = require("pdfkit");

const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
} = require("docx");

// =========================================================
// REPORT FILE UPLOAD
// =========================================================

const uploadDir = process.env.NODE_ENV === "production"
    ? path.join("/tmp", "reports")
    : path.join(__dirname, "../uploads/reports");

// Safely attempt folder creation
try {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
} catch (err) {
    console.warn("Could not create upload directory synchronously:", err.message);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Ensure directory exists right before saving the file
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);

        const safeName = path
            .basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9_-]/g, "_");

        cb(
            null,
            `${Date.now()}-${safeName}${ext}`
        );
    },
});

const reportUpload = multer({
    storage,

    limits: {
        fileSize: 10 * 1024 * 1024,
    },

    fileFilter: (req, file, cb) => {
        const allowed = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain",
            "text/csv",
        ];

        if (!allowed.includes(file.mimetype)) {
            return cb(
                new Error(
                    "Unsupported file type"
                )
            );
        }

        cb(null, true);
    },
});

// =========================================================
// GET LOGGED-IN USER
// =========================================================

async function getCurrentUser(userId) {
    const result = await pool.query(
        `
        SELECT
            id,
            full_name,
            email,
            role,
            is_active
        FROM users
        WHERE id = $1
        `,
        [userId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}

// =========================================================
// BUILD ROLE-BASED PROJECT ACCESS
//
// IMPORTANT:
// userParamNumber allows this function to work when
// $1 is already being used by projectId.
//
// Overview:
//   WHERE 1 = 1
//   AND p.project_manager_id = $1
//
// Single project / download:
//   WHERE p.id = $1
//   AND p.project_manager_id = $2
// =========================================================

function buildProjectAccess(
    role,
    userId,
    userParamNumber = 1
) {
    if (
        role === "Executive Manager" ||
        role === "System Administrator"
    ) {
        return {
            sql: "",
            params: [],
        };
    }

    if (role === "Project Manager") {
        return {
            sql: `
                AND p.project_manager_id = $${userParamNumber}
            `,
            params: [userId],
        };
    }

    if (role === "Member") {
        return {
            sql: `
                AND EXISTS (
                    SELECT 1
                    FROM tasks t_access
                    WHERE t_access.project_id = p.id
                    AND t_access.assignee_id = $${userParamNumber}
                )
            `,
            params: [userId],
        };
    }

    return {
        sql: `
            AND FALSE
        `,
        params: [],
    };
}

// =========================================================
// GET REPORT OVERVIEW
// GET /api/reports
// =========================================================

const getReportOverview = async (req, res) => {
    try {
        const user = await getCurrentUser(
            req.user.id
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found",
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message:
                    "Your account is inactive",
            });
        }

        // IMPORTANT:
        // Overview query does not use $1 for projectId.
        // Therefore user access parameter is $1.
        const access = buildProjectAccess(
            user.role,
            user.id,
            1
        );

        const result = await pool.query(
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
                p.project_manager_id,

                manager.full_name
                    AS project_manager_name,

                r.id AS report_id,
                r.title AS report_title,
                r.content AS report_content,
                r.format AS report_format,
                r.submitted_by
                    AS report_submitted_by,

                submitter.full_name
                    AS report_submitted_by_name,

                r.created_at
                    AS report_created_at,

                r.updated_at
                    AS report_updated_at,

                COUNT(DISTINCT t.id)
                    AS total_tasks,

                COUNT(
                    DISTINCT CASE
                        WHEN t.status = 'Done'
                        THEN t.id
                    END
                ) AS completed_tasks

            FROM projects p

            LEFT JOIN users manager
                ON manager.id =
                    p.project_manager_id

            LEFT JOIN project_reports r
                ON r.project_id = p.id

            LEFT JOIN users submitter
                ON submitter.id =
                    r.submitted_by

            LEFT JOIN tasks t
                ON t.project_id = p.id

            WHERE 1 = 1

            ${access.sql}

            GROUP BY
                p.id,
                manager.full_name,
                r.id,
                r.title,
                r.content,
                r.format,
                r.submitted_by,
                submitter.full_name,
                r.created_at,
                r.updated_at

            ORDER BY
                p.created_at DESC
            `,
            access.params
        );

        const projects = result.rows.map(
            (row) => ({
                id: row.id,
                name: row.name,
                domain: row.domain,

                aboutTitle:
                    row.about_title,

                aboutDescription:
                    row.about_description,

                status: row.status,
                priority: row.priority,

                startDate:
                    row.start_date,

                deadline:
                    row.deadline,

                progress: Number(
                    row.progress || 0
                ),

                projectManager: {
                    id:
                        row.project_manager_id,
                    name:
                        row.project_manager_name,
                },

                totalTasks: Number(
                    row.total_tasks || 0
                ),

                completedTasks: Number(
                    row.completed_tasks || 0
                ),

                report: row.report_id
                    ? {
                          id:
                              row.report_id,

                          title:
                              row.report_title,

                          content:
                              row.report_content,

                          format:
                              row.report_format,

                          submittedBy:
                              row.report_submitted_by,

                          submittedByName:
                              row.report_submitted_by_name,

                          createdAt:
                              row.report_created_at,

                          updatedAt:
                              row.report_updated_at,
                      }
                    : null,

                reportStatus:
                    row.report_id
                        ? "Done"
                        : "Pending",
            })
        );

        const completedReports =
            projects.filter(
                (project) =>
                    project.reportStatus ===
                    "Done"
            );

        const pendingReports =
            projects.filter(
                (project) =>
                    project.reportStatus ===
                    "Pending"
            );

        return res.json({
            success: true,

            user: {
                id: user.id,
                name: user.full_name,
                email: user.email,
                role: user.role,
            },

            permissions: {
                canCreateReport:
                    user.role ===
                    "Project Manager",

                canEditReport:
                    user.role ===
                    "Project Manager",

                canDeleteReport: false,

                canDownloadReport:
                    user.role ===
                        "Executive Manager" ||
                    user.role ===
                        "Project Manager" ||
                    user.role === "Member" ||
                    user.role ===
                        "System Administrator",
            },

            summary: {
                totalProjects:
                    projects.length,

                completedReports:
                    completedReports.length,

                pendingReports:
                    pendingReports.length,
            },

            completedReports,
            pendingReports,
            projects,
        });
    } catch (error) {
        console.error(
            "getReportOverview error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load reports",
        });
    }
};

// =========================================================
// GET SINGLE PROJECT REPORT
// GET /api/reports/project/:projectId
// =========================================================

const getProjectReport = async (
    req,
    res
) => {
    try {
        const { projectId } =
            req.params;

        const user =
            await getCurrentUser(
                req.user.id
            );

        if (!user) {
            return res.status(401).json({
                success: false,
                message:
                    "User not found",
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message:
                    "Your account is inactive",
            });
        }

        // IMPORTANT:
        // $1 = projectId
        // $2 = userId for PM/Member
        const access =
            buildProjectAccess(
                user.role,
                user.id,
                2
            );

        const result =
            await pool.query(
                `
                SELECT
                    p.id,
                    p.name,
                    p.domain,
                    p.status,
                    p.priority,
                    p.start_date,
                    p.deadline,
                    p.progress,
                    p.project_manager_id,

                    manager.full_name
                        AS project_manager_name,

                    r.id AS report_id,
                    r.title,
                    r.content,
                    r.format,
                    r.submitted_by,
                    r.created_at,
                    r.updated_at

                FROM projects p

                LEFT JOIN users manager
                    ON manager.id =
                        p.project_manager_id

                LEFT JOIN project_reports r
                    ON r.project_id = p.id

                WHERE p.id = $1

                ${access.sql}
                `,
                [
                    projectId,
                    ...access.params,
                ]
            );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Project not found or you do not have permission to view it",
            });
        }

        return res.json({
            success: true,
            project:
                result.rows[0],
        });
    } catch (error) {
        console.error(
            "getProjectReport error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load project report",
        });
    }
};

// =========================================================
// CREATE / UPDATE REPORT
// POST /api/reports/project/:projectId
//
// ONLY PROJECT MANAGER
// =========================================================

const createOrUpdateReport =
    async (req, res) => {
        try {
            const { projectId } =
                req.params;

            const {
                title,
                content,
                format,
            } = req.body;

            // ---------------------------------------------
            // Validate
            // ---------------------------------------------

            if (
                !title ||
                !title.trim()
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Report title is required",
                });
            }

            if (
                !content ||
                !content.trim()
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Report content is required",
                });
            }

            if (
                !["PDF", "Word"].includes(
                    format
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Report format must be PDF or Word",
                });
            }

            const user =
                await getCurrentUser(
                    req.user.id
                );

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message:
                        "User not found",
                });
            }

            if (!user.is_active) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Your account is inactive",
                });
            }

            // ---------------------------------------------
            // Only PM can submit
            // ---------------------------------------------

            if (
                user.role !==
                "Project Manager"
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Only Project Managers can create or update project reports",
                });
            }

            // ---------------------------------------------
            // Verify assigned project
            // ---------------------------------------------

            const projectResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        project_manager_id
                    FROM projects
                    WHERE id = $1
                    `,
                    [projectId]
                );

            if (
                projectResult.rows
                    .length === 0
            ) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Project not found",
                });
            }

            const project =
                projectResult.rows[0];

            if (
                project.project_manager_id !==
                user.id
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "You can only submit reports for projects assigned to you",
                });
            }

            // ---------------------------------------------
            // Upsert
            // ---------------------------------------------

            const result =
                await pool.query(
                    `
                    INSERT INTO project_reports (
                        project_id,
                        submitted_by,
                        title,
                        content,
                        format
                    )

                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5
                    )

                    ON CONFLICT (project_id)

                    DO UPDATE SET
                        submitted_by =
                            EXCLUDED.submitted_by,

                        title =
                            EXCLUDED.title,

                        content =
                            EXCLUDED.content,

                        format =
                            EXCLUDED.format,

                        updated_at =
                            NOW()

                    RETURNING *
                    `,
                    [
                        projectId,
                        user.id,
                        title.trim(),
                        content.trim(),
                        format,
                    ]
                );

            return res.status(200).json({
                success: true,
                message:
                    "Report saved successfully",

                report:
                    result.rows[0],
            });
        } catch (error) {
            console.error(
                "createOrUpdateReport error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to save report",
            });
        }
    };

// =========================================================
// UPLOAD PROJECT REPORT FILE
// POST /api/reports/project/:projectId/upload
//
// ONLY PROJECT MANAGER
// =========================================================

const uploadProjectReportFile =
    async (req, res) => {
        try {
            const { projectId } =
                req.params;

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Please select a file",
                });
            }

            const user =
                await getCurrentUser(
                    req.user.id
                );

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message:
                        "User not found",
                });
            }

            if (!user.is_active) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Your account is inactive",
                });
            }

            if (
                user.role !==
                "Project Manager"
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Only Project Managers can upload project report files",
                });
            }

            // ---------------------------------------------
            // Verify assigned project
            // ---------------------------------------------

            const projectResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        project_manager_id
                    FROM projects
                    WHERE id = $1
                    `,
                    [projectId]
                );

            if (
                projectResult.rows
                    .length === 0
            ) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Project not found",
                });
            }

            const project =
                projectResult.rows[0];

            if (
                project.project_manager_id !==
                user.id
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "You can only upload files for projects assigned to you",
                });
            }

            const fileUrl =
                `/uploads/reports/${req.file.filename}`;

            return res.status(200).json({
                success: true,

                message:
                    "File uploaded successfully",

                file: {
                    originalName:
                        req.file
                            .originalname,

                    fileName:
                        req.file.filename,

                    mimeType:
                        req.file.mimetype,

                    size:
                        req.file.size,

                    url: fileUrl,
                },
            });
        } catch (error) {
            console.error(
                "uploadProjectReportFile error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Failed to upload project file",
            });
        }
    };

// =========================================================
// DOWNLOAD REPORT
// GET /api/reports/project/:projectId/download/pdf
// GET /api/reports/project/:projectId/download/word
// =========================================================

const downloadReport = async (req, res) => {
    try {
        const {
            projectId,
            format,
        } = req.params;

        // =================================================
        // VALIDATE FORMAT
        // =================================================

        const requestedFormat =
            format === "pdf"
                ? "PDF"
                : format === "word"
                ? "Word"
                : null;

        if (!requestedFormat) {
            return res.status(400).json({
                success: false,
                message: "Invalid report format",
            });
        }

        // =================================================
        // GET CURRENT USER
        // =================================================

        const user = await getCurrentUser(
            req.user.id
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found",
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive",
            });
        }

        // =================================================
        // ROLE BASED PROJECT ACCESS
        //
        // $1 = projectId
        // $2 = userId for PM / Member
        // =================================================

        const access = buildProjectAccess(
            user.role,
            user.id,
            2
        );

        // =================================================
        // GET PROJECT + REPORT
        // =================================================

        const result = await pool.query(
            `
            SELECT
                p.id AS project_id,
                p.name AS project_name,
                p.status,
                p.priority,
                p.start_date,
                p.deadline,
                p.progress,

                manager.full_name
                    AS manager_name,

                r.title,
                r.content,
                r.format,
                r.created_at,
                r.updated_at

            FROM projects p

            INNER JOIN project_reports r
                ON r.project_id = p.id

            LEFT JOIN users manager
                ON manager.id =
                    p.project_manager_id

            WHERE p.id = $1

            ${access.sql}
            `,
            [
                projectId,
                ...access.params,
            ]
        );

        // =================================================
        // REPORT NOT FOUND
        // =================================================

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Report not found or you do not have permission to access it",
            });
        }

        const report = result.rows[0];

        // =================================================
        // CLEAN VALUES
        // =================================================

        const projectName =
            report.project_name ||
            "Project";

        const reportTitle =
            report.title ||
            "Project Report";

        const reportContent =
            report.content ||
            "No report content";

        const managerName =
            report.manager_name ||
            "Unassigned";

        const status =
            report.status ||
            "N/A";

        const priority =
            report.priority ||
            "N/A";

        const progress =
            report.progress || 0;

        const startDate =
            report.start_date ||
            "N/A";

        const deadline =
            report.deadline ||
            "N/A";

        // =================================================
        // SAFE FILE NAME
        // =================================================

        const safeProjectName =
            projectName
                .toString()
                .replace(
                    /[^a-zA-Z0-9_-]/g,
                    "_"
                )
                .toLowerCase();

        // =================================================
        // PDF DOWNLOAD
        // =================================================

        if (requestedFormat === "PDF") {

            /*
             * IMPORTANT FOR VERCEL
             *
             * Do NOT use:
             *
             * .font("Helvetica")
             * .font("Helvetica-Bold")
             *
             * PDFKit tries to load its internal
             * standard-font files and Vercel can fail
             * with:
             *
             * Cannot find module:
             * pdfkit/js/standard-fonts/Helvetica.cjs
             *
             * Therefore we use real TTF fonts bundled
             * inside the project.
             */

            const regularFont = path.join(
    __dirname,
    "../fonts/DejaVuSans.ttf"
);

const boldFont = path.join(
    __dirname,
    "../fonts/DejaVuSans-Bold.ttf"
);

            // ---------------------------------------------
            // CHECK FONT FILES
            // ---------------------------------------------

            if (!fs.existsSync(regularFont)) {
                console.error(
                    "PDF regular font not found:",
                    regularFont
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "PDF font file is missing on the server",
                });
            }

            if (!fs.existsSync(boldFont)) {
                console.error(
                    "PDF bold font not found:",
                    boldFont
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "PDF bold font file is missing on the server",
                });
            }

            // ---------------------------------------------
            // CREATE PDF
            // ---------------------------------------------

            const doc = new PDFDocument({
                margin: 50,
                size: "A4",
            });

            // ---------------------------------------------
            // REGISTER TTF FONTS
            // ---------------------------------------------

            doc.registerFont(
                "ReportRegular",
                regularFont
            );

            doc.registerFont(
                "ReportBold",
                boldFont
            );

            const filename =
                `${safeProjectName}_report.pdf`;

            // ---------------------------------------------
            // RESPONSE HEADERS
            // ---------------------------------------------

            res.setHeader(
                "Content-Type",
                "application/pdf"
            );

            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filename}"`
            );

            res.setHeader(
                "Cache-Control",
                "no-store"
            );

            // ---------------------------------------------
            // PIPE PDF TO RESPONSE
            // ---------------------------------------------

            doc.pipe(res);

            // ---------------------------------------------
            // TITLE
            // ---------------------------------------------

            doc
                .font("ReportBold")
                .fontSize(22)
                .text(
                    reportTitle,
                    {
                        align: "left",
                    }
                );

            doc.moveDown();

            // ---------------------------------------------
            // PROJECT INFORMATION
            // ---------------------------------------------

            doc
                .font("ReportRegular")
                .fontSize(11);

            doc.text(
                `Project: ${projectName}`
            );

            doc.text(
                `Project Manager: ${managerName}`
            );

            doc.text(
                `Status: ${status}`
            );

            doc.text(
                `Priority: ${priority}`
            );

            doc.text(
                `Progress: ${progress}%`
            );

            doc.text(
                `Start Date: ${startDate}`
            );

            doc.text(
                `Deadline: ${deadline}`
            );

            doc.moveDown();

            // ---------------------------------------------
            // REPORT HEADING
            // ---------------------------------------------

            doc
                .font("ReportBold")
                .fontSize(14)
                .text("Report");

            doc.moveDown();

            // ---------------------------------------------
            // REPORT CONTENT
            // ---------------------------------------------

            doc
                .font("ReportRegular")
                .fontSize(11)
                .text(
                    reportContent,
                    {
                        lineGap: 4,
                        width:
                            doc.page.width -
                            doc.page.margins.left -
                            doc.page.margins.right,
                        align: "left",
                    }
                );

            // ---------------------------------------------
            // FINISH PDF
            // ---------------------------------------------

            doc.end();

            return;
        }

        // =================================================
        // WORD DOWNLOAD
        // =================================================

        if (requestedFormat === "Word") {

            const children = [
                // -----------------------------------------
                // TITLE
                // -----------------------------------------

                new Paragraph({
                    text: reportTitle,
                    heading:
                        HeadingLevel.TITLE,
                }),

                // -----------------------------------------
                // PROJECT
                // -----------------------------------------

                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Project: ",
                            bold: true,
                        }),

                        new TextRun(
                            projectName
                        ),
                    ],
                }),

                // -----------------------------------------
                // PROJECT MANAGER
                // -----------------------------------------

                new Paragraph({
                    children: [
                        new TextRun({
                            text:
                                "Project Manager: ",
                            bold: true,
                        }),

                        new TextRun(
                            managerName
                        ),
                    ],
                }),

                // -----------------------------------------
                // STATUS
                // -----------------------------------------

                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Status: ",
                            bold: true,
                        }),

                        new TextRun(
                            status
                        ),
                    ],
                }),

                // -----------------------------------------
                // PRIORITY
                // -----------------------------------------

                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Priority: ",
                            bold: true,
                        }),

                        new TextRun(
                            priority
                        ),
                    ],
                }),

                // -----------------------------------------
                // PROGRESS
                // -----------------------------------------

                new Paragraph({
                    children: [
                        new TextRun({
                            text: "Progress: ",
                            bold: true,
                        }),

                        new TextRun(
                            `${progress}%`
                        ),
                    ],
                }),

                // -----------------------------------------
                // START DATE
                // -----------------------------------------

                new Paragraph({
                    children: [
                        new TextRun({
                            text:
                                "Start Date: ",
                            bold: true,
                        }),

                        new TextRun(
                            String(startDate)
                        ),
                    ],
                }),

                // -----------------------------------------
                // DEADLINE
                // -----------------------------------------

                new Paragraph({
                    children: [
                        new TextRun({
                            text:
                                "Deadline: ",
                            bold: true,
                        }),

                        new TextRun(
                            String(deadline)
                        ),
                    ],
                }),

                // -----------------------------------------
                // SPACING
                // -----------------------------------------

                new Paragraph({
                    text: "",
                }),

                // -----------------------------------------
                // REPORT HEADING
                // -----------------------------------------

                new Paragraph({
                    text: "Report",
                    heading:
                        HeadingLevel.HEADING_1,
                }),
            ];

            // ---------------------------------------------
            // REPORT CONTENT
            // ---------------------------------------------

            const contentLines =
                String(reportContent)
                    .split(/\r?\n/);

            contentLines.forEach(
                (line) => {
                    children.push(
                        new Paragraph({
                            children: [
                                new TextRun(
                                    line
                                ),
                            ],
                        })
                    );
                }
            );

            // ---------------------------------------------
            // CREATE WORD DOCUMENT
            // ---------------------------------------------

            const document =
                new Document({
                    sections: [
                        {
                            children,
                        },
                    ],
                });

            // ---------------------------------------------
            // CREATE BUFFER
            // ---------------------------------------------

            const buffer =
                await Packer.toBuffer(
                    document
                );

            const filename =
                `${safeProjectName}_report.docx`;

            // ---------------------------------------------
            // RESPONSE HEADERS
            // ---------------------------------------------

            res.setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            );

            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filename}"`
            );

            res.setHeader(
                "Content-Length",
                buffer.length
            );

            res.setHeader(
                "Cache-Control",
                "no-store"
            );

            return res.end(buffer);
        }

    } catch (error) {

        console.error(
            "downloadReport error:",
            error
        );

        // Don't send another response if the PDF
        // stream has already started.
        if (res.headersSent) {
            return res.end();
        }

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Failed to download report",
        });
    }
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
    getReportOverview,
    getProjectReport,
    createOrUpdateReport,
    downloadReport,
    uploadProjectReportFile,

    // Export this because your controller currently
    // contains the multer configuration.
    reportUpload,
};

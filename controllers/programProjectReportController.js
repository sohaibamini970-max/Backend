// controllers/programProjectReportController.js
const pool = require("../config/db");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
} = require("docx");

/* =========================================================
   HELPERS
========================================================= */

const safeQuery = async (text, params) => {
    const client = await pool.connect();
    try {
        return await client.query(text, params);
    } finally {
        client.release();
    }
};

const uploadDir =
    process.env.NODE_ENV === "production"
        ? path.join("/tmp", "program-reports")
        : path.join(__dirname, "../uploads/program-reports");

try {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
} catch (err) {
    console.warn("Could not create program report upload dir:", err.message);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const safe = path
            .basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9_-]/g, "_");
        cb(null, `${Date.now()}-${safe}${ext}`);
    },
});

const programReportUpload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error("Only PDF and Word files are allowed."));
        }
        cb(null, true);
    },
});

const extractReportContent = async (file) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (ext === ".pdf" || file.mimetype === "application/pdf") {
        const buffer = fs.readFileSync(file.path);
        const parsed = await pdfParse(buffer);
        return String(parsed.text || "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    if (
        ext === ".docx" ||
        file.mimetype ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
        const result = await mammoth.extractRawText({ path: file.path });
        return String(result.value || "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    if (ext === ".doc" || file.mimetype === "application/msword") {
        throw new Error(
            "Old .doc files are not supported. Save as .docx and try again."
        );
    }

    throw new Error("Only PDF and DOCX files can be used for report content.");
};

/* =========================================================
   AUTHORIZATION
========================================================= */

const getProgramProject = async (programProjectId) => {
    const r = await safeQuery(
        `SELECT pp.*, p.name AS program_name
         FROM program_projects pp
         LEFT JOIN programs p ON p.id = pp.program_id
         WHERE pp.id = $1`,
        [programProjectId]
    );
    return r.rows[0] || null;
};

const canSeeProgramProjectReports = async (user, programProject) => {
    if (!programProject) return false;

    if (user.role === "System Administrator" || user.role === "Executive Manager") {
        return true;
    }

    if (user.role === "Project Manager") {
        return String(programProject.assigned_to) === String(user.id);
    }

    if (user.role === "Member") {
        const mem = await safeQuery(
            `SELECT 1 FROM program_project_members
             WHERE program_project_id = $1 AND user_id = $2`,
            [programProject.id, user.id]
        );
        return mem.rows.length > 0;
    }

    return false;
};

/* =========================================================
   PROGRAM PROJECT REPORTS OVERVIEW
   GET /api/program-report-reports  (see routes below)
   Returns: pending program projects + those with reports
========================================================= */

const getProgramReportOverview = async (req, res) => {
    try {
        const user = req.user;

        // Managers only for now. Adjust if you want Members to see them too.
        if (
            ![
                "Project Manager",
                "Executive Manager",
                "System Administrator",
            ].includes(user.role)
        ) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to view program reports.",
            });
        }

        // Build role scoping for program projects
        let scopeSql = "";
        const params = [];

        if (user.role === "Project Manager") {
            params.push(user.id);
            scopeSql = `AND pp.assigned_to = $${params.length}`;
        }
        // Exec / SysAdmin see all

        const rows = await safeQuery(
            `
            SELECT
                pp.id,
                pp.name,
                pp.domain,
                pp.about_title,
                pp.about_description,
                pp.status,
                pp.priority,
                pp.start_date,
                pp.deadline,
                pp.assigned_to,
                p.name AS program_name,

                manager.full_name AS project_manager_name,

                r.id AS report_id,
                r.title AS report_title,
                r.content AS report_content,
                r.format AS report_format,
                r.submitted_by AS report_submitted_by,
                submitter.full_name AS report_submitted_by_name,
                r.created_at AS report_created_at,
                r.updated_at AS report_updated_at,

                (SELECT COUNT(*)::int FROM program_project_tasks
                 WHERE program_project_id = pp.id) AS total_tasks,
                (SELECT COUNT(*)::int FROM program_project_tasks
                 WHERE program_project_id = pp.id AND status = 'Done') AS completed_tasks

            FROM program_projects pp
            LEFT JOIN programs p ON p.id = pp.program_id
            LEFT JOIN users manager ON manager.id = pp.assigned_to
            LEFT JOIN program_project_reports r ON r.program_project_id = pp.id
            LEFT JOIN users submitter ON submitter.id = r.submitted_by
            WHERE 1=1
            ${scopeSql}
            ORDER BY pp.created_at DESC
            `,
            params
        );

        const programProjects = rows.rows.map((r) => {
            const total = Number(r.total_tasks || 0);
            const done = Number(r.completed_tasks || 0);
            const progress = total > 0 ? Math.round((done / total) * 100) : 0;

            return {
                id: r.id,
                name: r.name,
                domain: r.domain,
                aboutTitle: r.about_title,
                aboutDescription: r.about_description,
                status: r.status,
                priority: r.priority,
                startDate: r.start_date,
                deadline: r.deadline,
                programName: r.program_name || null,
                isProgramProject: true, // ✅ frontend uses this to color green
                projectManager: {
                    id: r.assigned_to,
                    name: r.project_manager_name || "Unassigned",
                },
                totalTasks: total,
                completedTasks: done,
                progress,
                report: r.report_id
                    ? {
                          id: r.report_id,
                          title: r.report_title,
                          content: r.report_content,
                          format: r.report_format,
                          submittedBy: r.report_submitted_by,
                          submittedByName: r.report_submitted_by_name,
                          createdAt: r.report_created_at,
                          updatedAt: r.report_updated_at,
                      }
                    : null,
                reportStatus: r.report_id ? "Done" : "Pending",
            };
        });

        return res.json({
            success: true,
            programProjects,
            count: programProjects.length,
        });
    } catch (error) {
        console.error("❌ getProgramReportOverview error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load program reports.",
        });
    }
};

/* =========================================================
   CREATE / UPDATE PROGRAM PROJECT REPORT
   POST /api/program-reports/program-project/:programProjectId
========================================================= */

const createOrUpdateProgramReport = async (req, res) => {
    try {
        const { programProjectId } = req.params;
        const { title, content, format } = req.body;
        const user = req.user;

        if (!title || !title.trim()) {
            return res.status(400).json({
                success: false,
                message: "Report title is required.",
            });
        }
        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: "Report content is required.",
            });
        }
        if (!["PDF", "Word"].includes(format)) {
            return res.status(400).json({
                success: false,
                message: "Format must be PDF or Word.",
            });
        }

        const pp = await getProgramProject(programProjectId);
        if (!pp) {
            return res.status(404).json({
                success: false,
                message: "Program project not found.",
            });
        }

        // Only the PM assigned to this program project, or Exec / SysAdmin
        const canWrite =
            user.role === "System Administrator" ||
            user.role === "Executive Manager" ||
            (user.role === "Project Manager" &&
                String(pp.assigned_to) === String(user.id));

        if (!canWrite) {
            return res.status(403).json({
                success: false,
                message:
                    "Only the assigned Project Manager can submit a report for this program project.",
            });
        }

        const result = await safeQuery(
            `
            INSERT INTO program_project_reports
                (program_project_id, submitted_by, title, content, format)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (program_project_id)
            DO UPDATE SET
                submitted_by = EXCLUDED.submitted_by,
                title        = EXCLUDED.title,
                content      = EXCLUDED.content,
                format       = EXCLUDED.format,
                updated_at   = NOW()
            RETURNING *
            `,
            [
                programProjectId,
                user.id,
                title.trim(),
                content.trim(),
                format,
            ]
        );

        return res.status(200).json({
            success: true,
            message: "Program report saved.",
            report: result.rows[0],
        });
    } catch (error) {
        console.error("❌ createOrUpdateProgramReport error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to save program report.",
        });
    }
};

/* =========================================================
   UPLOAD PROGRAM PROJECT REPORT FILE
   POST /api/program-reports/program-project/:programProjectId/upload
========================================================= */

const uploadProgramReportFile = async (req, res) => {
    try {
        const { programProjectId } = req.params;
        const user = req.user;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Please select a file.",
            });
        }

        const pp = await getProgramProject(programProjectId);
        if (!pp) {
            return res.status(404).json({
                success: false,
                message: "Program project not found.",
            });
        }

        const canWrite =
            user.role === "System Administrator" ||
            user.role === "Executive Manager" ||
            (user.role === "Project Manager" &&
                String(pp.assigned_to) === String(user.id));

        if (!canWrite) {
            return res.status(403).json({
                success: false,
                message:
                    "Only the assigned Project Manager can upload files for this program project.",
            });
        }

        let extracted = "";
        try {
            extracted = await extractReportContent(req.file);
        } catch (e) {
            return res.status(400).json({
                success: false,
                message: e.message || "Could not extract text from file.",
            });
        }

        if (!extracted || !extracted.trim()) {
            return res.status(400).json({
                success: false,
                message:
                    "The file was uploaded but no readable text was found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "File uploaded and text extracted.",
            file: {
                originalName: req.file.originalname,
                fileName: req.file.filename,
                mimeType: req.file.mimetype,
                size: req.file.size,
                url: `/uploads/program-reports/${req.file.filename}`,
            },
            content: extracted,
        });
    } catch (error) {
        console.error("❌ uploadProgramReportFile error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to upload file.",
        });
    }
};

/* =========================================================
   DOWNLOAD PROGRAM PROJECT REPORT
   GET /api/program-reports/program-project/:programProjectId/download/:format
========================================================= */

const downloadProgramReport = async (req, res) => {
    try {
        const { programProjectId, format } = req.params;
        const user = req.user;

        const requested =
            format === "pdf" ? "PDF" : format === "word" ? "Word" : null;

        if (!requested) {
            return res.status(400).json({
                success: false,
                message: "Invalid format. Use 'pdf' or 'word'.",
            });
        }

        const pp = await getProgramProject(programProjectId);
        if (!pp) {
            return res.status(404).json({
                success: false,
                message: "Program project not found.",
            });
        }

        const allowed = await canSeeProgramProjectReports(user, pp);
        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: "You don't have access to this program report.",
            });
        }

        const r = await safeQuery(
            `
            SELECT
                r.title,
                r.content,
                r.format,
                r.created_at,
                pp.name AS program_project_name,
                pp.status,
                pp.priority,
                pp.start_date,
                pp.deadline,
                p.name AS program_name,
                manager.full_name AS manager_name
            FROM program_project_reports r
            JOIN program_projects pp ON pp.id = r.program_project_id
            LEFT JOIN programs p ON p.id = pp.program_id
            LEFT JOIN users manager ON manager.id = pp.assigned_to
            WHERE r.program_project_id = $1
            `,
            [programProjectId]
        );

        if (r.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Program report not found.",
            });
        }

        const report = r.rows[0];
        const safeName = String(report.program_project_name || "program-project")
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .toLowerCase();

        if (requested === "PDF") {
            const regularFont = path.join(__dirname, "../fonts/DejaVuSans.ttf");
            const boldFont = path.join(__dirname, "../fonts/DejaVuSans-Bold.ttf");
            if (!fs.existsSync(regularFont) || !fs.existsSync(boldFont)) {
                return res.status(500).json({
                    success: false,
                    message: "PDF fonts are missing on the server.",
                });
            }

            const doc = new PDFDocument({ margin: 50, size: "A4" });
            doc.registerFont("Body", regularFont);
            doc.registerFont("Bold", boldFont);

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${safeName}_program_report.pdf"`
            );
            res.setHeader("Cache-Control", "no-store");

            doc.pipe(res);

            doc.font("Bold").fontSize(22).text(report.title || "Program Report");
            doc.moveDown();

            doc.font("Body").fontSize(11);
            if (report.program_name) {
                doc.text(`Program: ${report.program_name}`);
            }
            doc.text(`Program Project: ${report.program_project_name}`);
            doc.text(`Manager: ${report.manager_name || "Unassigned"}`);
            doc.text(`Status: ${report.status || "N/A"}`);
            doc.text(`Priority: ${report.priority || "N/A"}`);
            doc.text(`Start Date: ${report.start_date || "N/A"}`);
            doc.text(`Deadline: ${report.deadline || "N/A"}`);
            doc.moveDown();

            doc.font("Bold").fontSize(14).text("Report");
            doc.moveDown();

            doc.font("Body").fontSize(11).text(report.content || "", {
                lineGap: 4,
                width:
                    doc.page.width -
                    doc.page.margins.left -
                    doc.page.margins.right,
            });

            doc.end();
            return;
        }

        if (requested === "Word") {
            const children = [
                new Paragraph({
                    text: report.title || "Program Report",
                    heading: HeadingLevel.TITLE,
                }),
            ];

            if (report.program_name) {
                children.push(
                    new Paragraph({
                        children: [
                            new TextRun({ text: "Program: ", bold: true }),
                            new TextRun(report.program_name),
                        ],
                    })
                );
            }

            children.push(
                new Paragraph({
                    children: [
                        new TextRun({ text: "Program Project: ", bold: true }),
                        new TextRun(report.program_project_name || ""),
                    ],
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: "Manager: ", bold: true }),
                        new TextRun(report.manager_name || "Unassigned"),
                    ],
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: "Status: ", bold: true }),
                        new TextRun(report.status || "N/A"),
                    ],
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: "Priority: ", bold: true }),
                        new TextRun(report.priority || "N/A"),
                    ],
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: "Start Date: ", bold: true }),
                        new TextRun(String(report.start_date || "N/A")),
                    ],
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: "Deadline: ", bold: true }),
                        new TextRun(String(report.deadline || "N/A")),
                    ],
                }),
                new Paragraph({ text: "" }),
                new Paragraph({ text: "Report", heading: HeadingLevel.HEADING_1 })
            );

            String(report.content || "")
                .split(/\r?\n/)
                .forEach((line) => {
                    children.push(
                        new Paragraph({ children: [new TextRun(line)] })
                    );
                });

            const document = new Document({ sections: [{ children }] });
            const buffer = await Packer.toBuffer(document);

            res.setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            );
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${safeName}_program_report.docx"`
            );
            res.setHeader("Content-Length", buffer.length);
            res.setHeader("Cache-Control", "no-store");

            return res.end(buffer);
        }
    } catch (error) {
        console.error("❌ downloadProgramReport error:", error);
        if (res.headersSent) return res.end();
        return res.status(500).json({
            success: false,
            message: "Failed to download program report.",
        });
    }
};

module.exports = {
    getProgramReportOverview,
    createOrUpdateProgramReport,
    uploadProgramReportFile,
    downloadProgramReport,
    programReportUpload,
};

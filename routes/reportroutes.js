// routes/reportRoutes.js

const express = require("express");

const {
    reportUpload,
    getReportOverview,
    getProjectReport,
    createOrUpdateReport,
    downloadReport,
    uploadProjectReportFile,
} = require("../controllers/reportcontroller");

const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();

// =========================================================
// GET REPORT OVERVIEW
// GET /api/reports
// =========================================================

router.get(
    "/",
    authenticate,
    getReportOverview
);

// =========================================================
// GET SINGLE PROJECT REPORT
// GET /api/reports/project/:projectId
// =========================================================

router.get(
    "/project/:projectId",
    authenticate,
    getProjectReport
);

// =========================================================
// DOWNLOAD PROJECT REPORT
// GET /api/reports/project/:projectId/download/pdf
// GET /api/reports/project/:projectId/download/word
// =========================================================

router.get(
    "/project/:projectId/download/:format",
    authenticate,
    downloadReport
);

// =========================================================
// CREATE / UPDATE PROJECT REPORT
// POST /api/reports/project/:projectId
// =========================================================

router.post(
    "/project/:projectId",
    authenticate,
    createOrUpdateReport
);

// =========================================================
// UPLOAD PROJECT REPORT FILE
// POST /api/reports/project/:projectId/upload
// =========================================================

router.post(
    "/project/:projectId/upload",
    authenticate,
    reportUpload.single("file"),
    uploadProjectReportFile
);

module.exports = router;

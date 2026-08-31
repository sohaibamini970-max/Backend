const express = require("express");

const router = express.Router();

const {
    getReportOverview,
    getProjectReport,
    createOrUpdateReport,
    downloadReport,
    uploadProjectReportFile,
} = require("../controllers/reportcontroller");

const { authenticate } = require("../middleware/authMiddleware");

const reportUpload = require("../middleware/reportUpload");

// ---------------------------------------------------------
// GET REPORT OVERVIEW
// GET /api/reports
// ---------------------------------------------------------

router.get(
    "/",
    authenticate,
    getReportOverview
);

// ---------------------------------------------------------
// GET SINGLE PROJECT REPORT
// GET /api/reports/project/:projectId
// ---------------------------------------------------------

router.get(
    "/project/:projectId",
    authenticate,
    getProjectReport
);

// ---------------------------------------------------------
// CREATE / UPDATE PROJECT REPORT
// POST /api/reports/project/:projectId
// ---------------------------------------------------------

router.post(
    "/project/:projectId",
    authenticate,
    createOrUpdateReport
);

// ---------------------------------------------------------
// UPLOAD PROJECT REPORT FILE
// POST /api/reports/project/:projectId/upload
// ---------------------------------------------------------

router.post(
    "/project/:projectId/upload",
    authenticate,
    reportUpload.single("file"),
    uploadProjectReportFile
);

// ---------------------------------------------------------
// DOWNLOAD PROJECT REPORT
// GET /api/reports/project/:projectId/download/pdf
// GET /api/reports/project/:projectId/download/word
// ---------------------------------------------------------

router.get(
    "/project/:projectId/download/:format",
    authenticate,
    downloadReport
);

module.exports = router;



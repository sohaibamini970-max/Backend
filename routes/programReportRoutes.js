// routes/programReportRoutes.js

const express = require("express");

const {
    programReportUpload,
    getProgramReportOverview,
    createOrUpdateProgramReport,
    uploadProgramReportFile,
    downloadProgramReport,
} = require("../controllers/programProjectReportController");

const { authenticate } = require("../middleware/authMiddleware");

const router = express.Router();

/* =========================================================
   PROGRAM PROJECT REPORT ROUTES
   Mounted at: /api/program-reports
========================================================= */

// GET PROGRAM REPORT OVERVIEW
// GET /api/program-reports
router.get(
    "/",
    authenticate,
    getProgramReportOverview
);

// CREATE / UPDATE PROGRAM PROJECT REPORT
// POST /api/program-reports/program-project/:programProjectId
router.post(
    "/program-project/:programProjectId",
    authenticate,
    createOrUpdateProgramReport
);

// UPLOAD PROGRAM PROJECT REPORT FILE
// POST /api/program-reports/program-project/:programProjectId/upload
router.post(
    "/program-project/:programProjectId/upload",
    authenticate,
    programReportUpload.single("file"),
    uploadProgramReportFile
);

// DOWNLOAD PROGRAM PROJECT REPORT
// GET /api/program-reports/program-project/:programProjectId/download/pdf
// GET /api/program-reports/program-project/:programProjectId/download/word
router.get(
    "/program-project/:programProjectId/download/:format",
    authenticate,
    downloadProgramReport
);

module.exports = router;

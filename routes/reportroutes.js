// routes/reportRoutes.js
const express = require("express");
const { 
    reportUpload,  // ✅ From controller
    getReportOverview,
    getProjectReport,
    createOrUpdateReport,
    downloadReport,
    uploadProjectReportFile,
} = require("../controllers/reportcontroller");

const router = express.Router();

// GET routes
router.get("/", getReportOverview);
router.get("/project/:projectId", getProjectReport);
router.get("/project/:projectId/download/:format", downloadReport);

// POST routes
router.post("/project/:projectId", createOrUpdateReport);
router.post(
    "/project/:projectId/upload",
    reportUpload.single("file"),  // ✅ Using the one from controller
    uploadProjectReportFile
);

module.exports = router;

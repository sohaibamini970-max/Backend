// routes/performanceRoutes.js
const express = require("express");
const router = express.Router();

const {
    getMemberPerformance,
    getTeamPerformance,
    getPerformanceTrends,
    createPerformanceSnapshot,
    getTaskHistory,
    getAllMembersPerformance,
    getMembersList,
} = require("../controllers/performanceController");

// ... existing routes ...

const { authenticate } = require("../middleware/authMiddleware");

/* =========================================================
   PERFORMANCE ROUTES
========================================================= */

router.get("/all", authenticate, getAllMembersPerformance);
router.get("/members-list", authenticate, getMembersList);

// ... existing routes ...

router.get("/history", authenticate, getTaskHistory);

// Get performance for a specific member
router.get("/member/:userId", authenticate, getMemberPerformance);

// Get performance trends for a member
router.get("/member/:userId/trends", authenticate, getPerformanceTrends);

// Get team performance (leaderboard)
router.get("/team", authenticate, getTeamPerformance);

// Create performance snapshot (admin only)
router.post("/snapshot", authenticate, createPerformanceSnapshot);

module.exports = router;

// routes/performanceRoutes.js
const express = require("express");
const router = express.Router();
const {
    getMemberPerformance,
    getTeamPerformance,
    getPerformanceTrends,
    createPerformanceSnapshot
} = require("../controllers/performanceController");

const { authenticate } = require("../middleware/authMiddleware");

/* =========================================================
   PERFORMANCE ROUTES
========================================================= */

// Get performance for a specific member
router.get("/member/:userId", authenticate, getMemberPerformance);

// Get performance trends for a member
router.get("/member/:userId/trends", authenticate, getPerformanceTrends);

// Get team performance (leaderboard)
router.get("/team", authenticate, getTeamPerformance);

// Create performance snapshot (admin only)
router.post("/snapshot", authenticate, createPerformanceSnapshot);

module.exports = router;

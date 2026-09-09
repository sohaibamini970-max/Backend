const express = require("express");

const router = express.Router();

const {
  getDashboardTeamOverview,
  getOptimizedDashboard,
} = require("../controllers/dashboardcontroller");

// Change this import to your existing authentication middleware.
const {authenticate} = require("../middleware/authMiddleware");

/*
|--------------------------------------------------------------------------
| GET DASHBOARD TEAM OVERVIEW
|--------------------------------------------------------------------------
*/

router.get("/optimized", authenticate, getOptimizedDashboard);

router.get(
  "/team-overview",
  authenticate,
  getDashboardTeamOverview
);

module.exports = router;

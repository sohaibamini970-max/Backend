const express = require("express");

const router = express.Router();

const {
  getUsers,
  createUser,
  updateUserStatus,
} = require("../controllers/usercontroller");

const authenticate = require("../middleware/authMiddleware");
const requireSystemAdministrator = require("../middleware/adminMiddleware");

/*
  Change authMiddleware above to the name/path
  of your existing JWT authentication middleware.
*/

/* =========================================================
   ALL USER MANAGEMENT ROUTES
   SYSTEM ADMINISTRATOR ONLY
========================================================= */

router.get(
  "/",
  authenticate,
  requireSystemAdministrator,
  getUsers
);

router.post(
  "/",
  authenticate,
  requireSystemAdministrator,
  createUser
);

router.patch(
  "/:id/status",
  authenticate,
  requireSystemAdministrator,
  updateUserStatus
);

module.exports = router;

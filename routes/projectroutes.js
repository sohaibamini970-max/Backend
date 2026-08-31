const express = require("express");

const router = express.Router();

const {
    authenticate,
    requireRole
} = require("../middleware/authMiddleware");

const {
    getProjects,
    getProjectManagers,
    createProject,
    assignProject,
    unassignProject
} = require("../controllers/projectcontroller");

router.get(
    "/",
    authenticate,
    getProjects
);

router.get(
    "/managers",
    authenticate,
    getProjectManagers
);

router.post(
    "/",
    authenticate,
    requireRole("Executive Manager"),
    createProject
);

router.patch(
    "/:projectId/assign",
    authenticate,
    requireRole("Project Manager"),
    assignProject
);


/*
============================================================
UNASSIGN PROJECT
============================================================

ONLY PROJECT MANAGER
*/

router.patch(
    "/:projectId/unassign",
    authenticate,
    requireRole("Project Manager"),
    unassignProject
);


module.exports = router;



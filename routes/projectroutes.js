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
    updateProject,
    updateProjectDeadline,
    deleteProject,
    assignProject,
    unassignProject
} = require("../controllers/projectcontroller");


/*
============================================================
GET PROJECTS
============================================================
*/

router.get(
    "/",
    authenticate,
    getProjects
);


/*
============================================================
GET PROJECT MANAGERS
============================================================
*/

router.get(
    "/managers",
    authenticate,
    getProjectManagers
);


/*
============================================================
CREATE PROJECT
============================================================
ONLY EXECUTIVE MANAGER
*/

router.post(
    "/",
    authenticate,
    requireRole("Executive Manager"),
    createProject
);


/*
============================================================
UPDATE PROJECT
============================================================
ONLY EXECUTIVE MANAGER
*/

router.patch(
    "/:projectId",
    authenticate,
    requireRole("Executive Manager"),
    updateProject
);


/*
============================================================
UPDATE PROJECT DEADLINE
============================================================
ONLY EXECUTIVE MANAGER
*/

router.patch(
    "/:projectId/deadline",
    authenticate,
    requireRole("Executive Manager"),
    updateProjectDeadline
);


/*
============================================================
DELETE PROJECT
============================================================
ONLY EXECUTIVE MANAGER

This also deletes all project tasks.
*/

router.delete(
    "/:projectId",
    authenticate,
    requireRole("Executive Manager"),
    deleteProject
);


/*
============================================================
ASSIGN PROJECT
============================================================
ONLY PROJECT MANAGER
*/

router.patch(
    "/:projectId/assign",
    authenticate,
    requireRole("Executive Manager"),
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

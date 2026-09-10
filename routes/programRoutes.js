// routes/programRoutes.js
const express = require("express");
const router = express.Router();
const {
    getPrograms,
    getProgramById,
    createProgram,
    updateProgram,
    deleteProgram,
    createProgramProject,
    assignProgramProject,
    updateProgramProject,
    deleteProgramProject,
    getAssignableUsers,
} = require("../controllers/programsController");

const { authenticate } = require("../middleware/authMiddleware");

/* Assignable users — MUST come before :programId routes */
router.get("/assignable-users", authenticate, getAssignableUsers);

/* Programs */
router.get("/", authenticate, getPrograms);
router.post("/", authenticate, createProgram);
router.get("/:programId", authenticate, getProgramById);
router.patch("/:programId", authenticate, updateProgram);
router.delete("/:programId", authenticate, deleteProgram);

/* Program Projects */
router.post("/:programId/projects", authenticate, createProgramProject);
router.patch("/:programId/projects/:projectId", authenticate, updateProgramProject);
router.patch("/:programId/projects/:projectId/assign", authenticate, assignProgramProject);
router.delete("/:programId/projects/:projectId", authenticate, deleteProgramProject);

module.exports = router;

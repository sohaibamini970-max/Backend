// routes/programAIRoutes.js
const express = require("express");
const router = express.Router();

const { handleProgramAIAgent } = require("../controllers/aiProgramAgentController");
const { verifyToken } = require("../middleware/auth"); // adjust to your auth middleware

router.post("/program-agent", verifyToken, handleProgramAIAgent);

module.exports = router;

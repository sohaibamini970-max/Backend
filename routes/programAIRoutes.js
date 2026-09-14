// routes/programAIRoutes.js
const express = require("express");
const router = express.Router();

const { handleProgramAIAgent } = require("../controllers/aiProgramAgentController");
const { authenticate } = require("../middleware/authMiddleware"); 

router.post("/program-agent", authenticate, handleProgramAIAgent);

module.exports = router;

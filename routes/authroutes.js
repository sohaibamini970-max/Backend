const express = require("express");
const router = express.Router();
const { login,changePassword } = require("../controllers/authcontroller");
const {authenticate} = require ("../middleware/authMiddleware")

router.post("/login", login);
router.put("/change-password",authenticate,changePassword)

//  MUST EXPORT THE ROUTER DIRECTLY
module.exports = router;

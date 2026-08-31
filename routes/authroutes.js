const express = require("express");
const router = express.Router();
const { login } = require("../controllers/authcontroller");

router.post("/login", login);

//  MUST EXPORT THE ROUTER DIRECTLY
module.exports = router;
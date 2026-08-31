const express = require("express");

const router = express.Router();

const {
    getUsers,
    createUser,
} = require("../controllers/usercontroller");

/*
|--------------------------------------------------------------------------
| GET ALL USERS
|--------------------------------------------------------------------------
|
| GET /api/users
|
*/

router.get(
    "/",
    getUsers
);

/*
|--------------------------------------------------------------------------
| CREATE USER
|--------------------------------------------------------------------------
|
| POST /api/users
|
*/

router.post(
    "/",
    createUser
);

module.exports = router;



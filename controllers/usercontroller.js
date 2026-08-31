const pool = require("../config/db");
const bcrypt = require("bcryptjs");

/*
|--------------------------------------------------------------------------
| ALLOWED SYSTEM ROLES
|--------------------------------------------------------------------------
|
| role = permission/access level
| job_title = actual designation
|
*/

const ALLOWED_ROLES = [
    "Member",
    "Project Manager",
    "Executive Manager",
    "System Administrator",
];

/*
|--------------------------------------------------------------------------
| GET ALL USERS
|--------------------------------------------------------------------------
|
| GET /api/users
|
*/

const getUsers = async (req, res) => {
    try {
        const query = `
            SELECT
                id,
                full_name,
                email,
                role,
                job_title,
                is_active,
                last_login_at,
                created_at
            FROM users
            ORDER BY created_at DESC;
        `;

        const result = await pool.query(query);

        return res.status(200).json({
            success: true,
            count: result.rows.length,
            data: result.rows,
        });

    } catch (error) {
        console.error("Error fetching users:", error);

        return res.status(500).json({
            success: false,
            message: "Server error while fetching users.",
        });
    }
};


/*
|--------------------------------------------------------------------------
| CREATE USER
|--------------------------------------------------------------------------
|
| POST /api/users
|
| Example request:
|
| {
|     "full_name": "Peter Parker",
|     "email": "peter@arg.com",
|     "role": "Member",
|     "job_title": "Frontend Developer"
| }
|
*/

const createUser = async (req, res) => {

    try {

        /*
        |--------------------------------------------------------------------------
        | READ REQUEST BODY
        |--------------------------------------------------------------------------
        */

        const fullName =
            req.body.full_name ||
            req.body.fullName;

        const email =
            req.body.email;

        const role =
            "Member";

        const jobTitle =
            req.body.job_title ||
            req.body.jobTitle;


        /*
        |--------------------------------------------------------------------------
        | VALIDATE FULL NAME
        |--------------------------------------------------------------------------
        */

        if (!fullName || !fullName.trim()) {
            return res.status(400).json({
                success: false,
                message: "Full name is required.",
            });
        }


        /*
        |--------------------------------------------------------------------------
        | VALIDATE EMAIL
        |--------------------------------------------------------------------------
        */

        if (!email || !email.trim()) {
            return res.status(400).json({
                success: false,
                message: "Email is required.",
            });
        }


        /*
        |--------------------------------------------------------------------------
        | VALIDATE ROLE
        |--------------------------------------------------------------------------
        */

        if (!role || !role.trim()) {
            return res.status(400).json({
                success: false,
                message: "Role is required.",
            });
        }

        /*
        | Make sure role is an actual system role.
        |
        | IMPORTANT:
        | "Frontend Developer" should NOT be sent as role.
        | It should be sent as job_title.
        */

        if (!ALLOWED_ROLES.includes(role.trim())) {
            return res.status(400).json({
                success: false,
                message:
                    `Invalid role. Allowed roles are: ${ALLOWED_ROLES.join(", ")}.`,
            });
        }


        /*
        |--------------------------------------------------------------------------
        | VALIDATE JOB TITLE
        |--------------------------------------------------------------------------
        */

        if (!jobTitle || !jobTitle.trim()) {
            return res.status(400).json({
                success: false,
                message: "Job title is required.",
            });
        }


        /*
        |--------------------------------------------------------------------------
        | CHECK DUPLICATE EMAIL
        |--------------------------------------------------------------------------
        */

        const existingUser = await pool.query(
            `
            SELECT id
            FROM users
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
            `,
            [email.trim()]
        );

        if (existingUser.rowCount > 0) {
            return res.status(409).json({
                success: false,
                message: "A user with this email already exists.",
            });
        }


        /*
        |--------------------------------------------------------------------------
        | TEMPORARY PASSWORD
        |--------------------------------------------------------------------------
        |
        | The Teams form does not ask for a password.
        |
        | New users receive this temporary password:
        |
        | 12345678
        |
        */

        const temporaryPassword = "12345678";

        const passwordHash = await bcrypt.hash(
            temporaryPassword,
            10
        );


        /*
        |--------------------------------------------------------------------------
        | INSERT USER
        |--------------------------------------------------------------------------
        */

        const result = await pool.query(
            `
            INSERT INTO users (
                full_name,
                email,
                password_hash,
                role,
                job_title,
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, TRUE)
            RETURNING
                id,
                full_name,
                email,
                role,
                job_title,
                is_active,
                last_login_at,
                created_at
            `,
            [
                fullName.trim(),
                email.trim().toLowerCase(),
                passwordHash,
                role.trim(),
                jobTitle.trim(),
            ]
        );


        /*
        |--------------------------------------------------------------------------
        | RESPONSE
        |--------------------------------------------------------------------------
        */

        return res.status(201).json({
            success: true,
            message: "User created successfully.",
            user: result.rows[0],
            temporaryPassword,
        });

    } catch (error) {

        console.error(
            "Error creating user:",
            error
        );


        /*
        |--------------------------------------------------------------------------
        | POSTGRESQL DUPLICATE CONSTRAINT
        |--------------------------------------------------------------------------
        */

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "A user with this email already exists.",
            });
        }


        /*
        |--------------------------------------------------------------------------
        | POSTGRESQL ENUM ERROR
        |--------------------------------------------------------------------------
        */

        if (error.code === "22P02") {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid role value. Please use a valid system role.",
            });
        }


        /*
        |--------------------------------------------------------------------------
        | SERVER ERROR
        |--------------------------------------------------------------------------
        */

        return res.status(500).json({
            success: false,
            message: "Server error while creating user.",
        });
    }
};


/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
    getUsers,
    createUser,
};



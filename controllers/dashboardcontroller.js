const pool = require("../config/db");

/*
|--------------------------------------------------------------------------
| DASHBOARD TEAM OVERVIEW
|--------------------------------------------------------------------------
| Reads directly from users table.
| Classification uses BOTH:
|   - users.role
|   - users.job_title
|
| Manager classification has highest priority.
|--------------------------------------------------------------------------
*/

const getDashboardTeamOverview = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        role,
        job_title
      FROM users
      ORDER BY id
    `);

    const users = result.rows;

    let developers = 0;
    let designers = 0;
    let managers = 0;
    let qa = 0;
    let other = 0;

    users.forEach((user) => {
      const role = String(user.role || "")
        .toLowerCase()
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");

      const jobTitle = String(user.job_title || "")
        .toLowerCase()
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");

      /*
      |--------------------------------------------------------------------------
      | Combine both database fields
      |--------------------------------------------------------------------------
      */

      const combined = `${role} ${jobTitle}`;

      /*
      |--------------------------------------------------------------------------
      | 1. MANAGERS
      |--------------------------------------------------------------------------
      */

      const isManager =
        role === "project manager" ||
        role === "executive manager" ||
        role === "team manager" ||
        role === "engineering manager" ||
        role === "product manager" ||
        role === "program manager" ||
        role === "manager" ||
        role.includes("manager") ||
        jobTitle.includes("manager") ||
        jobTitle.includes("team lead") ||
        jobTitle.includes("technical lead") ||
        jobTitle.includes("project lead");

      if (isManager) {
        managers++;
        return;
      }

      /*
      |--------------------------------------------------------------------------
      | 2. DESIGNERS
      |--------------------------------------------------------------------------
      |
      | Frontend developers are intentionally counted as Designers
      | according to your requirement.
      |--------------------------------------------------------------------------
      */

      const isDesigner =
        combined.includes("frontend developer") ||
        combined.includes("front end developer") ||
        combined.includes("frontend engineer") ||
        combined.includes("front end engineer") ||
        combined.includes("ui developer") ||
        combined.includes("ux developer") ||
        combined.includes("ui/ux") ||
        combined.includes("ui ux") ||
        combined.includes("ui designer") ||
        combined.includes("ux designer") ||
        combined.includes("web designer") ||
        combined.includes("product designer") ||
        combined.includes("graphic designer") ||
        combined.includes("interaction designer") ||
        combined.includes("frontend");

      if (isDesigner) {
        designers++;
        return;
      }

      /*
      |--------------------------------------------------------------------------
      | 3. DEVELOPERS
      |--------------------------------------------------------------------------
      |
      | Full Stack
      | Backend
      | Java
      | Node
      | .NET
      | C#
      | PHP
      | Python
      | Software Engineer
      | Developer
      |--------------------------------------------------------------------------
      */

      const isDeveloper =
        combined.includes("full stack") ||
        combined.includes("fullstack") ||
        combined.includes("backend") ||
        combined.includes("back end") ||
        combined.includes("java") ||
        combined.includes("node") ||
        combined.includes("nodejs") ||
        combined.includes("node.js") ||
        combined.includes(".net") ||
        combined.includes("dotnet") ||
        combined.includes("c#") ||
        combined.includes("asp.net") ||
        combined.includes("php") ||
        combined.includes("python") ||
        combined.includes("django") ||
        combined.includes("flask") ||
        combined.includes("spring") ||
        combined.includes("software engineer") ||
        combined.includes("software developer") ||
        combined.includes("web developer") ||
        combined.includes("mobile developer") ||
        combined.includes("app developer") ||
        combined.includes("application developer") ||
        combined.includes("developer") ||
        combined.includes("engineer") ||
        role.includes("developer") ||
        jobTitle.includes("developer");

      if (isDeveloper) {
        developers++;
        return;
      }

      /*
      |--------------------------------------------------------------------------
      | 4. QA / TESTING
      |--------------------------------------------------------------------------
      */

      const isQA =
        combined.includes("qa") ||
        combined.includes("quality assurance") ||
        combined.includes("quality analyst") ||
        combined.includes("quality engineer") ||
        combined.includes("test engineer") ||
        combined.includes("software tester") ||
        combined.includes("tester") ||
        combined.includes("testing");

      if (isQA) {
        qa++;
        return;
      }

      /*
      |--------------------------------------------------------------------------
      | 5. OTHER
      |--------------------------------------------------------------------------
      */

      other++;
    });

    return res.status(200).json({
      success: true,
      total: users.length,
      developers,
      designers,
      managers,
      qa,
      other,
    });
  } catch (error) {
    console.error(
      "Dashboard team overview error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard team overview.",
    });
  }
};

module.exports = {
  getDashboardTeamOverview,
};

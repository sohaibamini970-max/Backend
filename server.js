const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/authroutes");
const userRoutes = require("./routes/userroutes");
const projectRoutes = require("./routes/projectroutes");
const tasksRoutes = require("./routes/taskroutes");
const teamRoutes = require("./routes/teamroutes");
const reportRoutes = require("./routes/reportroutes");
const challengeRoutes = require("./routes/challengeroutes");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Serve uploads statically (Works locally, restricted on Vercel)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Health-check / Root Route
app.get("/", (req, res) => {
  res.status(200).json({ message: "ARG People Intelligence API is running live!" });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/reports", reportRoutes);
app.use(
  "/api/challenges",
  challengeRoutes
);
// Export app for Vercel serverless environment
module.exports = app;

// Only spin up HTTP server locally
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running locally on port ${PORT}`);
  });
}

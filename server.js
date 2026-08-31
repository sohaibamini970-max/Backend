const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/authroutes");
const userRoutes = require("./routes/userroutes");
const projectRoutes = require("./routes/projectroutes");
const tasksRoutes = require ("./routes/taskroutes");
const teamRoutes = require ("./routes/teamroutes");
const reportRoutes = require ("./routes/reportroutes");

const app = express();
const path = require("path");

app.use(
    "/uploads",
    express.static(
        path.join(__dirname, "uploads")
    )
);
// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects",projectRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/teams',teamRoutes);
app.use('/api/reports',reportRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
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
const taskAttachmentRoutes = require("./routes/taskattachmentroutes");
const dashboardRoutes = require("./routes/dashboardroutes");
const taskSubmissionRoutes = require('./routes/tasksubmissionroutes');
const aiAgentRoutes = require('./routes/aiAgentRoutes');
const performanceRoutes = require("./routes/performanceRoutes");



const app = express();

// ============================================================
// ✅ IMPROVED CORS CONFIGURATION
// ============================================================

// Allow all origins (for development and Vercel)
const allowedOrigins = [
    "https://frontend-flame-psi-krqyinvisb.vercel.app",
    "http://localhost:3000"
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests without an origin (Postman, server-to-server, etc.)
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept"
    ],
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
// Body parsers with increased limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploads statically (Works locally, restricted on Vercel)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ============================================================
// HEALTH-CHECK / ROOT ROUTE
// ============================================================

app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        status: "healthy",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "ARG People Intelligence API is running live!",
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// API ROUTES
// ============================================================

app.use('/api/ai', aiAgentRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/challenges", challengeRoutes);
app.use("/api", taskAttachmentRoutes);
app.use('/api', taskSubmissionRoutes);
app.use("/api/performance", performanceRoutes);
// Add near your other route mounts
app.use("/api/programs", require("./routes/programRoutes"));

// ============================================================
// 404 HANDLER
// ============================================================

app.use((req, res) => {
    console.log(`❌ Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`
    });
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// Export app for Vercel serverless environment
module.exports = app;

// Only spin up HTTP server locally
if (process.env.NODE_ENV !== "production") {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running locally on port ${PORT}`);
        console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔗 API: http://localhost:${PORT}/api`);
        console.log(`🤖 AI Chatbot: http://localhost:${PORT}/api/ai/chat`);
    });
}

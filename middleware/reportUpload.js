const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Create upload folder automatically
const uploadDir = path.join(__dirname, "..", "uploads", "reports");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);

        const safeName = path
            .basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9-_]/g, "_");

        cb(
            null,
            `${Date.now()}-${safeName}${ext}`
        );
    },
});

const fileFilter = (req, file, cb) => {
    const allowed = [
        ".pdf",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".csv",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
    ];

    const ext = path
        .extname(file.originalname)
        .toLowerCase();

    if (allowed.includes(ext)) {
        cb(null, true);
    } else {
        cb(
            new Error(
                "Unsupported file type. Allowed: PDF, Word, Excel, CSV, JPG, PNG, WEBP"
            )
        );
    }
};

const reportUpload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
    },
});

module.exports = reportUpload;
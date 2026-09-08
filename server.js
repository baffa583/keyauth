const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize or load database
function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        const defaultDb = {
            settings: {
                appName: "Tolunay Auth",
                adminUser: "Tolunay",
                adminPass: "tolunay123",
                secretKey: "tolunay_secret_" + crypto.randomBytes(6).toString('hex'),
                enabled: true
            },
            keys: [
                {
                    id: "key_1",
                    key: "TOLUNAY-VIP-DEMO-2026",
                    durationDays: 30,
                    hwid: null,
                    ip: null,
                    status: "unused", // unused, used, banned
                    createdAt: new Date().toISOString(),
                    usedAt: null,
                    expiresAt: null,
                    note: "Demo VIP Key"
                },
                {
                    id: "key_2",
                    key: "TOLUNAY-LIFETIME-ACCESS",
                    durationDays: 9999,
                    hwid: null,
                    ip: null,
                    status: "unused",
                    createdAt: new Date().toISOString(),
                    usedAt: null,
                    expiresAt: null,
                    note: "Lifetime Access"
                }
            ],
            logs: []
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2));
        return defaultDb;
    }
    try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error("DB Load Error:", e);
        return { settings: {}, keys: [], logs: [] };
    }
}

function saveDatabase(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// -------------------------------------------------------------
// CLIENT API (Called by Hydra Menu in Among Us)
// -------------------------------------------------------------

// Ping / Init
app.get('/api/v1/init', (req, res) => {
    const db = loadDatabase();
    res.json({
        success: true,
        message: "Tolunay Auth Server Initialized",
        app: db.settings.appName,
        version: "1.0.0",
        enabled: db.settings.enabled
    });
});

// Verify License
// Can be called via POST { key, hwid } or GET ?key=...&hwid=...
app.all('/api/v1/verify', (req, res) => {
    const key = (req.body.key || req.query.key || "").trim();
    const hwid = (req.body.hwid || req.query.hwid || "").trim();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "127.0.0.1";

    if (!key) {
        return res.status(400).json({ success: false, message: "License key is required." });
    }

    const db = loadDatabase();

    if (!db.settings.enabled) {
        return res.status(403).json({ success: false, message: "Authentication service is temporarily paused by admin." });
    }

    const license = db.keys.find(k => k.key.toUpperCase() === key.toUpperCase());

    if (!license) {
        return res.status(404).json({ success: false, message: "Invalid license key. Access denied." });
    }

    if (license.status === "banned") {
        return res.status(403).json({ success: false, message: "This license key has been banned by Tolunay." });
    }

    const now = new Date();

    // Check if key was previously used
    if (license.status === "used") {
        // Verify HWID
        if (hwid && license.hwid && license.hwid !== hwid) {
            return res.status(403).json({
                success: false,
                message: "HWID mismatch! Key is locked to another machine. Contact Tolunay to reset."
            });
        }

        // Check expiration
        if (license.expiresAt) {
            const expDate = new Date(license.expiresAt);
            if (now > expDate) {
                return res.status(403).json({
                    success: false,
                    message: "License expired on " + expDate.toLocaleDateString()
                });
            }
        }
    } else {
        // First time activation! Bind HWID and calculate expiry
        license.status = "used";
        license.hwid = hwid || "HWID-DEFAULT-" + crypto.randomBytes(4).toString('hex');
        license.usedAt = now.toISOString();

        if (license.durationDays && license.durationDays < 9000) {
            const exp = new Date();
            exp.setDate(exp.getDate() + license.durationDays);
            license.expiresAt = exp.toISOString();
        } else {
            license.expiresAt = "Lifetime";
        }
    }

    license.ip = ip;

    // Log the successful login
    db.logs.unshift({
        id: "log_" + Date.now(),
        key: license.key,
        hwid: license.hwid,
        ip: ip,
        time: now.toISOString(),
        note: license.note || ""
    });
    if (db.logs.length > 500) db.logs = db.logs.slice(0, 500);

    saveDatabase(db);

    const daysLeft = license.expiresAt === "Lifetime" ? "Lifetime" : 
        Math.max(0, Math.ceil((new Date(license.expiresAt) - now) / (1000 * 60 * 60 * 24)));

    res.json({
        success: true,
        message: "License valid! Welcome, user.",
        key: license.key,
        hwid: license.hwid,
        expires: license.expiresAt,
        daysLeft: daysLeft,
        admin: "Tolunay"
    });
});

// -------------------------------------------------------------
// ADMIN PANEL API (Web Dashboard)
// -------------------------------------------------------------

// Admin Auth Middleware
function checkAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const db = loadDatabase();
    if (authHeader === db.settings.adminPass || req.query.token === db.settings.adminPass) {
        return next();
    }
    return res.status(401).json({ success: false, message: "Unauthorized. Please login." });
}

// Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const db = loadDatabase();
    if (username === db.settings.adminUser && password === db.settings.adminPass) {
        return res.json({ success: true, token: db.settings.adminPass, user: db.settings.adminUser });
    }
    return res.status(401).json({ success: false, message: "Invalid Tolunay admin credentials." });
});

// Get Dashboard Stats
app.get('/api/admin/stats', checkAdmin, (req, res) => {
    const db = loadDatabase();
    const totalKeys = db.keys.length;
    const usedKeys = db.keys.filter(k => k.status === 'used').length;
    const unusedKeys = db.keys.filter(k => k.status === 'unused').length;
    const bannedKeys = db.keys.filter(k => k.status === 'banned').length;
    const totalLogs = db.logs.length;

    res.json({
        success: true,
        stats: {
            totalKeys,
            usedKeys,
            unusedKeys,
            bannedKeys,
            totalLogs,
            appName: db.settings.appName,
            adminUser: db.settings.adminUser
        },
        recentLogs: db.logs.slice(0, 10)
    });
});

// List Keys
app.get('/api/admin/keys', checkAdmin, (req, res) => {
    const db = loadDatabase();
    res.json({ success: true, keys: db.keys });
});

// Generate Keys
app.post('/api/admin/keys/generate', checkAdmin, (req, res) => {
    const { count = 1, duration = 30, prefix = "TOLUNAY", note = "" } = req.body;
    const db = loadDatabase();
    const generated = [];

    for (let i = 0; i < Math.min(count, 100); i++) {
        const seg1 = crypto.randomBytes(2).toString('hex').toUpperCase();
        const seg2 = crypto.randomBytes(2).toString('hex').toUpperCase();
        const seg3 = crypto.randomBytes(2).toString('hex').toUpperCase();
        const keyStr = `${prefix}-${seg1}-${seg2}-${seg3}`;

        const newKey = {
            id: "key_" + Date.now() + "_" + i,
            key: keyStr,
            durationDays: parseInt(duration),
            hwid: null,
            ip: null,
            status: "unused",
            createdAt: new Date().toISOString(),
            usedAt: null,
            expiresAt: null,
            note: note || `Created by Tolunay (${duration === 9999 ? 'Lifetime' : duration + ' days'})`
        };

        db.keys.unshift(newKey);
        generated.push(newKey);
    }

    saveDatabase(db);
    res.json({ success: true, count: generated.length, keys: generated });
});

// Delete Key
app.post('/api/admin/keys/delete', checkAdmin, (req, res) => {
    const { id } = req.body;
    const db = loadDatabase();
    db.keys = db.keys.filter(k => k.id !== id && k.key !== id);
    saveDatabase(db);
    res.json({ success: true, message: "Key deleted." });
});

// Reset HWID
app.post('/api/admin/keys/reset_hwid', checkAdmin, (req, res) => {
    const { id } = req.body;
    const db = loadDatabase();
    const key = db.keys.find(k => k.id === id || k.key === id);
    if (key) {
        key.hwid = null;
        saveDatabase(db);
        return res.json({ success: true, message: "HWID reset successfully." });
    }
    res.status(404).json({ success: false, message: "Key not found." });
});

// Toggle Ban
app.post('/api/admin/keys/toggle_ban', checkAdmin, (req, res) => {
    const { id } = req.body;
    const db = loadDatabase();
    const key = db.keys.find(k => k.id === id || k.key === id);
    if (key) {
        key.status = key.status === "banned" ? "used" : "banned";
        saveDatabase(db);
        return res.json({ success: true, status: key.status, message: `Key status set to ${key.status}.` });
    }
    res.status(404).json({ success: false, message: "Key not found." });
});

// Get Logs / Users
app.get('/api/admin/logs', checkAdmin, (req, res) => {
    const db = loadDatabase();
    res.json({ success: true, logs: db.logs });
});

// Serve frontend SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(` Tolunay KeyAuth Server is running!`);
    console.log(` Local URL: http://localhost:${PORT}`);
    console.log(` Admin Username: Tolunay`);
    console.log(` Admin Password: tolunay123`);
    console.log(`=========================================`);
});

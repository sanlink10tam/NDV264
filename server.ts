
import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import cors from "cors";
import admin from "firebase-admin";

// Initialize Firebase Admin
let db: admin.firestore.Firestore | null = null;
let firebaseStatus = {
  connected: false,
  error: null as string | null,
  checked: false
};

function initFirebase() {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
    let privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

    if (!projectId || !clientEmail || !privateKey) {
      const missing = [];
      if (!projectId) missing.push("FIREBASE_PROJECT_ID");
      if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
      if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");
      firebaseStatus.error = `THIẾU BIẾN: ${missing.join(", ")}. Hãy kiểm tra lại tab Environment Variables trên Vercel.`;
      firebaseStatus.connected = false;
      firebaseStatus.checked = true;
      return null;
    }

    if (admin.apps.length > 0) {
      db = admin.firestore();
      return db;
    }

    // Xử lý Private Key cực kỳ cẩn thận
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.substring(1, privateKey.length - 1);
    }
    
    // Thay thế các ký tự xuống dòng bị lỗi
    privateKey = privateKey.replace(/\\n/g, '\n');
    
    // Kiểm tra định dạng RSA
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}`;
    }
    if (!privateKey.includes('-----END PRIVATE KEY-----')) {
      privateKey = `${privateKey}\n-----END PRIVATE KEY-----`;
    }

    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      db = admin.firestore();
      firebaseStatus.error = null;
      return db;
    } catch (initErr: any) {
      firebaseStatus.error = `LỖI CHỨNG CHỈ: ${initErr.message}. Có thể Private Key hoặc Client Email bị sai.`;
      firebaseStatus.connected = false;
      return null;
    }
  } catch (error: any) {
    firebaseStatus.connected = false;
    firebaseStatus.error = `LỖI HỆ THỐNG: ${error.message}`;
    return null;
  }
}

// Initial attempt
initFirebase();

const DATA_FILE = path.join(process.cwd(), "data.json");

// Local fallback functions
function readLocalData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { users: [], loans: [], notifications: [], budget: 30000000, rankProfit: 0 };
    }
    const data = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return { users: [], loans: [], notifications: [], budget: 30000000, rankProfit: 0 };
  }
}

function writeLocalData(data: any) {
  try {
    if (process.env.NODE_ENV !== "production") {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    }
  } catch (e) {
    // Silent fail for production read-only fs
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get("/health", (req, res) => {
  res.send("OK");
});

// Firebase Status & Connection Test
app.get("/api/firebase-status", async (req, res) => {
  try {
    const database = initFirebase();
    if (database) {
      try {
        // Thử đọc một document bất kỳ để xác nhận quyền truy cập
        await database.collection('system').doc('config').get();
        firebaseStatus.connected = true;
        firebaseStatus.error = null;
      } catch (e: any) {
        firebaseStatus.connected = false;
        // Phân tích lỗi Firestore
        if (e.message.includes('PERMISSION_DENIED')) {
          firebaseStatus.error = "LỖI QUYỀN TRUY CẬP: Service Account không có quyền đọc Firestore. Hãy kiểm tra vai trò 'Cloud Datastore User' hoặc 'Editor' trong IAM.";
        } else if (e.message.includes('NOT_FOUND')) {
          firebaseStatus.error = "LỖI DATABASE: Không tìm thấy Database. Hãy đảm bảo bạn đã nhấn 'Create Database' trong Firebase Console.";
        } else {
          firebaseStatus.error = `LỖI KẾT NỐI: ${e.message}`;
        }
      }
    }
    res.json({
      connected: firebaseStatus.connected,
      error: firebaseStatus.error
    });
  } catch (globalErr: any) {
    res.json({
      connected: false,
      error: `LỖI CRITICAL: ${globalErr.message}`
    });
  }
});

// API Routes
app.get("/api/data", async (req, res) => {
  try {
    const database = initFirebase();
    if (database) {
      const usersSnap = await database.collection("users").get();
      const loansSnap = await database.collection("loans").get();
      const notifsSnap = await database.collection("notifications").orderBy("id", "desc").limit(200).get();
      const systemSnap = await database.collection("system").doc("config").get();
      
      const users = usersSnap.docs.map(doc => doc.data());
      const loans = loansSnap.docs.map(doc => doc.data());
      const notifications = notifsSnap.docs.map(doc => doc.data());
      const systemData = systemSnap.exists ? systemSnap.data() : { budget: 30000000, rankProfit: 0 };

      res.json({
        users,
        loans,
        notifications,
        budget: systemData?.budget ?? 30000000,
        rankProfit: systemData?.rankProfit ?? 0
      });
    } else {
      res.json(readLocalData());
    }
  } catch (e: any) {
    console.error("Lỗi trong /api/data:", e);
    firebaseStatus.connected = false;
    firebaseStatus.error = `Runtime Error: ${e.message}`;
    res.status(500).json({ error: "Internal Server Error", details: e.message });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const incomingUsers = req.body;
    const database = initFirebase();
    if (database) {
      const batch = database.batch();
      incomingUsers.forEach((u: any) => {
        const ref = database.collection("users").doc(u.id);
        batch.set(ref, u, { merge: true });
      });
      await batch.commit();
      res.json({ success: true });
    } else {
      const data = readLocalData();
      data.users = incomingUsers;
      writeLocalData(data);
      res.json({ success: true });
    }
  } catch (e: any) {
    console.error("Error saving users:", e);
    res.status(500).json({ error: "Failed to save users", details: e.message });
  }
});

app.post("/api/loans", async (req, res) => {
  try {
    const incomingLoans = req.body;
    const database = initFirebase();
    if (database) {
      const batch = database.batch();
      incomingLoans.forEach((l: any) => {
        const ref = database.collection("loans").doc(l.id);
        batch.set(ref, l, { merge: true });
      });
      await batch.commit();
      res.json({ success: true });
    } else {
      const data = readLocalData();
      data.loans = incomingLoans;
      writeLocalData(data);
      res.json({ success: true });
    }
  } catch (e: any) {
    console.error("Error saving loans:", e);
    res.status(500).json({ error: "Failed to save loans", details: e.message });
  }
});

app.post("/api/notifications", async (req, res) => {
  try {
    const incomingNotifs = req.body;
    const database = initFirebase();
    if (database) {
      const batch = database.batch();
      incomingNotifs.forEach((n: any) => {
        const ref = database.collection("notifications").doc(n.id);
        batch.set(ref, n, { merge: true });
      });
      await batch.commit();
      res.json({ success: true });
    } else {
      const data = readLocalData();
      data.notifications = incomingNotifs;
      writeLocalData(data);
      res.json({ success: true });
    }
  } catch (e: any) {
    console.error("Error saving notifications:", e);
    res.status(500).json({ error: "Failed to save notifications", details: e.message });
  }
});

app.post("/api/budget", async (req, res) => {
  try {
    const { budget } = req.body;
    const database = initFirebase();
    if (database) {
      await database.collection("system").doc("config").set({ budget }, { merge: true });
      res.json({ success: true });
    } else {
      const data = readLocalData();
      data.budget = budget;
      writeLocalData(data);
      res.json({ success: true });
    }
  } catch (e: any) {
    console.error("Error saving budget:", e);
    res.status(500).json({ error: "Failed to save budget", details: e.message });
  }
});

app.post("/api/rankProfit", async (req, res) => {
  try {
    const { rankProfit } = req.body;
    const database = initFirebase();
    if (database) {
      await database.collection("system").doc("config").set({ rankProfit }, { merge: true });
      res.json({ success: true });
    } else {
      const data = readLocalData();
      data.rankProfit = rankProfit;
      writeLocalData(data);
      res.json({ success: true });
    }
  } catch (e: any) {
    console.error("Error saving rankProfit:", e);
    res.status(500).json({ error: "Failed to save rankProfit", details: e.message });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const database = initFirebase();
    if (database) {
      await database.collection("users").doc(userId).delete();
      
      // Delete associated loans and notifications
      const loansSnap = await database.collection("loans").where("userId", "==", userId).get();
      const notifsSnap = await database.collection("notifications").where("userId", "==", userId).get();
      
      const batch = database.batch();
      loansSnap.docs.forEach(doc => batch.delete(doc.ref));
      notifsSnap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      
      res.json({ success: true });
    } else {
      const data = readLocalData();
      data.users = data.users.filter((u: any) => u.id !== userId);
      data.loans = data.loans.filter((l: any) => l.userId !== userId);
      data.notifications = data.notifications.filter((n: any) => n.userId !== userId);
      writeLocalData(data);
      res.json({ success: true });
    }
  } catch (e: any) {
    console.error("Error deleting user:", e);
    res.status(500).json({ error: "Failed to delete user", details: e.message });
  }
});

async function startServer() {
  const PORT = 3000;
  console.log(`Starting server in ${process.env.NODE_ENV || 'development'} mode`);

  // Vite middleware for development
  const distPath = path.join(process.cwd(), "dist");
  const useVite = process.env.NODE_ENV !== "production" || !fs.existsSync(distPath);

  if (useVite) {
    console.log("Using Vite middleware");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static files from dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  startServer();
}

export default app;


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
  error: null as string | null
};

try {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    }
    db = admin.firestore();
    // Test connection
    db.collection('health').doc('check').set({ lastCheck: new Date().toISOString() })
      .then(() => {
        firebaseStatus.connected = true;
        firebaseStatus.error = null;
        console.log("Firebase Admin initialized and verified successfully");
      })
      .catch((err) => {
        firebaseStatus.connected = false;
        firebaseStatus.error = `Firestore Error: ${err.message}`;
        console.error("Firebase Firestore connection test failed:", err);
      });
  } else {
    const missing = [];
    if (!projectId) missing.push("FIREBASE_PROJECT_ID");
    if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
    if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");
    firebaseStatus.error = `Missing environment variables: ${missing.join(", ")}`;
    console.warn("Firebase credentials missing:", firebaseStatus.error);
  }
} catch (error: any) {
  firebaseStatus.connected = false;
  firebaseStatus.error = `Init Error: ${error.message}`;
  console.error("Error initializing Firebase Admin:", error);
}

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
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get("/health", (req, res) => {
  res.send("OK");
});

// Firebase Status
app.get("/api/firebase-status", (req, res) => {
  res.json(firebaseStatus);
});

// API Routes
app.get("/api/data", async (req, res) => {
  try {
    if (db) {
      const usersSnap = await db.collection("users").get();
      const loansSnap = await db.collection("loans").get();
      const notifsSnap = await db.collection("notifications").orderBy("id", "desc").limit(200).get();
      const systemSnap = await db.collection("system").doc("config").get();
      
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
  } catch (e) {
    console.error("Lỗi trong /api/data:", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const incomingUsers = req.body;
    if (db) {
      const batch = db.batch();
      incomingUsers.forEach((u: any) => {
        const ref = db!.collection("users").doc(u.id);
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
  } catch (e) {
    console.error("Error saving users:", e);
    res.status(500).json({ error: "Failed to save users" });
  }
});

app.post("/api/loans", async (req, res) => {
  try {
    const incomingLoans = req.body;
    if (db) {
      const batch = db.batch();
      incomingLoans.forEach((l: any) => {
        const ref = db!.collection("loans").doc(l.id);
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
  } catch (e) {
    console.error("Error saving loans:", e);
    res.status(500).json({ error: "Failed to save loans" });
  }
});

app.post("/api/notifications", async (req, res) => {
  try {
    const incomingNotifs = req.body;
    if (db) {
      const batch = db.batch();
      incomingNotifs.forEach((n: any) => {
        const ref = db!.collection("notifications").doc(n.id);
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
  } catch (e) {
    console.error("Error saving notifications:", e);
    res.status(500).json({ error: "Failed to save notifications" });
  }
});

app.post("/api/budget", async (req, res) => {
  try {
    const { budget } = req.body;
    if (db) {
      await db.collection("system").doc("config").set({ budget }, { merge: true });
      res.json({ success: true });
    } else {
      const data = readLocalData();
      data.budget = budget;
      writeLocalData(data);
      res.json({ success: true });
    }
  } catch (e) {
    console.error("Error saving budget:", e);
    res.status(500).json({ error: "Failed to save budget" });
  }
});

app.post("/api/rankProfit", async (req, res) => {
  try {
    const { rankProfit } = req.body;
    if (db) {
      await db.collection("system").doc("config").set({ rankProfit }, { merge: true });
      res.json({ success: true });
    } else {
      const data = readLocalData();
      data.rankProfit = rankProfit;
      writeLocalData(data);
      res.json({ success: true });
    }
  } catch (e) {
    console.error("Error saving rankProfit:", e);
    res.status(500).json({ error: "Failed to save rankProfit" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    if (db) {
      await db.collection("users").doc(userId).delete();
      
      // Delete associated loans and notifications
      const loansSnap = await db.collection("loans").where("userId", "==", userId).get();
      const notifsSnap = await db.collection("notifications").where("userId", "==", userId).get();
      
      const batch = db.batch();
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
  } catch (e) {
    console.error("Error deleting user:", e);
    res.status(500).json({ error: "Failed to delete user" });
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


import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_KEY?.trim();

let supabase: any = null;
let supabaseStatus = {
  connected: false,
  error: null as string | null
};

function initSupabase() {
  if (supabase && supabaseStatus.connected) return supabase;

  if (!supabaseUrl || !supabaseKey) {
    supabaseStatus.error = "THIẾU BIẾN: SUPABASE_URL hoặc SUPABASE_KEY. Hãy kiểm tra lại tab Environment Variables trên Vercel.";
    supabaseStatus.connected = false;
    return null;
  }

  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false
      }
    });
    supabaseStatus.connected = true;
    supabaseStatus.error = null;
    return supabase;
  } catch (error: any) {
    supabaseStatus.connected = false;
    supabaseStatus.error = `Lỗi khởi tạo Supabase: ${error.message}`;
    return null;
  }
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
  try {
    // Vercel filesystem is read-only in production
    if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error("Local write failed:", e);
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get("/health", (req, res) => {
  res.send("OK");
});

// Supabase Status & Connection Test
app.get("/api/firebase-status", async (req, res) => {
  try {
    const client = initSupabase();
    if (client && !supabaseStatus.error) {
      try {
        // Thử đọc một document bất kỳ để xác nhận quyền truy cập
        const { error } = await client.from('system_config').select('id').limit(1);
        if (error) throw error;
        supabaseStatus.connected = true;
        supabaseStatus.error = null;
      } catch (e: any) {
        supabaseStatus.connected = false;
        supabaseStatus.error = `Lỗi kết nối Supabase: ${e.message}. Hãy đảm bảo bạn đã chạy lệnh SQL tạo bảng.`;
      }
    }
    res.json(supabaseStatus);
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
    const client = initSupabase();
    if (client && supabaseStatus.connected) {
      const [usersRes, loansRes, notifsRes, configRes] = await Promise.all([
        client.from('users').select('data'),
        client.from('loans').select('data'),
        client.from('notifications').select('data').order('id', { ascending: false }).limit(200),
        client.from('system_config').select('data').eq('id', 'config').single()
      ]);
      
      const users = usersRes.data?.map(d => d.data) || [];
      const loans = loansRes.data?.map(d => d.data) || [];
      const notifications = notifsRes.data?.map(d => d.data) || [];
      const systemData = configRes.data?.data || { budget: 30000000, rankProfit: 0 };

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
    res.status(500).json({ error: "Internal Server Error", details: e.message });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const incomingUsers = req.body;
    const client = initSupabase();
    if (client && supabaseStatus.connected) {
      const rows = incomingUsers.map((u: any) => ({ id: u.id, data: u }));
      const { error } = await client.from('users').upsert(rows);
      if (error) throw error;
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
    const client = initSupabase();
    if (client && supabaseStatus.connected) {
      const rows = incomingLoans.map((l: any) => ({ id: l.id, data: l }));
      const { error } = await client.from('loans').upsert(rows);
      if (error) throw error;
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
    const client = initSupabase();
    if (client && supabaseStatus.connected) {
      const rows = incomingNotifs.map((n: any) => ({ id: n.id, data: n }));
      const { error } = await client.from('notifications').upsert(rows);
      if (error) throw error;
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
    const client = initSupabase();
    if (client && supabaseStatus.connected) {
      const { data: current } = await client.from('system_config').select('data').eq('id', 'config').single();
      const newData = { ...(current?.data || {}), budget };
      const { error } = await client.from('system_config').upsert({ id: 'config', data: newData });
      if (error) throw error;
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
    const client = initSupabase();
    if (client && supabaseStatus.connected) {
      const { data: current } = await client.from('system_config').select('data').eq('id', 'config').single();
      const newData = { ...(current?.data || {}), rankProfit };
      const { error } = await client.from('system_config').upsert({ id: 'config', data: newData });
      if (error) throw error;
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
    const client = initSupabase();
    if (client && supabaseStatus.connected) {
      // Delete user and their related data
      await Promise.all([
        client.from('users').delete().eq('id', userId),
        client.from('loans').delete().filter('data->>userId', 'eq', userId),
        client.from('notifications').delete().filter('data->>userId', 'eq', userId)
      ]);
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
  
  const distPath = path.join(process.cwd(), "dist");
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  const useVite = !isProd || !fs.existsSync(distPath);

  if (useVite) {
    console.log("Using Vite middleware (Development)");
    // Dynamic import to avoid crash in production
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static files from dist (Production)");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Only start the standalone server if not on Vercel
if (!process.env.VERCEL) {
  startServer();
}

export default app;

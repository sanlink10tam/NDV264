
/**
 * HƯỚNG DẪN TẠO BẢNG TRÊN SUPABASE (SQL EDITOR):
 * 
 * -- 1. Bảng cấu hình hệ thống
 * CREATE TABLE system_config (
 *   id TEXT PRIMARY KEY,
 *   data JSONB NOT NULL
 * );
 * INSERT INTO system_config (id, data) VALUES ('config', '{"budget": 30000000, "rankProfit": 0}');
 * 
 * -- 2. Bảng người dùng
 * CREATE TABLE users (
 *   id TEXT PRIMARY KEY,
 *   data JSONB NOT NULL
 * );
 * 
 * -- 3. Bảng khoản vay
 * CREATE TABLE loans (
 *   id TEXT PRIMARY KEY,
 *   data JSONB NOT NULL
 * );
 * 
 * -- 4. Bảng thông báo
 * CREATE TABLE notifications (
 *   id TEXT PRIMARY KEY,
 *   data JSONB NOT NULL
 * );
 */

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
    const missing = [];
    if (!supabaseUrl) missing.push("SUPABASE_URL");
    if (!supabaseKey) missing.push("SUPABASE_KEY");
    supabaseStatus.error = `THIẾU BIẾN: ${missing.join(", ")}. Hãy kiểm tra lại tab Environment Variables trên Vercel.`;
    supabaseStatus.connected = false;
    console.error(supabaseStatus.error);
    return null;
  }

  try {
    // Log partial info for debugging (safe)
    console.log(`Khởi tạo Supabase với URL: ${supabaseUrl.substring(0, 15)}...`);
    
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
    console.error(supabaseStatus.error);
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
app.get("/api/supabase-status", async (req, res) => {
  try {
    const client = initSupabase();
    const tableStatus: Record<string, boolean> = {
      system_config: false,
      users: false,
      loans: false,
      notifications: false
    };

    if (client) {
      try {
        // Kiểm tra từng bảng một cách chi tiết
        const checks = await Promise.all([
          client.from('system_config').select('id').limit(1),
          client.from('users').select('id').limit(1),
          client.from('loans').select('id').limit(1),
          client.from('notifications').select('id').limit(1)
        ]);

        tableStatus.system_config = !checks[0].error;
        tableStatus.users = !checks[1].error;
        tableStatus.loans = !checks[2].error;
        tableStatus.notifications = !checks[3].error;

        const allTablesOk = Object.values(tableStatus).every(v => v);
        
        if (!allTablesOk) {
          const missing = Object.entries(tableStatus).filter(([_, ok]) => !ok).map(([name]) => name);
          supabaseStatus.connected = true; // Kết nối được nhưng thiếu bảng
          supabaseStatus.error = `Thiếu các bảng: ${missing.join(", ")}. Hãy chạy lệnh SQL bên dưới.`;
        } else {
          supabaseStatus.connected = true;
          supabaseStatus.error = null;
        }
      } catch (e: any) {
        supabaseStatus.connected = false;
        supabaseStatus.error = `Lỗi truy vấn: ${e.message}`;
      }
    }
    res.json({ ...supabaseStatus, tables: tableStatus });
  } catch (globalErr: any) {
    console.error("Critical Supabase Error:", globalErr);
    res.json({
      connected: false,
      error: `LỖI CRITICAL: ${globalErr.message}`,
      tables: {}
    });
  }
});

app.post("/api/supabase-init", async (req, res) => {
  try {
    const client = initSupabase();
    if (!client || !supabaseStatus.connected) {
      return res.status(400).json({ error: "Chưa kết nối được Supabase" });
    }

    // Khởi tạo cấu hình mặc định nếu chưa có
    const { data: existing } = await client.from('system_config').select('id').eq('id', 'config').single();
    if (!existing) {
      await client.from('system_config').upsert({ id: 'config', data: { budget: 30000000, rankProfit: 0 } });
    }

    res.json({ success: true, message: "Đã khởi tạo dữ liệu cấu hình mặc định" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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

app.post("/api/reset", async (req, res) => {
  try {
    const client = initSupabase();
    if (client && supabaseStatus.connected) {
      await Promise.all([
        client.from('users').delete().neq('id', 'AD01'), // Keep admin if exists
        client.from('loans').delete().neq('id', '0'),
        client.from('notifications').delete().neq('id', '0'),
        client.from('system_config').upsert({ id: 'config', data: { budget: 30000000, rankProfit: 0 } })
      ]);
      res.json({ success: true });
    } else {
      const data = { users: [], loans: [], notifications: [], budget: 30000000, rankProfit: 0 };
      writeLocalData(data);
      res.json({ success: true });
    }
  } catch (e: any) {
    console.error("Error resetting system:", e);
    res.status(500).json({ error: "Failed to reset system", details: e.message });
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
  
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  
  // On Vercel, we only care about the API routes. 
  // Static files are served by Vercel's edge network via vercel.json config.
  if (process.env.VERCEL) {
    console.log("Running as Vercel Serverless Function");
    return;
  }

  const distPath = path.join(process.cwd(), "dist");
  const useVite = !isProd || !fs.existsSync(distPath);

  if (useVite) {
    console.log("Using Vite middleware (Development)");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static files from dist (Local Production)");
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

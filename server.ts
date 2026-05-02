import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const db = new Database("zivanta.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL,
    condition TEXT NOT NULL,
    description TEXT,
    size TEXT,
    image_url TEXT,
    status TEXT DEFAULT 'pending',
    seller_name TEXT DEFAULT 'Anonymous',
    seller_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration: Add missing columns if they don't exist
const columns = db.prepare("PRAGMA table_info(listings)").all();
const columnNames = (columns as any[]).map(c => c.name);

if (!columnNames.includes('sale_price')) {
  db.exec("ALTER TABLE listings ADD COLUMN sale_price INTEGER");
}
if (!columnNames.includes('is_sold_out')) {
  db.exec("ALTER TABLE listings ADD COLUMN is_sold_out BOOLEAN DEFAULT 0");
}
if (!columnNames.includes('size_type')) {
  db.exec("ALTER TABLE listings ADD COLUMN size_type TEXT");
}

// Seed sample listing
const seedListing = () => {
  const existing = db.prepare("SELECT id FROM listings WHERE name = ?").get("Weekday Astro Loose Baggy Jeans");
  if (!existing) {
    const id = "weekday-astro-jeans";
    db.prepare(`
      INSERT INTO listings (id, name, brand, price, sale_price, is_sold_out, category, condition, description, size, size_type, image_url, status, seller_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, 
      "Weekday Astro Loose Baggy Jeans", 
      "Weekday", 
      3500, 
      2900, 
      1, 
      "Bottoms", 
      "Great", 
      "Stonewashed wash, subtle fade throughout. Loose fit with baggy leg and extended length. Crafted from organic rigid denim with recycled cotton. Zip fly with button closure. Five-pocket design with oversized back pockets. Made in India.", 
      "34x30 (Actual)", 
      "Pants",
      "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=1000",
      "approved",
      "Zivanta Official"
    );
  }
};
seedListing();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Public API: Get approved listings
  app.get("/api/products", (req, res) => {
    const category = req.query.category;
    let query = "SELECT * FROM listings WHERE status = 'approved'";
    const params = [];

    if (category) {
      query += " AND category = ?";
      params.push(category);
    }

    query += " ORDER BY created_at DESC";
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  });

  // Public API: Get single product
  app.get("/api/products/:id", (req, res) => {
    const row = db.prepare("SELECT * FROM listings WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });

  // Public API: Create a listing (Pending by default)
  app.post("/api/products", (req, res) => {
    const { name, brand, price, sale_price, category, condition, description, size, size_type, image_url, seller_email } = req.body;
    const id = Math.random().toString(36).substring(2, 11);
    
    try {
      db.prepare(`
        INSERT INTO listings (id, name, brand, price, sale_price, category, condition, description, size, size_type, image_url, seller_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, brand, price, sale_price || null, category, condition, description, size, size_type || 'Other', image_url || 'https://picsum.photos/seed/fashion/800/1200', seller_email);
      
      res.status(201).json({ id, message: "Listing submitted for approval" });
    } catch (error) {
      res.status(500).json({ error: "Failed to create listing" });
    }
  });

  // Admin API: Get all listings for management
  app.get("/api/admin/products", (req, res) => {
    const rows = db.prepare("SELECT * FROM listings ORDER BY created_at DESC").all();
    res.json(rows);
  });

  // Admin API: Update listing status
  app.patch("/api/admin/products/:id", (req, res) => {
    const { status } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    try {
      db.prepare("UPDATE listings SET status = ? WHERE id = ?").run(status, req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Update failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.resolve(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.resolve(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

# Zivanta Marketplace Setup Instructions

To get Zivanta fully working, you need to set up a Supabase project.

## 1. Supabase Project Setup

1. Create a new project at [supabase.com](https://supabase.com).
2. Go to **Project Settings > API** and copy your `Project URL` and `anon public` key.
3. Add these to your environment variables in AI Studio:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## 2. Database Schema

Run the following SQL in the Supabase SQL Editor:

```sql
-- Create the listings table
CREATE TABLE listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  brand TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  sale_price DECIMAL(10, 2),
  category TEXT NOT NULL,
  size_type TEXT NOT NULL,
  size TEXT NOT NULL,
  condition TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  seller_email TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Allow anyone to read approved listings
CREATE POLICY "Allow public read approved" ON listings
  FOR SELECT USING (status = 'approved');

-- Allow anyone to read their own pending listings (simplified for demo)
-- In a real app, you'd use auth.uid()
CREATE POLICY "Allow public read all" ON listings
  FOR SELECT USING (true);

-- Allow anyone to insert a listing
CREATE POLICY "Allow public insert" ON listings
  FOR INSERT WITH CHECK (true);

-- Allow updates (for admin moderation)
-- In a real app, restrict this to admin users
CREATE POLICY "Allow public update" ON listings
  FOR UPDATE USING (true);
```

## 3. Storage Setup

1. Go to **Storage** in your Supabase dashboard.
2. Create a new bucket named `listing-images`.
3. Set the bucket to **Public**.
4. Add a policy to allow public uploads and reads:
   - Select "New Policy" -> "For full customization".
   - Allowed operations: `SELECT`, `INSERT`.
   - Policy: `true` (for public access).

## 4. Local Development

The app is built with Vite + React. 
- `npm run dev` to start the development server.
- `npm run build` to build for production.

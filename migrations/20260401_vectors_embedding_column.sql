-- Enable pgvector extension (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to vectors table
-- text-embedding-004 produces 768-dimensional vectors
ALTER TABLE vectors ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Index for fast ANN search (cosine similarity)
CREATE INDEX IF NOT EXISTS idx_vectors_embedding
  ON vectors
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
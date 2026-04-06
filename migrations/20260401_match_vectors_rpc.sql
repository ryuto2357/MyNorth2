-- Semantic similarity search via pgvector cosine distance
-- Returns chunks for a specific user ordered by similarity, above a threshold
CREATE OR REPLACE FUNCTION match_vectors(
  query_embedding vector(768),
  match_user_id   uuid,
  match_threshold float DEFAULT 0.7,
  match_count     int   DEFAULT 5
)
RETURNS TABLE (
  id       uuid,
  content  text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    content,
    metadata,
    1 - (embedding <=> query_embedding) AS similarity
  FROM vectors
  WHERE
    user_id = match_user_id
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) >= match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
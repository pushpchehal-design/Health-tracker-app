-- Ayurveda RAG: enable pgvector and create table for chunk embeddings.
-- Run once in Supabase SQL Editor. Requires pgvector extension (enable in Dashboard → Database → Extensions if needed).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ayurveda_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  embedding vector(768) NOT NULL,
  source text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ayurveda_chunks_embedding_idx
  ON ayurveda_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

COMMENT ON TABLE ayurveda_chunks IS 'RAG chunks from Ayurveda PDFs for similarity search. Embeddings from Google gemini-embedding-001 (768 dims via outputDimensionality).';

-- RPC for similarity search (cosine distance). Call from Edge Function: supabase.rpc('match_ayurveda_chunks', { query_embedding: [...], match_count: 8 })
CREATE OR REPLACE FUNCTION match_ayurveda_chunks(query_embedding vector(768), match_count int DEFAULT 8)
RETURNS TABLE (id uuid, content text, source text, similarity float)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT ayurveda_chunks.id, ayurveda_chunks.content, ayurveda_chunks.source,
         1 - (ayurveda_chunks.embedding <=> query_embedding) AS similarity
  FROM ayurveda_chunks
  ORDER BY ayurveda_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

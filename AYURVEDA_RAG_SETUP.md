# Ayurveda remedies from your PDFs

The "What to do & remedies" section can include **Ayurveda and home remedies from PDFs you upload** to the app’s knowledge base. To get that working:

## 1. Create the knowledge base folder

In the project root (same level as `package.json`), create a folder named exactly:

```text
ayurvedaknowledgebase
```

Put your Ayurveda/remedy PDFs inside it (e.g. books or articles on cholesterol, herbs, diet, etc.).

## 2. Run the ingestion script

From the project root, with your `.env` containing at least:

- `VITE_SUPABASE_URL` (or `SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (or `VITE_SUPABASE_ANON_KEY` if RLS allows)
- `GEMINI_API_KEY` (used for embeddings)

run:

```bash
npm run ingest:ayurveda
```

This will:

- Read every PDF in `ayurvedaknowledgebase/`
- Extract text, split it into chunks, and compute embeddings (Gemini)
- Insert chunks into the Supabase table `ayurveda_chunks`

## 3. Ensure the database is set up

If you haven’t already, run the Ayurveda RAG SQL in the Supabase SQL Editor so the table and search function exist:

- File: `supabase-ayurveda-rag-setup.sql`  
- Enables `vector` extension, creates `ayurveda_chunks`, and the `match_ayurveda_chunks` function.

## 4. Regenerate recommendations

After ingestion, use **Generate Ayurveda analysis** again for a report. The Edge Function will:

- Search `ayurveda_chunks` for passages relevant to the lab findings (e.g. high cholesterol, anemia)
- Pass those passages to the AI so the **What to do & remedies** section includes **Ayurveda remedies** drawn from your PDFs.

## Troubleshooting

- **No remedies in the output**  
  - Check Edge Function logs for: `RAG ayurveda chunks returned: 0`.  
  - If 0: run step 1–2 (folder + `npm run ingest:ayurveda`) and ensure the script finishes without errors.  
  - In Supabase → Table Editor → `ayurveda_chunks`, confirm there are rows after ingestion.

- **“No PDF files in ayurvedaknowledgebase/”**  
  - Create the folder in the project root and add at least one `.pdf` file, then run `npm run ingest:ayurveda` again.

// Edge Function: Generate Ayurveda recommendations for an existing report (RAG + Gemini).
// POST body: { reportId: string, userId: string }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  }

  try {
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY is not set. Add it in Edge Function secrets.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    const body = await req.json().catch(() => ({}))
    const reportId = body.reportId ?? body.report_id
    const userId = body.userId ?? body.user_id

    if (!reportId || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing reportId or userId in request body.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: report, error: reportErr } = await supabase
      .from('health_reports')
      .select('id, user_id, family_member_id')
      .eq('id', reportId)
      .single()

    if (reportErr || !report) {
      return new Response(
        JSON.stringify({ error: 'Report not found.' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }
    if ((report as any).user_id !== userId) {
      return new Response(
        JSON.stringify({ error: 'Report does not belong to this user.' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    const familyMemberId = (report as any).family_member_id ?? null

    const { data: analysisRows, error: analysisErr } = await supabase
      .from('health_analysis')
      .select('category, findings, summary')
      .eq('report_id', reportId)

    if (analysisErr) {
      return new Response(
        JSON.stringify({ error: 'Failed to load report analysis.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    const abnormals: string[] = []
    const allReadings: string[] = [] // Full context so AI has something even if no abnormals
    for (const row of analysisRows || []) {
      if (row.category === 'Recommendations') continue
      const params = (row.findings as any)?.parameters || []
      for (const p of params) {
        allReadings.push(`${row.category} – ${p.name}: ${p.value} (ref: ${p.normal_range ?? 'N/A'}, ${p.status})`)
        if (p.status === 'abnormal') {
          abnormals.push(`${p.name}: ${p.value} (ref: ${p.normal_range ?? 'N/A'})`)
        }
      }
      // If no parameters (e.g. simplified format), use summary as readings
      if (params.length === 0 && (row as any).summary) {
        allReadings.push(`${row.category}: ${(row as any).summary}`)
      }
    }

    let profileContext = ''
    const { data: profile } = await supabase.from('user_profiles').select('pre_existing_conditions, family_history, allergies').eq('id', userId).single()
    if (profile) {
      const c = (profile as any).pre_existing_conditions
      if (Array.isArray(c) && c.length) profileContext += `Pre-existing: ${c.join(', ')}. `
      if ((profile as any).family_history) profileContext += `Family history: ${(profile as any).family_history}. `
      if ((profile as any).allergies?.length) profileContext += `Allergies: ${(profile as any).allergies.join(', ')}. `
    }
    if (familyMemberId) {
      const { data: member } = await supabase.from('family_members').select('name, pre_existing_conditions, medical_history, family_history, allergies').eq('id', familyMemberId).single()
      if (member) {
        profileContext += `Patient: ${(member as any).name || 'Member'}. `
        const c = (member as any).pre_existing_conditions
        if (Array.isArray(c) && c.length) profileContext += `Conditions: ${c.join(', ')}. `
        if ((member as any).medical_history) profileContext += `Medical history: ${(member as any).medical_history}. `
        if ((member as any).family_history) profileContext += `Family history: ${(member as any).family_history}. `
        if ((member as any).allergies?.length) profileContext += `Allergies: ${(member as any).allergies.join(', ')}. `
      }
    }

    const queryForEmbed = `Abnormal lab: ${abnormals.join('; ')}. ${profileContext}`.trim().slice(0, 8000)
    const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text: queryForEmbed }] }, outputDimensionality: 768 })
    })
    if (!embedRes.ok) {
      const errText = await embedRes.text()
      console.error('Embed error:', errText)
      return new Response(
        JSON.stringify({ error: 'Failed to get embedding for recommendations.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }
    const embedData = await embedRes.json()
    const queryEmbedding = embedData?.embedding?.values as number[] | undefined
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 768) {
      return new Response(
        JSON.stringify({ error: 'Invalid embedding response.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    const { data: chunks, error: rpcErr } = await supabase.rpc('match_ayurveda_chunks', { query_embedding: queryEmbedding, match_count: 10 })
    const ragText = (rpcErr || !chunks?.length) ? '' : (chunks as { content: string }[]).map((c: { content: string }) => c.content).join('\n\n---\n\n')
    const ragChunkCount = Array.isArray(chunks) ? chunks.length : 0
    console.log('RAG ayurveda chunks returned:', ragChunkCount, 'total length:', ragText.length)
    if (ragChunkCount === 0) {
      console.log('No Ayurveda passages in database. To get remedies from your PDFs: create folder ayurvedaknowledgebase/, add PDFs, run npm run ingest:ayurveda')
    }

    const prompt = ragText
      ? `You are a health advisor. Use the AYURVEDA PASSAGES below to suggest remedies. Write a complete report.

LAB READINGS:
${allReadings.length ? allReadings.join('\n') : 'None provided.'}

ABNORMAL / FLAGGED FINDINGS (address these with the passages):
${abnormals.length ? abnormals.join('\n') : 'None identified.'}

PATIENT CONTEXT:
${profileContext || 'Not provided.'}

----- AYURVEDA PASSAGES (you MUST use these for remedies – quote or paraphrase specific herbs, foods, practices) -----
${ragText}
----- END PASSAGES -----

Use minimal tokens. Format each point as: Marker/Category >> Condition >> One-line remedy (e.g. "Blood >> Anemia >> Include iron-rich foods and X herb from passages").
**Key Findings:** 2–5 one-line bullets.
**What to do & remedies:** For each abnormal finding use: Marker >> Condition >> Brief remedy from AYURVEDA PASSAGES above. One line per finding. No long paragraphs.
**When to see a doctor:** 1 sentence.
Output only the report text. No greeting. Start with **Key Findings:**.`
      : `You are a health advisor. Write a complete report. No Ayurveda passages were available (patient has not added PDFs to the knowledge base yet).

LAB READINGS:
${allReadings.length ? allReadings.join('\n') : 'None provided.'}

ABNORMAL / FLAGGED FINDINGS:
${abnormals.length ? abnormals.join('\n') : 'None identified.'}

PATIENT CONTEXT:
${profileContext || 'Not provided.'}

Use minimal tokens. Format: Marker >> Condition >> One-line remedy.
**Key Findings:** 2–5 one-line bullets.
**What to do & remedies:** One line per finding. If no PDFs ingested, one line general advice.
**When to see a doctor:** 1 sentence.
Output only the report text. No greeting. Start with **Key Findings:**.`

    const genRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
      })
    })
    if (!genRes.ok) {
      const errText = await genRes.text()
      console.error('Gemini error:', errText)
      return new Response(
        JSON.stringify({ error: 'Failed to generate recommendations.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }
    const genData = await genRes.json()
    let recText = ''
    for (const part of genData?.candidates?.[0]?.content?.parts || []) {
      if (part.text) recText += part.text
    }
    recText = recText.trim()
    if (!recText) {
      return new Response(
        JSON.stringify({ error: 'No recommendations generated.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    await supabase.from('health_analysis').delete().eq('report_id', reportId).eq('category', 'Recommendations')
    await supabase.from('health_analysis').insert({
      report_id: reportId,
      category: 'Recommendations',
      findings: {},
      summary: 'AI-generated: what to do + Ayurveda & home remedies',
      recommendations: recText,
      risk_level: 'Low'
    })

    return new Response(
      JSON.stringify({ success: true, recommendations: recText }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  } catch (e: any) {
    console.error('generate-ayurveda-recommendations error:', e)
    return new Response(
      JSON.stringify({ error: e?.message || 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }
})

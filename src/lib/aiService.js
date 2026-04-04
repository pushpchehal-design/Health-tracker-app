// AI Service for Health Report Analysis
// This service calls the Supabase Edge Function for AI-powered analysis

import { supabase } from './supabase'

/**
 * Analyzes a health report via Edge Function (PDF: reference-based parsing; optional AI fallback for scans/images).
 * @param {string} fileUrl - Signed URL of the uploaded file
 * @param {string} filePath - Path to file in storage
 * @param {string} fileType - Type of file (pdf, docx, image)
 * @param {string} reportId - ID of the health report record
 * @param {boolean} useAiFallback - If true, use AI when PDF text cannot be extracted (scans/images). If false, no API calls.
 * @param {{ llmProvider?: 'gemini' | 'claude' }} [opts] - Which provider reads the file when AI is on (default claude).
 * @returns {Promise<Object>} Analysis results
 */
export async function analyzeHealthReport(fileUrl, filePath, fileType, reportId, useAiFallback = false, opts = {}) {
  const llmProvider = opts.llmProvider === 'gemini' ? 'gemini' : 'claude'
  try {
    if (!reportId) {
      throw new Error('Report ID is required for analysis')
    }

    console.log('About to invoke Edge Function with:', { filePath, fileType, reportId })
    
    // Get Supabase URL and anon key for direct fetch (fallback)
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL or anon key is missing. Check your .env has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server (npm run dev).')
    }

    // Call Supabase directly (Edge Function sets Access-Control-Allow-Origin: *). Avoids dev-only Vite proxy
    // misconfiguration that produced 404 → false "function not found" on localhost.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('You must be signed in to run lab analysis. Do not use the anon key as a user token.')
    }
    const token = session.access_token
    const functionUrl = `${supabaseUrl}/functions/v1/analyze-health-report`
    console.log('Edge Function URL:', supabaseUrl + '/functions/v1/analyze-health-report')

    // Call Supabase Edge Function (direct fetch is more reliable than invoke for Edge Functions)
    try {
      console.log('Invoking Edge Function: analyze-health-report')
      console.log('Request body:', {
        fileUrl: fileUrl?.substring(0, 50) + '...',
        filePath,
        fileType,
        reportId,
        useAiFallback: useAiFallback === true,
        llmProvider,
      })
      console.log(
        useAiFallback ? `AI requested: backend will use ${llmProvider} for file extraction.` : 'AI not requested: backend may use no-AI parser.',
      )

      let data, error
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          fileUrl,
          filePath,
          fileType,
          reportId,
          useAiFallback: useAiFallback === true,
          llmProvider,
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        try {
          const j = JSON.parse(errorText)
          if (typeof j?.error === 'string') {
            throw new Error(j.error)
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            /* not JSON — use generic below */
          } else {
            throw e
          }
        }
        throw new Error(`Edge Function error (${response.status}): ${errorText || response.statusText}`)
      }

      const result = await response.json()
      data = result
      error = result.error || null
      
      console.log('Edge Function call completed')
      console.log('Response data:', data)
      console.log('Response error:', error)

      if (error) {
        console.error('Edge function error:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        throw new Error(error.message || 'Failed to analyze report')
      }

      // Check if response has error (non-2xx status)
      if (data && data.error) {
        console.error('Edge function returned error:', data.error)
        throw new Error(data.error || 'Analysis failed')
      }

      if (!data || !data.success) {
        console.error('Unexpected response:', data)
        throw new Error(data?.error || 'Analysis failed - unexpected response')
      }

      return data.analysis
    } catch (invokeError) {
      console.error('Error invoking Edge Function:', invokeError)
      const msg = invokeError.message || ''
      if (/^Edge Function error \(404\)/.test(msg) || /functions\/v1\/\S+\s*404/i.test(msg)) {
        throw new Error(
          'Edge Function returned 404. Deploy: npx supabase functions deploy analyze-health-report — or check VITE_SUPABASE_URL matches your project.',
        )
      }
      if (msg.includes('Failed to fetch') || msg.includes('Load failed') || msg.includes('NetworkError')) {
        throw new Error(
          'Cannot reach Edge Function. Check: (1) .env has correct VITE_SUPABASE_URL (e.g. https://xxxx.supabase.co), ' +
          '(2) Function is deployed (Supabase Dashboard → Edge Functions), (3) No browser extension blocking the request.'
        )
      }
      throw invokeError
    }

  } catch (error) {
    console.error('Error in AI analysis:', error)
    console.error('Error stack:', error.stack)
    throw new Error('Failed to analyze report: ' + (error.message || 'Unknown error'))
  }
}

/**
 * Test Gemini 2.5 Flash API connectivity (same Edge Function, test action).
 * Use this to verify your paid subscription / API key is working.
 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
 */
export async function testGeminiConnection() {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return { success: false, error: 'Missing Supabase URL or anon key in .env' }
  }
  const functionUrl = `${supabaseUrl}/functions/v1/analyze-health-report`
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ action: 'testGemini' }),
    })
    const result = await response.json()
    if (result.success) {
      return { success: true, message: result.message || 'Gemini API is working.' }
    }
    return { success: false, error: result.error || 'Unknown error' }
  } catch (err) {
    return { success: false, error: err?.message || 'Request failed' }
  }
}

/**
 * Generate Ayurveda recommendations for an existing report (RAG + Claude by default).
 * Uses Supabase client invoke so auth (session JWT or anon) is sent correctly.
 * @param {string} reportId - Health report ID
 * @param {string} userId - Current user ID (for auth)
 * @param {{ llmProvider?: 'gemini' | 'claude' }} [opts] - Text model for this request (server may use embeddings as configured)
 * @returns {Promise<{ success: boolean, recommendations?: string, error?: string }>}
 */
export async function generateAyurvedaRecommendations(reportId, userId, opts = {}) {
  const llmProvider = opts.llmProvider === 'gemini' ? 'gemini' : 'claude'
  const { data, error } = await supabase.functions.invoke('generate-ayurveda-recommendations', {
    body: { reportId, userId, llmProvider },
  })
  if (error) {
    let message = error.message || 'Request failed'
    if (error.context?.json) {
      try {
        const errBody = await error.context.json()
        if (errBody?.error) message = errBody.error
      } catch {
        /* ignore */
      }
    }
    throw new Error(message)
  }
  if (data?.error) {
    throw new Error(data.error)
  }
  return data
}

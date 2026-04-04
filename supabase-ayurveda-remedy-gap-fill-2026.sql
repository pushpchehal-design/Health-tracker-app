-- Optional: remedy rows often missing from master CSV (e.g. Apo ratio low only had "high").
-- Run in Supabase SQL editor if abnormal markers still show empty remedy cells after fuzzy matching.
-- UNIQUE(marker_name, condition) — safe to re-run (skips duplicates).

INSERT INTO public.ayurveda_remedy_lookup (marker_name, condition, remedy_text, dietary_recommendations, lifestyle_modification, category)
VALUES
(
  'APO-B/APO-A1 Ratio',
  'low',
  'Work with a qualified Ayurvedic practitioner for personalised herbs (e.g. lipid-supporting formulations). Do not self-prescribe alongside statins or anticoagulants without medical review.',
  'Maintain a Mediterranean-style pattern: fibre-rich foods, nuts, legumes, and oily fish as appropriate; limit trans fats and excess refined sugar.',
  'Regular moderate exercise if your physician approves; sleep regularity; follow-up lipid testing.',
  'Blood'
),
(
  'PCT',
  'low',
  'Platelet mass on the lower side: correlate with platelet count and clinical context. Ayurvedic care may focus on raktavaha srotas and agni; use herbs only under practitioner guidance.',
  'Adequate protein, iron- and B12-rich foods if deficiency is suspected; avoid extreme restriction diets.',
  'Avoid unnecessary NSAIDs; discuss bleeding history with your doctor; repeat CBC as advised.',
  'Blood'
),
(
  'Estimated Average Glucose(eAG)',
  'high',
  'Elevated average glucose suggests tighter glycaemic control is needed. Classical Ayurveda may use bitter/mild astringent foods and herbs for prameha under supervision.',
  'Reduce refined carbohydrates and sugary drinks; prefer low–moderate glycaemic meals with vegetables and adequate protein.',
  'Post-meal walking; weight management; monitor fasting and post-prandial glucose per your clinician.',
  'Metabolic'
)
ON CONFLICT (marker_name, condition) DO NOTHING;

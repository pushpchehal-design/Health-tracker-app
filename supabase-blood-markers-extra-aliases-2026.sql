-- Optional: extra aliases for common lab PDF spellings (thyroid, cardiac, urine, lipids).
-- Run in Supabase SQL Editor once. Safe to re-run (guarded with NOT @> checks).

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'CRP', 'CRP, Serum', 'C Reactive Protein', 'C-Reactive Protein, Serum'
]) WHERE name = 'CRP' AND NOT (COALESCE(aliases, '{}') @> ARRAY['CRP, Serum']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'BNP, Serum', 'Brain Natriuretic Peptide'
]) WHERE name = 'BNP' AND NOT (COALESCE(aliases, '{}') @> ARRAY['BNP, Serum']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'NTproBNP', 'NT proBNP', 'NT-PROBNP', 'NT Pro-BNP'
]) WHERE name = 'NT-proBNP' AND NOT (COALESCE(aliases, '{}') @> ARRAY['NTproBNP']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Lipoprotein (a)', 'Lipoprotein a', 'LPA', 'Lp(a)', 'Lp a'
]) WHERE name = 'Lipoprotein(a)' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Lipoprotein (a)']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Homocysteine, Serum', 'Plasma Homocysteine, Serum'
]) WHERE name = 'Homocysteine' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Homocysteine, Serum']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Apo B / Apo A1', 'APO B/APO A1', 'ApoB/ApoA1'
]) WHERE name = 'Apo B/Apo A1 Ratio' AND NOT (COALESCE(aliases, '{}') @> ARRAY['ApoB/ApoA1']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Eosinophils (ABS)', 'EOS (ABS)'
]) WHERE name = 'Eosinophils (Abs)' AND NOT (COALESCE(aliases, '{}') @> ARRAY['EOS (ABS)']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Basophils (ABS)', 'BASO (ABS)'
]) WHERE name = 'Basophils (Abs)' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Basophils (ABS)']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Lymphocytes (ABS)', 'LYM (ABS)'
]) WHERE name = 'Lymphocytes (Abs)' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Lymphocytes (ABS)']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Monocytes (ABS)', 'MONO (ABS)'
]) WHERE name = 'Monocytes (Abs)' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Monocytes (ABS)']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Neutrophils (ABS)', 'NEUT (ABS)'
]) WHERE name = 'Neutrophils (Abs)' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Neutrophils (ABS)']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Free T3, Serum', 'FT3', 'Serum Free T3', 'Free-T3'
]) WHERE name = 'Free T3' AND NOT (COALESCE(aliases, '{}') @> ARRAY['FT3']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Free T4, Serum', 'FT4', 'Serum Free T4', 'Free-T4'
]) WHERE name = 'Free T4' AND NOT (COALESCE(aliases, '{}') @> ARRAY['FT4']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'TSH, Serum', 'TSH ULTRASENSITIVE', 'Ultra Sensitive TSH'
]) WHERE name = 'TSH' AND NOT (COALESCE(aliases, '{}') @> ARRAY['TSH ULTRASENSITIVE']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Urine Creatinine', 'Creatinine, Urine', 'Urine- Creatinine'
]) WHERE name = 'Urine Creatinine' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Urine Creatinine']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Urine pH', 'Urine Ph', 'pH Urine', 'Urine PH'
]) WHERE name = 'Urine pH' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Urine Ph']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Urine Specific Gravity', 'Specific Gravity, Urine', 'USG'
]) WHERE name = 'Urine Specific Gravity' AND NOT (COALESCE(aliases, '{}') @> ARRAY['USG']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Fasting Insulin, Serum', 'Serum Insulin, Fasting'
]) WHERE name = 'Fasting Insulin' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Fasting Insulin, Serum']);

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Folate, Serum', 'Serum Folate'
]) WHERE name = 'Folate' AND NOT (COALESCE(aliases, '{}') @> ARRAY['Folate, Serum']);

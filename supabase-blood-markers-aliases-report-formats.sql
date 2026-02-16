-- Aliases from Dec 2025 Detailed report (Lifecell/Novocura) and similar lab formats.
-- Run once in Supabase SQL Editor. Safe to run again (adds aliases, does not duplicate).
-- Ensures PDF parser matches parameter names across CBC, Kidney, Liver, Thyroid, Lipids, Electrolytes, Iron, Vitamins, etc.
--
-- IMPORTANT: This file only UPDATES/INSERTS into the table "blood_marker_reference".
-- That table must exist first. Either:
--   (1) Run supabase-blood-markers-reference.sql first, then this file, OR
--   (2) Run supabase-blood-markers-full-setup.sql once (it does both and avoids "does not exist").

-- ========== ADD MISSING REFERENCE ROWS (if not in main seed) ==========
INSERT INTO blood_marker_reference (name, aliases, unit, normal_low, normal_high, category) VALUES
-- CBC differential and platelet (full 25-param CBC)
('Neutrophils', ARRAY['Neutrophils (%)', 'Neutrophils %'], '%', 40, 80, 'Blood'),
('Lymphocytes', ARRAY['Lymphocytes (%)', 'Lymphocytes %'], '%', 20, 40, 'Blood'),
('Monocytes', ARRAY['Monocytes (%)', 'Monocytes %'], '%', 2, 10, 'Blood'),
('Eosinophils', ARRAY['Eosinophils (%)', 'Eosinophils %'], '%', 1, 6, 'Blood'),
('Basophils', ARRAY['Basophils (%)', 'Basophils %'], '%', 0, 2, 'Blood'),
('Neutrophils (Abs)', ARRAY['Neutrophils (Abs)', 'Neutrophils Abs'], '10^3/μL', 1.5, 8.0, 'Blood'),
('Lymphocytes (Abs)', ARRAY['Lymphocytes (Abs)', 'Lymphocytes Abs'], '10^3/μL', 1.0, 4.8, 'Blood'),
('Monocytes (Abs)', ARRAY['Monocytes (Abs)', 'Monocytes Abs'], '10^3/μL', 0.5, 0.9, 'Blood'),
('Eosinophils (Abs)', ARRAY['Eosinophils (Abs)', 'Eosinophils Abs'], '10^3/μL', 0.2, 0.5, 'Blood'),
('Basophils (Abs)', ARRAY['Basophils (Abs)', 'Basophils Abs'], '10^3/μL', 0, 0.3, 'Blood'),
('PlateletCrit', ARRAY['PlateletCrit', 'PCT', 'Platelet Crit'], '%', 0.22, 0.24, 'Blood'),
('PLCR', ARRAY['PLCR', 'Platelet-Large Cell Ratio', 'PLCR (Platelet-Large Cell Ratio)'], '%', 15, 35, 'Blood'),
('RDW-SD', ARRAY['Red Cell Distribution Width SD'], 'fL', 39, 46, 'Blood'),
('Total Protein', ARRAY['Total Protein, Serum', 'Protein, Total'], 'g/dL', 6.4, 8.3, 'Liver'),
('Globulin', ARRAY['Globulin, Serum'], 'g/dL', 1.9, 3.9, 'Liver'),
('A:G ratio', ARRAY['A:G ratio', 'A/G ratio'], 'ratio', 1.1, 2.5, 'Liver'),
('Bilirubin (Indirect)', ARRAY['Bilirubin - Indirect', 'Bilirubin - Indirect, Serum'], 'mg/dL', 0.2, 1.0, 'Liver'),
('ESR', ARRAY['ESR, EDTA Blood', 'Erythrocyte Sedimentation Rate'], 'mm/hr', 0, 10, 'Blood'),
('Estimated Average Glucose', ARRAY['Estimated Average Glucose(eAG)', 'eAG'], 'mg/dL', 70, 126, 'Metabolic'),
('Non HDL Cholesterol', ARRAY['Non HDL Cholesterol, Serum'], 'mg/dL', 0, 130, 'Blood'),
('BUN/Creatinine Ratio', ARRAY['BUN/Creatinine Ratio, Serum'], 'ratio', 5, 23.5, 'Kidney'),
('UIBC', ARRAY['UIBC, Serum', 'Unsaturated Iron Binding Capacity'], 'µg/dL', 112, 346, 'Blood'),
('LDH', ARRAY['Lactatedehydragenase (LDH), Serum', 'LDH, Serum'], 'U/L', 180, 360, 'Blood'),
('Apolipoprotein A1', ARRAY['Apolipoprotein A1, Serum'], 'mg/dL', 70, 120, 'Blood'),
('Apolipoprotein B', ARRAY['Apolipoprotein B, Serum'], 'mg/dL', 50, 90, 'Blood'),
('Apo B/Apo A1 Ratio', ARRAY['APO- B/ APO- A1 Ratio'], 'ratio', 0.3, 0.9, 'Blood'),
('Total Cholesterol/HDL Ratio', ARRAY['Total Cholesterol/HDL Ratio'], 'ratio', 0, 5, 'Blood'),
('LDL/HDL Ratio', ARRAY['LDL / HDL Ratio'], 'ratio', 0, 2.5, 'Blood'),
('MPV', ARRAY['MPV'], 'fL', 9, 13, 'Blood'),
('PDW', ARRAY['PDW'], 'fL', 10, 18, 'Blood')
ON CONFLICT (name) DO NOTHING;

-- ========== CBC / BLOOD (exact PDF: Hemoglobin (HB), EDTA Blood; Red Blood Cells; PCV; WBC -Total Leucocytes Count; Platelet Count, EDTA Blood; etc.) ==========
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Hemoglobin (HB), EDTA Blood', 'Hemoglobin (HB)'
]) WHERE name = 'Hemoglobin';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'PCV (Hematocrit)', 'Hematocrit'
]) WHERE name = 'Hematocrit';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Red Blood Cells'
]) WHERE name = 'RBC';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'WBC -Total Leucocytes Count', 'WBC - Total Leucocytes Count'
]) WHERE name = 'WBC';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Platelet Count, EDTA Blood', 'Platelet Count'
]) WHERE name = 'Platelet Count';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'MCV(Mean Corpuscular Volume)', 'MCV (Mean Corpuscular Volume)'
]) WHERE name = 'MCV';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'MCH (Mean Corpuscular Hb)', 'MCH (Mean Corpuscular Hemoglobin)'
]) WHERE name = 'MCH';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'MCHC (Mean Corpuscular Hb Concentration)', 'MCHC (Mean Corpuscular Hemoglobin Concentration)'
]) WHERE name = 'MCHC';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Red Cell Distribution Width CV', 'Red Cell Distribution Width'
]) WHERE name = 'RDW';
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Red Cell Distribution Width SD'
]) WHERE name = 'RDW-SD';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'ESR, EDTA Blood', 'ESR'
]) WHERE name = 'ESR';

-- ========== CBC DIFFERENTIAL & PLATELET (full 25-param CBC) ==========
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Neutrophils (%)', 'Neutrophils %'
]) WHERE name = 'Neutrophils';
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Lymphocytes (%)', 'Lymphocytes %'
]) WHERE name = 'Lymphocytes';
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Monocytes (%)', 'Monocytes %'
]) WHERE name = 'Monocytes';
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Eosinophils (%)', 'Eosinophils %'
]) WHERE name = 'Eosinophils';
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Basophils (%)', 'Basophils %'
]) WHERE name = 'Basophils';
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Neutrophils (Abs)', 'Neutrophils Abs'
]) WHERE name = 'Neutrophils (Abs)';
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Lymphocytes (Abs)', 'Lymphocytes Abs'
]) WHERE name = 'Lymphocytes (Abs)';
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Monocytes (Abs)', 'Monocytes Abs'
]) WHERE name = 'Monocytes (Abs)';
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Eosinophils (Abs)', 'Eosinophils Abs'
]) WHERE name = 'Eosinophils (Abs)';
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Basophils (Abs)', 'Basophils Abs'
]) WHERE name = 'Basophils (Abs)';
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'PlateletCrit', 'PCT', 'Platelet Crit'
]) WHERE name = 'PlateletCrit';
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'PLCR (Platelet-Large Cell Ratio)', 'Platelet-Large Cell Ratio'
]) WHERE name = 'PLCR';

-- ========== LIVER (exact PDF phrases) ==========
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Bilirubin - Total', 'Bilirubin - Total, Serum', 'Bilirubin-Total'
]) WHERE name = 'Bilirubin (Total)';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Bilirubin - Direct', 'Bilirubin - Direct, Serum', 'Bilirubin-Direct'
]) WHERE name = 'Bilirubin (Direct)';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Bilirubin - Indirect', 'Bilirubin - Indirect, Serum'
]) WHERE name = 'Bilirubin (Indirect)';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'SGOT, Serum', 'SGOT,Serum'
]) WHERE name = 'AST';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'SGPT, Serum', 'SGPT,Serum', 'SGPT (Alanine Transaminase)'
]) WHERE name = 'ALT';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Alkaline Phosphatase, Serum'
]) WHERE name = 'Alkaline Phosphatase';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'GGT (Gamma Glutamyl Transferase), Serum', 'GGT (Gamma Glutamyl Transferase)'
]) WHERE name = 'GGT';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Total Protein, Serum', 'Protein, Total', 'Protein, Total '
]) WHERE name = 'Total Protein';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Albumin, Serum'
]) WHERE name = 'Albumin';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Globulin, Serum'
]) WHERE name = 'Globulin';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'A:G ratio', 'A/G ratio'
]) WHERE name = 'A:G ratio';

-- ========== THYROID ==========
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Tri Iodo Thyronine (T3 Total), Serum', 'Tri Iodo Thyronine (T3 Total)', 'T3, Total', 'T3,Total'
]) WHERE name = 'Total T3';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Thyroxine (T4), Serum', 'Thyroxine (T4)', 'T4, Total', 'T4,Total'
]) WHERE name = 'Total T4';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Thyroid Stimulating Hormone (TSH), Serum', 'TSH, Serum'
]) WHERE name = 'TSH';

-- ========== METABOLIC / DIABETES ==========
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'HbA1c By HPLC,EDTA Blood', 'HbA1c By HPLC, EDTA Blood', 'Glycosylated Hemoglobin (HbA1c)'
]) WHERE name = 'HbA1c';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Estimated Average Glucose(eAG)', 'eAG'
]) WHERE name = 'Estimated Average Glucose';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Glucose (Fasting) Plasma', 'Glucose (Fasting)', 'Fasting Plasma Glucose'
]) WHERE name = 'Glucose (Fasting)';

-- ========== LIPIDS ==========
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Total Cholesterol, Serum', 'Cholesterol - Total'
]) WHERE name = 'Total Cholesterol';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Triglycerides, Serum'
]) WHERE name = 'Triglycerides';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'HDL Cholesterol, Serum'
]) WHERE name = 'HDL Cholesterol';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Low Density Lipoprotein-Cholesterol (LDL)', 'LDL Cholesterol'
]) WHERE name = 'LDL Cholesterol';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'VLDL'
]) WHERE name = 'VLDL Cholesterol';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Total Cholesterol/HDL Ratio'
]) WHERE name = 'Total Cholesterol/HDL Ratio';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'LDL / HDL Ratio'
]) WHERE name = 'LDL/HDL Ratio';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Non HDL Cholesterol, Serum', 'Non HDL Cholesterol'
]) WHERE name = 'Non HDL Cholesterol';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Apolipoprotein A1, Serum', 'Apo A1'
]) WHERE name = 'Apolipoprotein A1';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Apolipoprotein B, Serum', 'Apo B'
]) WHERE name = 'Apolipoprotein B';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'APO- B/ APO- A1 Ratio', 'APO-B/APO-A1 Ratio'
]) WHERE name = 'Apo B/Apo A1 Ratio';

-- ========== KIDNEY / RENAL ==========
-- Urea is separate from BUN in lab reports (both reported; add row if missing)
INSERT INTO blood_marker_reference (name, aliases, unit, normal_low, normal_high, category) VALUES
('Urea', ARRAY['Urea, Serum'], 'mg/dL', 15, 48, 'Kidney')
ON CONFLICT (name) DO NOTHING;

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Creatinine, Serum', 'Creatinine,Serum', 'Creatinine '
]) WHERE name = 'Creatinine';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'eGFR', 'eGFR Calculated'
]) WHERE name = 'eGFR';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Urea, Serum', 'Urea'
]) WHERE name = 'Urea';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Blood Urea Nitrogen (BUN), Serum', 'Blood Urea Nitrogen (BUN)'
]) WHERE name = 'BUN';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'BUN/Creatinine Ratio, Serum', 'BUN/Creatinine Ratio'
]) WHERE name = 'BUN/Creatinine Ratio';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Uric Acid, Serum', 'Uric Acid'
]) WHERE name = 'Uric Acid';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Calcium, Serum', 'Calcium,Serum', 'Calcium '
]) WHERE name = 'Calcium';

-- ========== ELECTROLYTES ==========
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Sodium (Na+), Serum', 'Sodium (Na+)'
]) WHERE name = 'Sodium';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Potassium (K+), Serum', 'Potassium (K+)'
]) WHERE name = 'Potassium';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Chloride, Serum'
]) WHERE name = 'Chloride';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Magnesium, Serum', 'Magnesium'
]) WHERE name = 'Magnesium';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Phosphorous, Serum', 'Phosphorous', 'Phosphorus, Serum'
]) WHERE name = 'Phosphorus';

-- ========== IRON ==========
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Iron, Serum', 'Iron Serum'
]) WHERE name = 'Serum Iron';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'UIBC, Serum', 'Unsaturated Iron Binding Capacity'
]) WHERE name = 'UIBC';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Total Iron Binding Capacity (TIBC), Serum', 'Total Iron Binding Capacity (TIBC)', 'Total Iron Binding Capacity ( TIBC)'
]) WHERE name = 'TIBC';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  '% OF IRON SATURATION', 'Iron Saturation', 'Transferrin Saturation'
]) WHERE name = 'Transferrin Saturation';

-- ========== VITAMINS ==========
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Vitamin D - 25-Hydroxy, Serum', 'Vitamin D - 25-Hydroxy', 'Vitamin D (25-OH)'
]) WHERE name = 'Vitamin D';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Vitamin B12, Serum', 'Vitamin B12'
]) WHERE name = 'Vitamin B12';

-- ========== INFLAMMATION / CARDIAC ==========
UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'High Sensitive CRP (hs-CRP), Serum', 'High Sensitive CRP (hs-CRP)', 'hs-CRP'
]) WHERE name = 'CRP';

UPDATE blood_marker_reference SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY[
  'Lactatedehydragenase (LDH), Serum', 'Lactate Dehydrogenase', 'LDH, Serum'
]) WHERE name = 'LDH';

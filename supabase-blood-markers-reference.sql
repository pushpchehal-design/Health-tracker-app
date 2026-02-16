-- Blood Markers Reference Table (for programmatic comparison, not AI)
-- Run in Supabase SQL Editor. Use with: extract values via AI → compare here → then AI for narrative only.
-- Ranges are typical adult reference; labs may differ slightly.

CREATE TABLE IF NOT EXISTS blood_marker_reference (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  aliases TEXT[] DEFAULT '{}',
  unit TEXT NOT NULL,
  normal_low NUMERIC NOT NULL,
  normal_high NUMERIC NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blood_marker_reference_name ON blood_marker_reference(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_blood_marker_reference_category ON blood_marker_reference(category);
CREATE INDEX IF NOT EXISTS idx_blood_marker_reference_aliases ON blood_marker_reference USING GIN(aliases);

COMMENT ON TABLE blood_marker_reference IS 'Reference ranges for blood/urine markers. Used to compare extracted values; AI only does extraction and narrative.';

-- Seed: common markers (typical adult ranges; one range per marker for simplicity)
INSERT INTO blood_marker_reference (name, aliases, unit, normal_low, normal_high, category) VALUES
-- CBC
('Hemoglobin', ARRAY['Hb', 'Hgb', 'Haemoglobin'], 'g/dL', 12, 17, 'Blood'),
('Hematocrit', ARRAY['Hct', 'PCV'], '%', 36, 50, 'Blood'),
('RBC', ARRAY['Red Blood Cell Count', 'Erythrocytes'], 'million/mcL', 4.2, 5.9, 'Blood'),
('WBC', ARRAY['White Blood Cell Count', 'Leukocytes'], 'cells/mcL', 4500, 11000, 'Blood'),
('Platelet Count', ARRAY['Platelets', 'Plt', 'Thrombocytes'], 'cells/mcL', 150000, 400000, 'Blood'),
('MCV', ARRAY['Mean Corpuscular Volume'], 'fL', 80, 100, 'Blood'),
('MCH', ARRAY['Mean Corpuscular Hemoglobin'], 'pg', 27, 33, 'Blood'),
('MCHC', ARRAY['Mean Corpuscular Hemoglobin Concentration'], 'g/dL', 32, 36, 'Blood'),
('RDW', ARRAY['Red Cell Distribution Width'], '%', 11.5, 14.5, 'Blood'),
('ESR', ARRAY['Erythrocyte Sedimentation Rate', 'ESR, EDTA Blood'], 'mm/hr', 0, 10, 'Blood'),
('MPV', ARRAY['Mean Platelet Volume'], 'fL', 9, 13, 'Blood'),
('PDW', ARRAY['Platelet Distribution Width'], 'fL', 10, 18, 'Blood'),
-- Metabolic / Electrolytes
('Glucose (Fasting)', ARRAY['Fasting Blood Sugar', 'FBS', 'Blood Glucose'], 'mg/dL', 70, 100, 'Metabolic'),
('Sodium', ARRAY['Na'], 'mEq/L', 136, 145, 'Electrolytes'),
('Potassium', ARRAY['K'], 'mEq/L', 3.5, 5.0, 'Electrolytes'),
('Chloride', ARRAY['Cl'], 'mEq/L', 98, 106, 'Electrolytes'),
('Carbon Dioxide', ARRAY['CO2', 'Bicarbonate', 'HCO3'], 'mEq/L', 23, 29, 'Electrolytes'),
('Calcium', ARRAY['Calcium, Serum', 'Ca', 'Total Calcium'], 'mg/dL', 8.6, 10.2, 'Electrolytes'),
('Magnesium', ARRAY['Mg'], 'mg/dL', 1.7, 2.2, 'Electrolytes'),
('Phosphorus', ARRAY['Phosphate', 'PO4'], 'mg/dL', 2.5, 4.5, 'Electrolytes'),
-- Kidney
('Creatinine', ARRAY['Creatinine, Serum', 'Creat', 'Serum Creatinine'], 'mg/dL', 0.7, 1.3, 'Kidney'),
('BUN', ARRAY['Blood Urea Nitrogen', 'Blood Urea Nitrogen (BUN), Serum'], 'mg/dL', 7, 20, 'Kidney'),
('Urea', ARRAY['Urea, Serum'], 'mg/dL', 15, 48, 'Kidney'),
('eGFR', ARRAY['Estimated GFR', 'GFR'], 'mL/min/1.73m2', 90, 120, 'Kidney'),
('Uric Acid', ARRAY['Urate'], 'mg/dL', 3.5, 7.2, 'Kidney'),
('BUN/Creatinine Ratio', ARRAY['BUN/Creatinine Ratio, Serum', 'BUN/Creatinine Ratio'], 'ratio', 5, 23.5, 'Kidney'),
-- Liver
('ALT', ARRAY['SGPT', 'Alanine Aminotransferase'], 'U/L', 7, 56, 'Liver'),
('AST', ARRAY['SGOT', 'Aspartate Aminotransferase'], 'U/L', 10, 40, 'Liver'),
('Alkaline Phosphatase', ARRAY['ALP', 'Alk Phos'], 'U/L', 44, 147, 'Liver'),
('Bilirubin (Total)', ARRAY['Total Bilirubin', 'T. Bilirubin'], 'mg/dL', 0.1, 1.2, 'Liver'),
('Bilirubin (Direct)', ARRAY['Direct Bilirubin', 'Conjugated Bilirubin'], 'mg/dL', 0, 0.3, 'Liver'),
('Albumin', ARRAY['Serum Albumin'], 'g/dL', 3.4, 5.4, 'Liver'),
('Total Protein', ARRAY['Protein, Total', 'Total Protein, Serum', 'Protein, Total Serum'], 'g/dL', 6.4, 8.3, 'Liver'),
('Globulin', ARRAY['Globulin, Serum'], 'g/dL', 1.9, 3.9, 'Liver'),
('A:G ratio', ARRAY['A:G ratio', 'Albumin:Globulin', 'A/G ratio'], 'ratio', 1.1, 2.5, 'Liver'),
('Bilirubin (Indirect)', ARRAY['Bilirubin - Indirect', 'Bilirubin - Indirect, Serum', 'Indirect Bilirubin'], 'mg/dL', 0.2, 1.0, 'Liver'),
('GGT', ARRAY['Gamma-GT', 'GGT', 'Gamma Glutamyl Transferase'], 'U/L', 9, 48, 'Liver'),
-- Lipids
('Total Cholesterol', ARRAY['Cholesterol', 'TC'], 'mg/dL', 0, 200, 'Blood'),
('LDL Cholesterol', ARRAY['LDL', 'LDL-C', 'Bad Cholesterol'], 'mg/dL', 0, 100, 'Blood'),
('HDL Cholesterol', ARRAY['HDL', 'HDL-C', 'Good Cholesterol'], 'mg/dL', 40, 60, 'Blood'),
('Triglycerides', ARRAY['TG', 'TAG'], 'mg/dL', 0, 150, 'Blood'),
('VLDL Cholesterol', ARRAY['VLDL'], 'mg/dL', 0, 30, 'Blood'),
('Non HDL Cholesterol', ARRAY['Non HDL Cholesterol, Serum', 'Non-HDL Cholesterol'], 'mg/dL', 0, 130, 'Blood'),
('Total Cholesterol/HDL Ratio', ARRAY['Total Cholesterol/HDL Ratio', 'Cholesterol/HDL Ratio'], 'ratio', 0, 5, 'Blood'),
('LDL/HDL Ratio', ARRAY['LDL / HDL Ratio', 'LDL:HDL Ratio'], 'ratio', 0, 2.5, 'Blood'),
('Apolipoprotein A1', ARRAY['Apo A1', 'Apolipoprotein A1, Serum'], 'mg/dL', 70, 120, 'Blood'),
('Apolipoprotein B', ARRAY['Apo B', 'Apolipoprotein B, Serum'], 'mg/dL', 50, 90, 'Blood'),
('Apo B/Apo A1 Ratio', ARRAY['APO- B/ APO- A1 Ratio', 'Apo B/A1 Ratio'], 'ratio', 0.3, 0.9, 'Blood'),
-- Diabetes
('HbA1c', ARRAY['Glycated Hemoglobin', 'A1C', 'Glycosylated Hemoglobin'], '%', 4.0, 5.6, 'Metabolic'),
('Estimated Average Glucose', ARRAY['eAG', 'Estimated Average Glucose(eAG)'], 'mg/dL', 70, 126, 'Metabolic'),
('Fasting Insulin', ARRAY['Serum Insulin'], 'µIU/mL', 2.6, 24.9, 'Metabolic'),
-- Thyroid
('TSH', ARRAY['Thyroid Stimulating Hormone', 'Thyrotropin'], 'mIU/L', 0.4, 4.0, 'Thyroid'),
('Free T4', ARRAY['FT4', 'Free Thyroxine', 'T4 Free'], 'ng/dL', 0.8, 1.8, 'Thyroid'),
('Free T3', ARRAY['FT3', 'Free Triiodothyronine', 'T3 Free'], 'pg/mL', 2.3, 4.2, 'Thyroid'),
('Total T4', ARRAY['T4', 'Thyroxine'], 'µg/dL', 5.0, 12.0, 'Thyroid'),
('Total T3', ARRAY['T3', 'Triiodothyronine'], 'ng/dL', 80, 200, 'Thyroid'),
-- Cardiac / Inflammation
('CRP', ARRAY['C-Reactive Protein', 'hs-CRP', 'High Sensitivity CRP', 'High Sensitive CRP (hs-CRP), Serum'], 'mg/L', 0, 3, 'Blood'),
('LDH', ARRAY['Lactate Dehydrogenase', 'Lactatedehydragenase (LDH), Serum', 'LDH, Serum'], 'U/L', 180, 360, 'Blood'),
('Troponin I', ARRAY['TnI', 'Cardiac Troponin I'], 'ng/mL', 0, 0.04, 'Heart'),
('Troponin T', ARRAY['TnT', 'Cardiac Troponin T'], 'ng/mL', 0, 0.01, 'Heart'),
('BNP', ARRAY['B-type Natriuretic Peptide', 'B-Type NP'], 'pg/mL', 0, 100, 'Heart'),
('NT-proBNP', ARRAY['N-terminal proBNP'], 'pg/mL', 0, 125, 'Heart'),
-- Iron
('Serum Iron', ARRAY['Iron', 'Fe'], 'µg/dL', 60, 170, 'Blood'),
('Ferritin', ARRAY['Serum Ferritin'], 'ng/mL', 12, 300, 'Blood'),
('TIBC', ARRAY['Total Iron Binding Capacity'], 'µg/dL', 250, 370, 'Blood'),
('UIBC', ARRAY['Unsaturated Iron Binding Capacity', 'UIBC, Serum'], 'µg/dL', 112, 346, 'Blood'),
('Transferrin Saturation', ARRAY['Transferrin Sat', 'Iron Saturation', '% OF IRON SATURATION'], '%', 20, 50, 'Blood'),
-- Vitamins / Minerals
('Vitamin D', ARRAY['25-OH Vitamin D', '25-Hydroxyvitamin D', 'Calcidiol'], 'ng/mL', 20, 50, 'Metabolic'),
('Vitamin B12', ARRAY['Cobalamin', 'B12'], 'pg/mL', 200, 900, 'Metabolic'),
('Folate', ARRAY['Folic Acid', 'Serum Folate'], 'ng/mL', 3, 17, 'Metabolic'),
-- Urine (common)
('Urine Protein', ARRAY['Protein (Urine)', 'Urine Albumin'], 'mg/dL', 0, 20, 'Urine'),
('Urine Glucose', ARRAY['Glucose (Urine)'], 'mg/dL', 0, 0, 'Urine'),
('Urine Creatinine', ARRAY['Creatinine (Urine)'], 'mg/dL', 20, 320, 'Urine'),
('Urine Specific Gravity', ARRAY['Specific Gravity'], 'unit', 1.005, 1.030, 'Urine'),
('Urine pH', ARRAY['pH (Urine)'], 'unit', 4.5, 8.0, 'Urine'),
-- Tumor markers (common; interpret with caution)
('PSA', ARRAY['Prostate-Specific Antigen', 'Total PSA'], 'ng/mL', 0, 4.0, 'Tumor Markers'),
('CEA', ARRAY['Carcinoembryonic Antigen'], 'ng/mL', 0, 3.0, 'Tumor Markers'),
('AFP', ARRAY['Alpha-Fetoprotein'], 'ng/mL', 0, 10, 'Tumor Markers'),
('CA 125', ARRAY['Cancer Antigen 125'], 'U/mL', 0, 35, 'Tumor Markers'),
('CA 19-9', ARRAY['Carbohydrate Antigen 19-9'], 'U/mL', 0, 37, 'Tumor Markers')
ON CONFLICT (name) DO NOTHING;

-- Allow anonymous/authenticated read for Edge Function and app (RLS: public read for reference data)
ALTER TABLE blood_marker_reference ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for all" ON blood_marker_reference;
CREATE POLICY "Allow read for all"
  ON blood_marker_reference FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow read for anon" ON blood_marker_reference;
CREATE POLICY "Allow read for anon"
  ON blood_marker_reference FOR SELECT
  TO anon
  USING (true);

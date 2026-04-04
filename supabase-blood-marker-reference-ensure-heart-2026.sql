-- Ensures Homocysteine and Lipoprotein(a) exist in blood_marker_reference (fixes "no matching reference" in app).
-- Safe to re-run: INSERT uses ON CONFLICT DO NOTHING; UPDATE aliases are guarded.

INSERT INTO public.blood_marker_reference (name, aliases, unit, normal_low, normal_high, category)
VALUES
  (
    'Homocysteine',
    ARRAY['Hcy', 'Plasma Homocysteine', 'Homocysteine, Serum', 'Plasma Homocysteine, Serum'],
    'µmol/L',
    5,
    15,
    'Blood'
  ),
  (
    'Lipoprotein(a)',
    ARRAY['Lp(a)', 'Lipoprotein a', 'Lipoprotein (a)', 'LPA', 'Lp a', 'Lp(a), Serum'],
    'mg/dL',
    0,
    30,
    'Blood'
  )
ON CONFLICT (name) DO NOTHING;

UPDATE public.blood_marker_reference
SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY['Lipoprotein (a)', 'LPA'])
WHERE name = 'Lipoprotein(a)'
  AND NOT (COALESCE(aliases, '{}') @> ARRAY['Lipoprotein (a)']);

UPDATE public.blood_marker_reference
SET aliases = array_cat(COALESCE(aliases, '{}'), ARRAY['Homocysteine, Serum'])
WHERE name = 'Homocysteine'
  AND NOT (COALESCE(aliases, '{}') @> ARRAY['Homocysteine, Serum']);

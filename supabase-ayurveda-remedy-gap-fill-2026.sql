-- Optional: remedy rows missing from master CSV. Run in Supabase SQL editor.
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
  'PCT',
  'high',
  'Elevated platelet crit: review with your clinician for reactive causes, iron status, or marrow-related conditions. Ayurveda may emphasise pitta–rakta balance only under qualified supervision.',
  'Anti-inflammatory pattern: vegetables, whole grains, limit alcohol; avoid megadoses without medical advice.',
  'Hydration, stress reduction, sleep regularity; follow repeat CBC/platelet trends as directed.',
  'Blood'
),
(
  'PlateletCrit',
  'high',
  'See elevated platelet mass in clinical context. Supportive care may include cooling, bitter greens, and practitioner-guided herbs for rakta/pitta balance.',
  'Emphasise vegetables, legumes, and omega-3–rich foods as appropriate; limit very heating spices if advised.',
  'Moderate activity; avoid dehydration; cardiology/haematology follow-up if recommended.',
  'Blood'
),
(
  'Estimated Average Glucose(eAG)',
  'high',
  'Elevated average glucose suggests tighter glycaemic control is needed. Classical Ayurveda may use bitter/mild astringent foods and herbs for prameha under supervision.',
  'Reduce refined carbohydrates and sugary drinks; prefer low–moderate glycaemic meals with vegetables and adequate protein.',
  'Post-meal walking; weight management; monitor fasting and post-prandial glucose per your clinician.',
  'Metabolic'
),
(
  'Estimated Average Glucose',
  'high',
  'Elevated eAG aligns with higher average glucose exposure. Work with your doctor on targets; Ayurvedic support for prameha should be individualised by a practitioner.',
  'Plate method with half non-starchy vegetables; consistent meal timing; limit sweetened beverages.',
  'HbA1c and glucose monitoring as prescribed; regular physical activity when cleared medically.',
  'Metabolic'
),
(
  'eAG',
  'low',
  'Low estimated average glucose: confirm with fasting glucose and symptoms; rule out over-medication or illness. Ayurveda may tonify agni and brmhana only under supervision if deficiency pattern is confirmed.',
  'Small frequent balanced meals if hypoglycaemia-prone; avoid long fasts without medical guidance.',
  'Carry fast-acting carbohydrate if you have true hypoglycaemia episodes; urgent care for severe symptoms.',
  'Metabolic'
),
(
  'Estimated Average Glucose(eAG)',
  'low',
  'Low eAG—correlate with readings and medications. Do not ignore recurrent shakiness, sweating, or confusion; seek urgent care for severe hypoglycaemia.',
  'Balanced meals with complex carbs and protein; adjust only with clinician input.',
  'Glucose monitoring; medication review with your prescriber.',
  'Metabolic'
),
(
  'Folate',
  'high',
  'Isolated high serum folate often relates to supplements or intake; interpret with B12. Ayurveda may reduce excess heating/ama-forming habits under guidance.',
  'Review all vitamins and fortified foods with your clinician; emphasise whole foods.',
  'Avoid unsupervised high-dose folic acid; follow laboratory trends.',
  'Metabolic'
),
(
  'Folic Acid',
  'high',
  'High folate on labs—review supplementation and diet with your doctor; check B12 status to avoid masking deficiency.',
  'Whole-food diet; list all supplements for your clinician.',
  'Medication and supplement review; repeat labs as advised.',
  'Metabolic'
),
(
  'BNP',
  'high',
  'Elevated BNP suggests cardiac stress or fluid overload until proven otherwise—follow cardiology advice, imaging, and medications. Ayurveda is adjunct only: rest, mild routines, and herbs strictly under supervision.',
  'Low-sodium pattern if prescribed; fluid limits per physician; heart-healthy Mediterranean-style foods.',
  'Daily weights if advised; sleep with head elevated if directed; emergency care for breathlessness or chest pain.',
  'Heart'
),
(
  'NT-proBNP',
  'high',
  'High NT-proBNP warrants cardiac evaluation and treatment per your team. Ayurvedic measures are supportive only and must not replace prescribed therapy.',
  'Sodium-aware diet; alcohol moderation; nutrient-dense foods as tolerated.',
  'Activity as cleared by cardiology; stress reduction; seek emergency care for worsening symptoms.',
  'Heart'
),
(
  'Troponin T',
  'high',
  'Elevated troponin is a medical emergency until evaluated—seek immediate care or follow your emergency department plan. Do not rely on lifestyle advice alone.',
  'NPO or diet per hospital/clinician instructions until cleared.',
  'Rest; cardiology follow-up; call emergency services for chest pain, syncope, or severe shortness of breath.',
  'Heart'
),
(
  'Lipoprotein(a)',
  'high',
  'Elevated Lp(a) is a genetic risk factor—discuss risk reduction and emerging therapies with your lipid specialist. Ayurveda may support overall metabolic balance under supervision.',
  'Mediterranean-style diet; fibre-rich foods; limit trans fats; discuss alcohol with your clinician.',
  'Aerobic activity as approved; blood pressure control; smoking cessation if applicable.',
  'Heart'
),
(
  'Homocysteine',
  'high',
  'High homocysteine links to vascular risk—evaluate B12, folate, renal function, and genetics with your doctor. Ayurveda may support agni and tissue nutrition alongside medical care.',
  'Green leafy vegetables if appropriate; adequate B12-containing foods as directed; avoid excess methionine supplements without advice.',
  'Blood pressure management; smoking cessation; medications only as prescribed.',
  'Heart'
),
(
  'PDW',
  'high',
  'Wide platelet distribution width—usually interpreted with platelet count and clinical context. Practitioner-guided herbs for rakta may be considered only after medical work-up.',
  'Anti-inflammatory diet pattern; adequate hydration.',
  'Follow repeat CBC; discuss bleeding/clotting symptoms promptly.',
  'Blood'
),
(
  'PLCR',
  'low',
  'Low platelet–large cell ratio—interpret with MPV and platelet count. Ayurvedic support, if any, should be individualised after clinical review.',
  'Balanced nutrition; avoid unnecessary NSAIDs unless prescribed.',
  'Monitor symptoms; follow haematology advice if given.',
  'Blood'
),
(
  'Carbon Dioxide',
  'low',
  'Low CO2/bicarbonate may reflect acid–base or metabolic issues—needs clinical interpretation. Ayurveda does not replace correction of underlying cause.',
  'Diet per nephrologist/pulmonologist if chronic kidney or lung disease.',
  'Medication compliance; urgent care for severe shortness of breath or confusion.',
  'Electrolytes'
),
(
  'Urine pH',
  'low',
  'Very acidic urine—confirm repeat testing and clinical context (diet, medications, RTA, infection). Ayurveda may suggest pitta-balancing hydration patterns only under guidance.',
  'Vegetables and adequate fluids unless fluid-restricted; discuss acid-producing supplements with your clinician.',
  'Hydration as allowed medically; follow-up urinalysis.',
  'Urine'
),
(
  'Urine Specific Gravity',
  'high',
  'High specific gravity suggests concentrated urine—dehydration, diabetes, or other causes. Correlate with glucose and clinical picture.',
  'Adequate water intake if not contraindicated; limit excess salt if advised.',
  'Monitor for thirst and polyuria; diabetes follow-up if applicable.',
  'Urine'
),
(
  'PSA',
  'high',
  'Elevated PSA requires urological evaluation; Ayurveda is not a substitute for examination, imaging, or biopsy decisions.',
  'Tomato/lycopene-rich foods may be discussed with your doctor; avoid starting supplements without review.',
  'Follow urology surveillance; report urinary or systemic symptoms promptly.',
  'Tumor Markers'
)
ON CONFLICT (marker_name, condition) DO NOTHING;

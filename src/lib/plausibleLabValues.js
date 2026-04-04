/**
 * Clamp generated or synthetic lab values to physiologically plausible ranges
 * so test data and demos do not produce impossible numbers (e.g. urine pH 2.6).
 */

function normName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} parameterName
 * @param {string} [_unit] optional; reserved for unit-specific clamps
 * @param {number} value
 * @returns {number}
 */
export function clampPlausibleLabValue(parameterName, _unit, value) {
  if (value == null || Number.isNaN(value)) return value
  const n = normName(parameterName)
  let min = -Infinity
  let max = Infinity

  if (n.includes('urine') && n.includes('ph')) {
    min = 4.0
    max = 8.5
  } else if (n.includes('specific gravity') || n === 'usg' || (n.includes('urine') && n.includes('gravity'))) {
    min = 1.0
    max = 1.045
  } else if (n.includes('troponin')) {
    min = 0
    max = 55
  } else if (n.includes('bnp') || n.includes('nt-probnp') || n.includes('ntprobnp')) {
    min = 0
    max = 8000
  } else if (n.includes('ph') && !n.includes('urine')) {
    min = 6.75
    max = 7.55
  } else if (/\bhb\b|hemoglobin|haemoglobin/.test(n)) {
    min = 3
    max = 22
  } else if (n.includes('hematocrit') || n === 'hct' || n.includes('pcv')) {
    min = 15
    max = 62
  } else if (n.includes('platelet') && (n.includes('count') || n.endsWith('count'))) {
    min = 5000
    max = 1_200_000
  } else if (n.includes('plateletcrit') || n === 'pct' || /\bmpv\b|\bpdw\b|\bplcr\b/.test(n)) {
    min = 0.05
    max = 0.55
  } else if (/\bwbc\b|white blood|leucocyte|leukocyte/.test(n) && !n.includes('diff')) {
    min = 500
    max = 120_000
  } else if (n.includes('sodium') || /\bna\b/.test(n)) {
    min = 115
    max = 165
  } else if (n.includes('potassium') || /\bk\b/.test(n)) {
    min = 2.0
    max = 7.0
  } else if (n.includes('chloride') || /\bcl\b/.test(n)) {
    min = 75
    max = 120
  } else if (n.includes('carbon dioxide') || n.includes('bicarbonate') || n === 'co2') {
    min = 10
    max = 42
  } else if (n.includes('calcium') && !n.includes('ionized')) {
    min = 5.5
    max = 14.5
  } else if (n.includes('magnesium')) {
    min = 1.0
    max = 4.5
  } else if (n.includes('phosphorus') || n.includes('phosphate')) {
    min = 1.0
    max = 8.5
  } else if (n.includes('glucose') || n.includes('eag') || n.includes('estimated average glucose')) {
    min = 20
    max = 600
  } else if (n.includes('hba1c') || n.includes('glycated') || n.includes('a1c')) {
    min = 3.0
    max = 18.0
  } else if (n.includes('creatinine')) {
    min = 0.15
    max = 20
  } else if (n.includes('bun') && !n.includes('ratio')) {
    min = 1
    max = 140
  } else if (n === 'urea' || n.includes('urea,')) {
    min = 5
    max = 250
  } else if (n.includes('uric acid')) {
    min = 1.5
    max = 18
  } else if (n.includes('egfr') || n.includes('gfr')) {
    min = 5
    max = 150
  } else if (n.includes('bilirubin')) {
    min = 0
    max = 35
  } else if (/\balt\b|\bast\b|\bggt\b|alkaline phosphatase|amylase|lipase/.test(n)) {
    min = 1
    max = 12000
  } else if (n.includes('albumin')) {
    min = 1.5
    max = 6.5
  } else if (n.includes('total protein') && n.includes('urine')) {
    min = 0
    max = 500
  } else if (n.includes('total protein')) {
    min = 4.0
    max = 10.5
  } else if (n.includes('psa')) {
    min = 0
    max = 500
  } else if (n.includes('tsh')) {
    min = 0.01
    max = 80
  } else if (n.includes('free t3') || n.includes('total t3')) {
    min = 0.2
    max = 25
  } else if (n.includes('free t4') || n.includes('total t4')) {
    min = 0.1
    max = 10
  } else if (n.includes('cholesterol') || n.includes('triglyceride') || n.includes('hdl') || n.includes('ldl') || n.includes('vldl')) {
    min = 20
    max = 1200
  } else if (n.includes('lipoprotein')) {
    min = 0
    max = 250
  } else if (n.includes('homocysteine')) {
    min = 2
    max = 120
  } else if (n.includes('crp') && !n.includes('pcr')) {
    min = 0
    max = 500
  } else if (n.includes('ferritin')) {
    min = 1
    max = 8000
  } else if (n.includes('iron') && n.includes('serum')) {
    min = 10
    max = 450
  } else if (n.includes('folate') || n.includes('folic')) {
    min = 1
    max = 45
  } else if (n.includes('vitamin b12') || n.includes('b12') || n.includes('cobalamin')) {
    min = 50
    max = 2500
  } else if (n.includes('vitamin d') || n.includes('25-oh')) {
    min = 4
    max = 150
  } else if (normName(_unit).includes('million/mcl') || n.includes('rbc')) {
    min = 2.0
    max = 7.5
  } else if (n.includes('mcv')) {
    min = 55
    max = 125
  } else if (n.includes('mch') && !n.includes('mchc')) {
    min = 18
    max = 42
  } else if (n.includes('mchc')) {
    min = 26
    max = 38
  } else if (n.includes('rdw')) {
    min = 9
    max = 26
  } else if (n.includes('esr')) {
    min = 0
    max = 150
  } else if (n.includes('ldh')) {
    min = 80
    max = 5000
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return value
  return Math.min(max, Math.max(min, value))
}

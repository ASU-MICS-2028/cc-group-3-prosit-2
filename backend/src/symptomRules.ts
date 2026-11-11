/**
 * Symptom decision support (FB-7). This file is copied byte for byte to frontend/src/data/symptomRules.ts for test
 * mode, and a backend test fails if the two differ. The rules are written by the project team and HAVE NOT BEEN
 * REVIEWED BY A CLINICIAN. It suggests where to look; it never diagnoses.
 */
export type Priority = 'emergency' | 'urgent' | 'soon' | 'routine'

export const SYMPTOMS = {
  fever: 'Fever',
  cough: 'Cough',
  cough_2_weeks: 'Cough for 2 weeks or more',
  difficulty_breathing: 'Difficulty breathing',
  convulsions: 'Convulsions (fits)',
  stiff_neck: 'Stiff neck',
  rash: 'Rash',
  diarrhoea: 'Diarrhoea',
  vomiting: 'Vomiting',
  severe_headache: 'Severe headache',
  pregnant: 'Is pregnant',
  vaginal_bleeding: 'Vaginal bleeding',
} as const
export type Symptom = keyof typeof SYMPTOMS

export const DISCLAIMER = 'Decision support, not a diagnosis. These rules were written by the project team and have not been reviewed by a clinician. Use your training, and refer the person if you are worried.'

const RULES: { all: Symptom[]; possibility: string; priority: Priority; action: string }[] = [
  { all: ['convulsions'], possibility: 'A serious illness needing immediate care', priority: 'emergency', action: 'Raise an emergency and arrange transport now' },
  { all: ['difficulty_breathing'], possibility: 'A serious breathing problem', priority: 'emergency', action: 'Raise an emergency and arrange transport now' },
  { all: ['pregnant', 'vaginal_bleeding'], possibility: 'A danger sign in pregnancy', priority: 'emergency', action: 'Raise an emergency and arrange transport now' },
  { all: ['fever', 'stiff_neck'], possibility: 'Possible meningitis', priority: 'emergency', action: 'Raise an emergency and arrange transport now' },
  { all: ['pregnant', 'severe_headache'], possibility: 'Possible high blood pressure in pregnancy', priority: 'urgent', action: 'Check blood pressure and refer today' },
  { all: ['fever', 'rash'], possibility: 'Possible measles or another infection with rash', priority: 'urgent', action: 'Refer today and tell the clinic before arriving' },
  { all: ['fever', 'cough'], possibility: 'Possible chest infection', priority: 'soon', action: 'Refer to be seen within a day or two' },
  { all: ['cough_2_weeks'], possibility: 'Possible tuberculosis', priority: 'soon', action: 'Refer for a sputum test' },
  { all: ['diarrhoea', 'vomiting'], possibility: 'Risk of dehydration', priority: 'soon', action: 'Give oral rehydration salts and refer if not drinking' },
  { all: ['fever'], possibility: 'Possible malaria', priority: 'soon', action: 'Do a malaria rapid test where one is available' },
  { all: ['diarrhoea'], possibility: 'Possible gut infection', priority: 'routine', action: 'Give oral rehydration salts and advise on safe water' },
]

const ORDER: Priority[] = ['emergency', 'urgent', 'soon', 'routine']

export type Match = { possibility: string; priority: Priority; action: string; rule: string }

/** Every rule whose symptoms are all present, most urgent first; among equals, the more specific rule first. */
export function checkSymptoms(selected: Symptom[]): Match[] {
  const has = new Set(selected)
  return RULES.filter((r) => r.all.every((s) => has.has(s)))
    .sort((a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority) || b.all.length - a.all.length)
    .map((r) => ({ possibility: r.possibility, priority: r.priority, action: r.action, rule: `${r.all.map((s) => SYMPTOMS[s]).join(' + ')} → ${r.priority}` }))
}

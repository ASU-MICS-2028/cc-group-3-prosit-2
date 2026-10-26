-- HealthConnect Lab 6 — FHIR-aligned patient data model (as specified in the lab)
CREATE TABLE patients (
  id SERIAL PRIMARY KEY,
  fhir_resource_type TEXT DEFAULT 'Patient',
  full_name TEXT NOT NULL,
  phone TEXT,
  date_of_birth DATE,
  gender TEXT,
  region TEXT,
  preferred_language TEXT,
  consent_given_at TIMESTAMP,        -- NULL until the patient (or their CHV, on their behalf) explicitly consents
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE observations (
  id SERIAL PRIMARY KEY,
  fhir_resource_type TEXT DEFAULT 'Observation',
  patient_id INTEGER REFERENCES patients(id),
  observation_type TEXT NOT NULL, -- e.g. 'blood_pressure', 'temperature', 'weight'
  value TEXT NOT NULL,
  unit TEXT,
  recorded_by TEXT NOT NULL,
  recorded_at TIMESTAMP DEFAULT now()
);

CREATE TABLE access_log (
  id SERIAL PRIMARY KEY,
  accessed_by TEXT NOT NULL,
  patient_id INTEGER REFERENCES patients(id),
  action TEXT NOT NULL, -- 'read', 'write', 'delete'
  accessed_at TIMESTAMP DEFAULT now()
);

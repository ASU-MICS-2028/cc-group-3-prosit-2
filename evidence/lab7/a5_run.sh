#!/usr/bin/env bash
# L7-A5: book real appointments against the live API and record every answer.
# Usage: evidence/lab7/a5_run.sh > evidence/lab7/outputs_A_create_appointment.txt
# The CHV token is read from TOKEN=... in the repo's .env (gitignored), so it never appears in this output or in shell history.
set -u
API=https://api-hc.agroconnect.space
TOKEN=$(sed -n 's/^TOKEN=//p' "$(dirname "$0")/../../.env" | tr -d "\"' ")
[ -n "$TOKEN" ] || { echo "No TOKEN= line in .env" >&2; exit 1; }
SPECIALIST=c8bde890-8d3d-4142-9499-61008fe5bd4a
ABENA=09954463-b029-4bf4-b723-3c5cd4ac49c0   # has reminders consent
YAW=457f46b5-14b2-4933-acdd-d1cda1bf2c6d     # no reminders consent
uuid() { uuidgen | tr A-Z a-z; }

post() { # $1 = label, $2 = body, $3 = auth header on/off
  echo "## $1"
  echo "\$ POST /appointments $2"
  if [ "${3:-on}" = on ]; then auth=(-H "authorization: Bearer $TOKEN"); else auth=(); fi
  curl -s -w '\n[HTTP %{http_code}]\n\n' -X POST "$API/appointments" ${auth[@]+"${auth[@]}"} -H 'content-type: application/json' -d "$2"
}

echo "# L7-A5 live bookings, $(date -u '+%Y-%m-%d %H:%M UTC'), CHV 8b7102c5 (synthetic data only)"
echo
A=$(uuid); B=$(uuid); C=$(uuid)
SLOT_A=2026-11-10T09:00:00Z; SLOT_B=2026-11-10T10:00:00Z

post "1. Abena (consented): expect 201, event published" "{\"id\":\"$A\",\"patient_id\":\"$ABENA\",\"specialist_id\":\"$SPECIALIST\",\"starts_at\":\"$SLOT_A\"}"
post "2. Yaw (no consent): expect 201, event published without phone" "{\"id\":\"$B\",\"patient_id\":\"$YAW\",\"specialist_id\":\"$SPECIALIST\",\"starts_at\":\"$SLOT_B\"}"
post "3. Same request as 1 again (offline retry): expect 200, same id, nothing new saved; the event IS published again (retry recovers a lost event; duplicates are the consumers' problem, L7-H2)" "{\"id\":\"$A\",\"patient_id\":\"$ABENA\",\"specialist_id\":\"$SPECIALIST\",\"starts_at\":\"$SLOT_A\"}"
post "4. New id, same specialist, same slot as 1: expect 409 double_booked" "{\"id\":\"$C\",\"patient_id\":\"$YAW\",\"specialist_id\":\"$SPECIALIST\",\"starts_at\":\"$SLOT_A\"}"
post "5. Unknown patient: expect 404" "{\"id\":\"$(uuid)\",\"patient_id\":\"$(uuid)\",\"specialist_id\":\"$SPECIALIST\",\"starts_at\":\"2026-11-10T11:00:00Z\"}"
post "6. Bad input: expect 400 naming starts_at" "{\"id\":\"$(uuid)\",\"patient_id\":\"$ABENA\",\"specialist_id\":\"$SPECIALIST\",\"starts_at\":\"next tuesday\"}"
post "7. No token: expect 401" "{}" off

echo "## Appointment ids for the Lambda log check"
echo "Abena (expect reminder_logged twice, from steps 1 and 3, + specialist_notified twice): $A"
echo "Yaw   (expect skipped + specialist_notified):                                          $B"

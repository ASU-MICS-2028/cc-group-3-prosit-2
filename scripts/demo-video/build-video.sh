#!/usr/bin/env bash
# Records every scene with Playwright and stitches title cards + clips into healthconnect-demo.mp4.
#   Live:      TEST_PASSWORD=... ./build-video.sh
#   Rehearsal: DEMO_URL=http://localhost:4173 DEMO_MODE=test ./build-video.sh
set -euo pipefail
cd "$(dirname "$0")"

OUT="healthconnect-demo.mp4"
WORK="build"
TITLES="assets/titles"
SCENES=(01-chv-register 02-chv-refer 03-clinician 04-pharmacist 05-patient 06-healer 07-ghs 08-facility 09-platform 10-language)

rm -rf "$WORK" .state test-results playwright-report
mkdir -p "$WORK"

# 1. Title cards, then every scene in ONE run (each `playwright test` call wipes test-results/).
#    Scenes run in order and pass state forward; a failed scene is left out and the rest still ship.
npx playwright test tests/00-titles.spec.ts
specs=(); for s in "${SCENES[@]}"; do specs+=("tests/$s.spec.ts"); done
PLAYWRIGHT_JSON_OUTPUT_FILE="$WORK/results.json" npx playwright test --reporter=list,json "${specs[@]}" \
  || echo "WARN: at least one scene failed; it is left out of the video"
# Spec files whose test passed (a failed or skipped scene is left out).
passed=$(node -e '
  const r = require(process.argv[1]); const out = [];
  const walk = (s) => { (s.suites || []).forEach(walk); for (const sp of s.specs || []) if (sp.ok && sp.tests.every((t) => t.results.every((x) => x.status === "passed"))) out.push(sp.file) };
  r.suites.forEach(walk); console.log(out.join(" "))' "$PWD/$WORK/results.json")

# 2. Uniform 1280x720 / 30 fps / H.264 clips. Portrait recordings are letterboxed.
VF="scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x1d2b4f,setsar=1,fps=30"
ENC=(-c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -an)
card () { ffmpeg -loglevel error -y -loop 1 -t "$2" -i "$TITLES/$1.png" -vf "$VF" "${ENC[@]}" "$WORK/$3.mp4"; echo "file '$PWD/$WORK/$3.mp4'" >> "$WORK/concat.txt"; }
clip () { ffmpeg -loglevel error -y -ss 0.5 -i "$1" -vf "$VF" "${ENC[@]}" "$WORK/$2.mp4"; echo "file '$PWD/$WORK/$2.mp4'" >> "$WORK/concat.txt"; }

: > "$WORK/concat.txt"
card intro 4 00-intro
for s in "${SCENES[@]}"; do
  dir=$(find test-results -maxdepth 1 -type d -name "${s}-*" | head -1)
  video=$([ -n "$dir" ] && find "$dir" -name 'video.webm' | head -1 || true)
  if [ -z "$video" ] || [[ " $passed " != *" $s.spec.ts "* ]]; then
    echo "LEFT OUT: $s"; continue
  fi
  echo "scene: $s"
  card "$s" 3 "$s-card"
  clip "$video" "$s"
done
card outro 4 99-outro

# 3. Stitch.
ffmpeg -loglevel error -y -f concat -safe 0 -i "$WORK/concat.txt" -c copy -movflags +faststart "$OUT"
echo
ls -la "$OUT"
ffprobe -v error -show_entries format=duration:stream=width,height,codec_name,r_frame_rate "$OUT"

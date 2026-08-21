# Hide area

Measure the surface area of an irregular leather hide from a single photo.
Lay the hide flat, put an A4 sheet on it as a scale reference, shoot from above,
tap the hide, read the area in m², dm² and sq ft.

Everything runs in the browser. No backend, no accounts, no upload: after the
model files are cached, the photo never leaves the device.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
npm test         # unit tests
```

Mobile Chrome (Android) and mobile Safari (iOS) in portrait are the target;
desktop Chrome works for development. The first run downloads the segmentation
model (tens of MB) and caches it in the browser.

## The five steps

1. **Photo** — capture with the camera or pick an existing image. The photo is
   downscaled so its longest side is 2000 px; that downscaled image is the only
   pixel space the rest of the app uses.
2. **Calibrate** — tap the four corners of the A4 sheet, in any order. Drag to
   correct; a loupe shows what is under your finger. The four taps are ordered
   into a quad and mapped onto 210 × 297 mm, which gives the homography from
   image pixels to millimetres on the floor plane. The sheet is reprojected as a
   check (it must come back 210 × 297 mm within 1%) and the scale is shown as
   mm per pixel.
3. **Segment** — tap the hide. The SAM image embedding is computed once per
   photo in a worker; each tap only re-runs the mask decoder. Switch to *Remove
   area* to tap parts the mask grabbed by mistake.
4. **Outline** — the mask is traced into a polygon (100–300 vertices) that you
   can correct by dragging vertices. Pinch or scroll to zoom, drag to pan.
   Holes inside the hide are not subtracted in this version.
5. **Area** — every vertex goes through the homography into millimetres and the
   shoelace formula gives the area. 1 m² = 100 dm² = 10.7639 sq ft.

## Accuracy

The scale comes from the A4 sheet, so the sheet must lie flat on the hide, in
the same plane the hide occupies. The homography corrects perspective, so a
moderately angled shot (up to ~30° off-nadir) measures the same as an overhead
one. What it cannot correct: wrinkles and folds (the hide must be flat), a sheet
lying on a different level than the hide, and lens distortion at the extreme
edges of an ultra-wide frame.

Contour tracing follows the cracks between mask pixels rather than pixel
centres, so the traced polygon encloses exactly the mask's pixel area with no
half-pixel bias, and simplification to the vertex budget costs under 0.1% of
area on hide-sized shapes.

## Layout

```
src/
  main.js              stepper state machine, screen wiring
  steps/photo.js       capture/pick, downscale to 2000 px
  steps/calibrate.js   A4 corner taps -> homography
  steps/segment.js     SAM point prompts
  steps/review.js      mask -> polygon, vertex editing
  steps/result.js      mm polygon -> area
  lib/homography.js    DLT, point transform, A4 calibration    (unit tested)
  lib/contour.js       mask -> polygon, simplification          (unit tested)
  lib/area.js          shoelace, unit conversions               (unit tested)
  lib/sam.js           worker handle: model load, embedding cache, decode
  lib/samWorker.js     Transformers.js inference off the main thread
  ui/canvasView.js     zoom/pan, handle dragging, tap detection
  ui/loupe.js          magnifier
  ui/draw.js           shared canvas helpers
test/                  Vitest: homography, contour, area, and a synthetic
                       end-to-end pipeline at 0°, 15° and 30° off-nadir
```

Two coordinate spaces exist and only two: **image space** (pixels of the
downscaled photo) and **world space** (millimetres on the floor plane). Every
function documents which one it takes and returns.

## Model and backends

`Xenova/slimsam-77-uniform` via Transformers.js (`SamModel` + `AutoProcessor`).
The worker tries WebGPU first and falls back to WASM automatically; the active
backend is shown in the status line on step 3 and the model download reports
progress the first time. Homography, contour extraction and area are plain JS —
no OpenCV.js, no math library.

## Testing

`npm test` covers the pure functions: a known 4-point homography round-trip and
its inverse, the A4 orientation rule, shoelace on known polygons and unit
conversions, contour extraction on synthetic masks (rectangle, L, disc, holes,
two blobs, border-touching), and a synthetic camera that projects an A4 sheet
and a known shape at 0°, 15° and 30° off-nadir, calibrates from the projected
corners, and checks the measured area within 2%.

### Manual checklist

Run through this on a real phone; it covers the acceptance criteria.

1. **Self-test on the sheet.** Photograph an A4 sheet lying on the floor, from
   directly above. Calibrate on its corners, then segment and outline the sheet
   itself. Expect **0.0623 m² ± 2%** (0.061–0.064 m², 6 dm², 0.7 sq ft).
2. **Angled self-test.** Repeat from roughly 30° off to one side, whole sheet
   still in frame. Expect the same 0.0623 m² ± 2%.
3. **Android Chrome, WASM.** Run the full flow on a real Android phone. If the
   status line on step 3 says `wasm`, the fallback path is what you are testing.
   Decodes after the embedding is ready should feel interactive (about a second).
4. **Embedding is computed once.** On step 3, watch the status line: the first
   tap reports the embedding time, later taps only report decode times. Adding
   and removing several points must never return to "Preparing image…".
5. **Offline after load.** Open DevTools → Network, load the model once, then
   take a photo and run the whole flow. No requests during calibrate, segment,
   outline or area.
6. **Main thread stays responsive.** While "Preparing image…" is showing, the
   stepper chips and buttons must still respond and the photo must still pan
   and zoom.
7. **Editing.** Drag an A4 corner and confirm the loupe follows and the mm/px
   readout updates. On step 4, drag a vertex and confirm the outline follows.
8. **Reset.** *Measure another hide* returns to step 1 with everything cleared.

## Not in this version

No PWA/offline install, no history or export, no automatic A4 detection, no hole
subtraction, no multi-hide batch mode, no wrinkle compensation, no i18n.

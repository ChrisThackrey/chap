# Add Stop Debug Guide

## Log Markers Reference

Search console output for these markers to trace the add-stop flow:

| Marker | Location | Meaning |
|--------|----------|---------|
| `🔍 [AddStop] Start:` | use-route-generation.ts | addStop() called with prompt |
| `🔍 [AddStop] New stop:` | use-route-generation.ts | Venue found, showing name + coords |
| `📍 [AddStop] Inserting` | use-route-generation.ts | Optimal position calculated |
| `✅ [AddStop] ===== ADD STOP COMPLETE =====` | use-route-generation.ts | Full summary of the add |
| `❌ [AddStop] Error:` | use-route-generation.ts | addStop failed |
| `🔄 [RouteMap] Recalculating stopsWithOffsets` | route-map.tsx | Markers being recalculated |
| `🗺️ [RouteMap:Directions] Fetching directions` | route-map.tsx | Direction API calls starting |
| `✅ [RouteMap:Directions]` | route-map.tsx | Directions fetched with segment/coord count + timing |
| `⚠️ [RouteMap:Directions] No segments` | route-map.tsx | API returned empty (using fallback) |
| `❌ [RouteMap:Directions] Failed` | route-map.tsx | Direction fetch error |
| `🗺️ [RouteMap:Directions] Fetch aborted` | route-map.tsx | Aborted because stops changed again |

## Expected Log Sequence for Successful Add Stop

```
🔍 [AddStop] Start: "Movie"
[generateSingleVenue] Starting with prompt: Movie
[Strategy 0] Found venue directly from prompt: Santikos Palladium
🔍 [AddStop] New stop: Santikos Palladium lat=29.6085 lon=-98.5993
📍 [AddStop] Inserting "Santikos Palladium" at position 3
✅ [AddStop] ===== ADD STOP COMPLETE =====
   Prompt: "Movie"
   Venue: Santikos Palladium
   Total stops: 4
   Stop order: 1:Stop A → 2:Stop B → 3:Santikos Palladium → 4:Stop C
✅ [AddStop] =============================
🔄 [RouteMap] Recalculating stopsWithOffsets
   Input stops: 4
   Valid stops for rendering: 4
🗺️ [RouteMap:Directions] Fetching directions for 4 stops...
✅ [RouteMap:Directions] 3 segments, 900 coordinates in 2500ms
```

## Common Issues

### Route lines disappear after adding a stop
**Fixed (2026-02-05):** The `!isLoadingRoute` guard on polyline rendering hid all
route lines during the 2-3 second direction fetch. Straight-line fallback now shows
immediately while real polylines load.

### All stops are the same venue
**Fixed (2026-02-05):** Strategy 0 in venue-validator searched Google with the full
user prompt for every stop. Now only used for single-venue (addStop), not multi-stop routes.

### No polylines appear at all
Check for:
1. `❌ [RouteMap:Directions] Failed` — API error
2. `⚠️ [RouteMap:Directions] No segments` — empty response
3. `🗺️ [RouteMap:Directions] Fetch aborted` — stops changed during fetch (rapid add)
4. Google Directions API key set? Check for `🔑 Google Directions API Key check: ... SET`

### Add stop returns success but marker doesn't appear
Check `stopsWithOffsets` log:
- `Valid stops for rendering: N` should equal total stops
- If fewer, a stop has invalid coordinates (0, NaN, etc.)

### Directions fetch takes too long
Each new (non-cached) segment needs ~1 API call + 500ms rate-limit delay.
Cache hits are instant. After adding 1 stop: typically 2 cache misses (segments
touching the new stop), rest from cache. Expected time: 1.5-3 seconds.

## Architecture

```
User taps "Add Stop" → AddStopModal
  ↓
route-planner.tsx: handleAddStop(prompt)
  ↓
use-route-generation.ts: addStop(prompt, options)
  ├── generateSingleVenue(prompt) → AI + Google Places
  ├── isValidCoordinate() check
  ├── findOptimalInsertionPosition()
  ├── setRoute(newRoute) → triggers React re-render
  └── return { success: true }
  ↓
route-map.tsx: route prop changes
  ├── stopsWithOffsets recalculates (new markers)
  ├── stopsKey changes (new coordinate string)
  └── direction-fetching useEffect fires:
      ├── setRouteCoordinates(straight lines) ← visible immediately
      ├── fetchCompleteRouteWithSegments()
      │   ├── Segment 1: cache HIT → instant
      │   ├── Segment 2: cache MISS → API call
      │   └── Segment 3: cache MISS → API call + 500ms delay
      ├── setRouteSegments(real polylines) ← replaces straight lines
      └── fitToCoordinates() ← re-centers map
```

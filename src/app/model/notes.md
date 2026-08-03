# Notes

## Models and translation

- Route:
  - Segment[]
- Segment:
    - starting Waypoint
    - ending Waypoint
    - Track
- Track:
  - Node[]
  - TrackProperties
- Waypoint:
  - startsDay
  - endsDay

GeoJSON:

- FeatureCollection
  - Waypoints Feature
    - geometry: MultiPoint
      - coordinates: Position[]
    - properties:
      - startsDay: bool
      - endsDay: bool
  - Track Features
    - Feature:
      - geometry: LineString
        - coordinates: Position[]
      - properties:
        - SegmentProperties

GeoJSON -> model:
- create segments from waypoint and track features one by one
  - a segments has a starting and ending waypoint, and a track
  - start and end from waypoint feature, track from track feature

model -> GeoJSON:
- extract waypoints from segments
  - start from each waypoint, and the end of the last one
- extract tracks from segments
  - for each segment's track, 

## Splitting

segment 0 has waypoint 0 and 1
segment 1 has waypoint 1 and 2
etc

// splitting segment 1
// initial state
segment 0 - segment 1 - segment 2 - segment 3
wp0    wp1 wp1     wp2 wp2     wp3 wp3    wp4
// first, increment segment indices: 2 -> 3, 3 -> 4 etc
// increment wp indices as well: from index 2, incr. by 1
segment 0 - segment 1 - segment 3 - segment 4
wp0    wp1 wp1     wp2 wp3     wp4 wp4    wp5
// remove segment 1, but steal its wps and increment the end one
segment 0 - segment 3 - segment 4
wp0    wp1 wp3     wp4 wp4    wp5
// insert actual segments (idx 1&2, wp indices 1-2,2-3)
segment 0 - segment 1 - segment 2 - segment 3 - segment 4
wp0    wp1 wp1     wp2 wp2     wp3 wp3     wp4 wp4    wp5

## Event handlers

features:
- select waypoint by clicking
- delete waypoint by selecting and backspace
- move waypoint by dragging
- move segment by dragging

handlers:
- on click: if adding wps, add wp
- on mouseenter waypoint: if not dragging route, make wp bigger, remember that we're hovering wp
- on mouseleave waypoint: if not dragging route, return to original size, reset hovering wp
- on mousedown waypoint: select (make darker), potential wp drag
- on mouseleave waypoint: if potential wp drag, start dragging wp (make half transparent and render marker at cursor)
- on mousemove: if dragging wp, update wp drag, update marker
- on mouseup waypoint: if not dragging route, if same waypoint, cancel (potential) wp drag
- on mouseup: if dragging wp, finish wp drag
- on mouseenter route: if not dragging wp, if not hovering wp, make bigger, render transparent marker at cursor
- on mouseleave route: if not dragging wp, if not hovering wp, make smaller, stop rendering transparent marker
- on mousedown route: if not hovering wp, start dragging route, make transparent marker opaque
- on mousemove: if dragging route, update route drag, update marker
- on mouseup: if dragging route, finish route drag

also add a bigger, invisible route underneath the route that also listens for mouse events!

## New route model

I want a trip to consist of multiple independent routes. These could be alternatives for the same route or completely different hikes altogether.
These routes should be split up into different stages, which would be completed in a day.
One stage should be marked by waypoints, with segments inbetween.

- The interface, for now, has one Trip
- A Trip can have zero or more Routes
- A Route can have zero or more Stages
- A Stage can have zero or more Segments

## Route/stage context menu UI

Needs to have:

- Route:
  - title
  - color
  - description
  - hide action
  - fly to action
  - duplicate action
  - delete action

Color picker needs:

- preset colors
- custom colors

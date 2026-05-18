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

# Notes

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

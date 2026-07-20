# Changelog

All notable changes to Vowloom are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-07-20

### Added

- Interactive custom floorplan editor for venue outlines, internal walls,
  doors, and labels.
- Infinite drawing workspace with zoom, pan, fit-to-view, undo, redo, and
  save-time cropping to the actual drawing.
- Pivot insertion for splitting and reshaping outline edges and internal walls.
- Optional floorplan reference-image upload with adjustable opacity.
- Zoom and pan controls on the seating-plan view.
- First-run room setup with custom drawing and rectangular quick-start choices.
- Floorplan persistence and background-image API endpoints.
- Lucide icons across the interface, including the guest summary cards.
- A dedicated empty state for valid galleries that do not have photos yet.

### Changed

- Doors are rendered as openings in walls instead of standalone door symbols.
- Pages that require a floorplan now direct users to create the room first.
- Fresh installations start with an empty floorplan instead of an assumed venue.
- The optional LAN IP lookup in `deploy.sh` no longer makes an otherwise
  successful deployment report an error.

### Upgrade notes

- Existing saved floorplans are preserved.
- Databases upgrading from the pre-editor release automatically receive an
  editable version of the historical hardcoded SVG room.
- No new environment variables or manual database migration steps are required.

## [1.0.0]

- Initial public release.

[1.1.0]: https://github.com/dev-reedus/vowloom/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/dev-reedus/vowloom/releases/tag/v1.0.0

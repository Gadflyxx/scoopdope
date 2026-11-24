# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html),
and this changelog is maintained going forward: every release and notable change
will be recorded here.

## [Unreleased]

### Added
- `CHANGELOG.md` to track version history and commit to keeping it updated (see #1072).

### Changed
- Releases are now automated via [Release Please](https://github.com/googleapis/release-please).
  Entries in this changelog are generated from [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:` commits produce a minor version bump (listed under **Features**), and
  `fix:` commits produce a patch version bump (listed under **Bug Fixes**).
  Release PRs are auto-merged once CI passes, and a deployment is triggered
  automatically when the release tag is created.

<!--
Template for future entries:

## [x.y.z] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Removed
- ...
-->
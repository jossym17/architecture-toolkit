# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CLI interface with commander.js
- RFC management (create, list, show, update, delete)
- ADR management with supersession tracking
- Decomposition Plan management with phases
- Full-text search across all artifacts
- Template system with export/import
- Input validation and sanitization
- Path traversal protection
- Domain-specific error types
- GitHub Actions CI workflow
- ESLint and Prettier configuration
- Comprehensive test suite

### Security
- Added path traversal protection in FileStore
- Added input validation for all user inputs
- Added ID format validation

## [0.1.0] - 2025-12-12

### Added
- Initial release
- Core domain models (RFC, ADR, DecompositionPlan)
- File-based storage with Markdown/YAML
- ID generation service
- Serialization/deserialization layer
- Validation service
- Reference management service
- Search service with relevance scoring
- Template service

[Unreleased]: https://github.com/jossym17/architecture-toolkit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jossym17/architecture-toolkit/releases/tag/v0.1.0

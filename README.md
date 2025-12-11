# Architecture Documentation Toolkit

A unified system for creating, managing, and maintaining architectural artifacts that senior architects produce in their daily work.

## Overview

The Architecture Documentation Toolkit consolidates RFC (Request for Comments) documents, ADR (Architecture Decision Records), and system decomposition plans into a cohesive workflow with templates, versioning, and cross-referencing capabilities.

## Features

- **RFC Management**: Create and manage RFC documents with standardized templates including problem statements, options analysis, cost models, and rollback plans
- **ADR Tracking**: Document architectural decisions with context, consequences, and alternatives
- **System Decomposition Plans**: Create phased plans for breaking down systems with ownership mapping and migration tasks
- **Cross-Referencing**: Link related artifacts together to trace decisions back to their origins
- **Template Customization**: Define custom templates with required and optional sections
- **Search & Discovery**: Full-text search across all artifacts with filtering capabilities
- **Version Control Friendly**: Markdown files with YAML frontmatter for easy Git integration

## Installation

```bash
npm install architecture-toolkit
```

## Usage

```bash
# Initialize the toolkit in your project
arch init

# Create a new RFC
arch rfc create --title "My RFC Title"

# Create a new ADR
arch adr create --title "My Decision"

# Create a decomposition plan
arch decomp create --title "System Breakdown"

# Search across all artifacts
arch search "event-driven"
```

## File Structure

```
.arch/
├── config.yaml           # Toolkit configuration
├── templates/            # Document templates
├── rfc/                  # RFC documents
├── adr/                  # ADR documents
└── decomposition/        # Decomposition plans
```

## License

MIT

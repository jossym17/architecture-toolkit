# Architecture Documentation Toolkit

[![CI](https://github.com/jossym17/architecture-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/jossym17/architecture-toolkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A unified CLI and library for creating, managing, and maintaining architectural artifacts. Designed for senior architects and engineering teams who need to document technical decisions systematically.

## Features

- **RFC Management** - Create and track Request for Comments documents
- **ADR Management** - Architecture Decision Records with status tracking
- **Decomposition Plans** - System decomposition with phases and team mapping
- **Cross-References** - Link related artifacts together
- **Full-Text Search** - Find artifacts by content, tags, or metadata
- **Template System** - Customizable templates for each artifact type
- **Version Control Friendly** - Markdown files with YAML frontmatter

## Quick Start

```bash
# Install globally
npm install -g architecture-toolkit

# Initialize in your project
arch init

# Create your first RFC
arch rfc create -t "Migrate to Event-Driven Architecture" -o "your.name"

# Create an ADR
arch adr create -t "Use PostgreSQL for Primary Data Store" -o "your.name"

# Search across all artifacts
arch search "architecture"
```

## Installation

```bash
npm install -g architecture-toolkit
```

Or use locally in a project:

```bash
npm install architecture-toolkit
```

## CLI Commands

### Initialize

```bash
arch init                    # Create .arch directory structure
```

### RFC Commands

```bash
arch rfc create -t "Title" -o "owner" [--tags "tag1,tag2"]
arch rfc list [--status draft|review|approved|rejected|implemented]
arch rfc show <id>
arch rfc update <id> [--title "New Title"] [--status review]
arch rfc delete <id>
```

### ADR Commands

```bash
arch adr create -t "Title" -o "owner" [--tags "tag1,tag2"]
arch adr list [--status proposed|accepted|deprecated|superseded]
arch adr show <id>
arch adr update <id> [--status superseded --superseded-by ADR-0002]
arch adr delete <id>
```

### Decomposition Plan Commands

```bash
arch decomp create -t "Title" -o "owner"
arch decomp list
arch decomp show <id>
arch decomp update <id> [--title "New Title"]
arch decomp delete <id>
```

### Search

```bash
arch search "query" [--type rfc|adr|decomposition]
```

### Templates

```bash
arch template list
arch template export <template-id> -o file.json
arch template import file.json
```

### Export

```bash
arch export --list-formats          # List available formats
arch export --format json           # Export to JSON (stdout)
arch export output.csv --format csv # Export to CSV file
arch export report.html --format html # Export to HTML
arch export diagram.mmd --format mermaid # Export Mermaid diagram
```

### Statistics

```bash
arch stats                          # Show artifact statistics
arch stats --type rfc               # Stats for RFCs only
arch stats --json                   # Output as JSON
```

### Plugins

```bash
arch plugin list                    # List all plugins
arch plugin create "My Plugin"      # Create plugin scaffold
arch plugin install plugin.json     # Install custom plugin
arch plugin uninstall my-plugin     # Uninstall plugin
```

### Impact Analysis

```bash
arch analyze impact RFC-0001        # Analyze impact of changing an artifact
arch analyze graph                  # Show dependency graph (text)
arch analyze graph --format mermaid # Export as Mermaid diagram
arch analyze graph --format dot     # Export as GraphViz DOT
arch analyze orphans RFC-0001       # Find orphaned artifacts if deleted
```

### Health Check

```bash
arch health                         # Run health check on all artifacts
arch health --json                  # Output as JSON
arch health --stale-days 60         # Custom stale threshold
```

### Verify Integrity

```bash
arch verify <id>             # Verify single artifact
arch verify all              # Verify all artifacts
arch verify all --type rfc   # Verify all RFCs
```

## Directory Structure

After initialization, your project will have:

```
.arch/
├── config.yaml           # Toolkit configuration
├── templates/            # Custom templates
├── rfc/                  # RFC documents
│   └── RFC-0001.md
├── adr/                  # ADR documents
│   └── ADR-0001.md
└── decomposition/        # Decomposition plans
    └── DECOMP-0001.md
```

## Artifact Format

All artifacts are stored as Markdown with YAML frontmatter:

```markdown
---
id: RFC-0001
type: rfc
title: Migrate to Event-Driven Architecture
status: draft
createdAt: 2025-01-15T10:00:00Z
updatedAt: 2025-01-15T10:00:00Z
owner: senior.architect
tags: [architecture, events]
references: []
---

## Problem Statement

[Content here...]
```

## Programmatic Usage

```typescript
import { RFCService, ADRService, SearchService } from 'architecture-toolkit';

// Create an RFC
const rfcService = new RFCService('./my-project');
await rfcService.initialize();

const rfc = await rfcService.create({
  title: 'My RFC',
  owner: 'developer'
});

// Search artifacts
const searchService = new SearchService(fileStore);
const results = await searchService.search('architecture');
```

## Development

```bash
# Clone the repository
git clone https://github.com/jossym17/architecture-toolkit.git
cd architecture-toolkit

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run CLI locally
node dist/cli/index.js --help
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

# Contributing to Architecture Toolkit

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 18+ (see `.nvmrc`)
- npm 9+

### Getting Started

```bash
# Clone the repository
git clone https://github.com/jossym17/architecture-toolkit.git
cd architecture-toolkit

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

## Development Workflow

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/updates

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting
- `refactor` - Code restructuring
- `test` - Tests
- `chore` - Maintenance

Examples:
```
feat(cli): add interactive mode for rfc create
fix(serialization): handle dates with timezone offset
docs(readme): add CLI usage examples
```

### Code Style

- ESLint and Prettier are configured
- Run `npm run lint` before committing
- Run `npm run format` to auto-format code

### Testing

- Write tests for new features
- Maintain test coverage above 50%
- Run `npm run test:coverage` to check coverage

## Pull Request Process

1. Create a feature branch from `master`
2. Make your changes
3. Ensure tests pass: `npm test`
4. Ensure linting passes: `npm run lint`
5. Update documentation if needed
6. Submit a pull request

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Lint passes
- [ ] Build succeeds
- [ ] Commit messages follow convention

## Project Structure

```
src/
├── cli/           # CLI commands and utilities
├── core/          # Core utilities (errors, validation, logging)
├── models/        # Domain models and types
└── services/      # Business logic services
    ├── adr/       # ADR service
    ├── decomposition/  # Decomposition plan service
    ├── reference/ # Cross-reference service
    ├── rfc/       # RFC service
    ├── search/    # Search service
    ├── serialization/  # Markdown/YAML serialization
    ├── storage/   # File storage
    ├── template/  # Template management
    └── validation/  # Artifact validation
```

## Adding New Features

### Adding a New Artifact Type

1. Create model in `src/models/`
2. Add type to `ArtifactType` in `src/models/types.ts`
3. Create service in `src/services/`
4. Add CLI commands in `src/cli/commands/`
5. Update serializer/deserializer
6. Add tests
7. Update documentation

### Adding a CLI Command

1. Create command file in `src/cli/commands/`
2. Register in `src/cli/index.ts`
3. Add tests
4. Update README with usage examples

## Reporting Issues

- Use GitHub Issues
- Include reproduction steps
- Include Node.js version
- Include error messages/stack traces

## Questions?

Open a GitHub Discussion or Issue.

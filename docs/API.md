# API Documentation

This document describes the programmatic API for the Architecture Toolkit.

## Installation

```typescript
import {
  RFCService,
  ADRService,
  DecompositionPlanService,
  SearchService,
  TemplateService,
  FileStore
} from 'architecture-toolkit';
```

## Services

### RFCService

Manages RFC (Request for Comments) documents.

```typescript
const rfcService = new RFCService('./my-project');
await rfcService.initialize();
```

#### Methods

##### `create(data: CreateRFCData): Promise<RFC>`

Creates a new RFC with auto-generated ID.

```typescript
const rfc = await rfcService.create({
  title: 'Migrate to Event-Driven Architecture',
  owner: 'platform-team',
  tags: ['architecture', 'events'],
  problemStatement: 'Current system has scaling issues...'
});
// Returns: { id: 'RFC-0001', status: 'draft', ... }
```

##### `get(id: string): Promise<RFC | null>`

Retrieves an RFC by ID.

```typescript
const rfc = await rfcService.get('RFC-0001');
```

##### `update(id: string, data: UpdateRFCData): Promise<RFC>`

Updates an existing RFC.

```typescript
const updated = await rfcService.update('RFC-0001', {
  status: 'review',
  title: 'Updated Title'
});
```

##### `delete(id: string): Promise<boolean>`

Deletes an RFC.

```typescript
const deleted = await rfcService.delete('RFC-0001');
```

##### `list(filters?: ArtifactFilters): Promise<RFC[]>`

Lists RFCs with optional filtering.

```typescript
const drafts = await rfcService.list({ status: 'draft' });
const byOwner = await rfcService.list({ owner: 'platform-team' });
```

##### `changeStatus(id: string, status: RFCStatus): Promise<RFC>`

Changes RFC status with timestamp tracking.

```typescript
await rfcService.changeStatus('RFC-0001', 'approved');
```

---

### ADRService

Manages Architecture Decision Records.

```typescript
const adrService = new ADRService('./my-project');
await adrService.initialize();
```

#### Methods

##### `create(data: CreateADRData): Promise<ADR>`

```typescript
const adr = await adrService.create({
  title: 'Use PostgreSQL for Primary Database',
  owner: 'data-team',
  context: 'We need a relational database...',
  decision: 'We will use PostgreSQL...'
});
```

##### `markSuperseded(id: string, supersedingId: string): Promise<ADR>`

Marks an ADR as superseded by another.

```typescript
await adrService.markSuperseded('ADR-0001', 'ADR-0002');
```

---

### DecompositionPlanService

Manages system decomposition plans.

```typescript
const decompService = new DecompositionPlanService('./my-project');
await decompService.initialize();
```

#### Methods

##### `addPhase(planId: string, phase: AddPhaseData): Promise<DecompositionPlan>`

```typescript
await decompService.addPhase('DECOMP-0001', {
  name: 'Phase 2: Core Migration',
  description: 'Migrate core services',
  dependencies: ['phase-001'],
  estimatedDuration: '4 weeks'
});
```

##### `completePhase(planId: string, phaseId: string): Promise<DecompositionPlan>`

Marks a phase complete and unblocks dependent phases.

```typescript
await decompService.completePhase('DECOMP-0001', 'phase-001');
```

##### `addTeamModuleMapping(planId, teamId, teamName, modules): Promise<DecompositionPlan>`

```typescript
await decompService.addTeamModuleMapping(
  'DECOMP-0001',
  'team-platform',
  'Platform Team',
  ['auth', 'users', 'notifications']
);
```

---

### SearchService

Full-text search across all artifacts.

```typescript
const fileStore = new FileStore({ baseDir: '.arch' });
const searchService = new SearchService(fileStore);
```

#### Methods

##### `search(query: string, filters?: SearchFilters): Promise<SearchResult[]>`

```typescript
const results = await searchService.search('event-driven', {
  type: 'rfc',
  dateFrom: new Date('2025-01-01')
});

// Results include relevance score and snippet
results.forEach(r => {
  console.log(`${r.artifact.id}: ${r.score}`);
  console.log(`  ${r.snippet}`);
});
```

##### `reindex(): Promise<void>`

Rebuilds the search index.

```typescript
await searchService.reindex();
```

---

### TemplateService

Manages artifact templates.

```typescript
const templateService = new TemplateService({ baseDir: '.arch' });
```

#### Methods

##### `getDefaultTemplate(type: ArtifactType): Template`

```typescript
const rfcTemplate = templateService.getDefaultTemplate('rfc');
```

##### `createTemplate(data): Template`

```typescript
const custom = templateService.createTemplate({
  id: 'enterprise-rfc',
  name: 'Enterprise RFC',
  artifactType: 'rfc',
  sections: [
    { name: 'problemStatement', required: true, description: '...' },
    { name: 'riskAssessment', required: true, description: '...' }
  ]
});
```

##### `exportTemplate(id: string): string`

Exports template to JSON.

```typescript
const json = templateService.exportTemplate('enterprise-rfc');
```

##### `importTemplate(json: string): TemplateImportResult`

Imports template from JSON.

```typescript
const result = templateService.importTemplate(jsonString);
if (result.success) {
  console.log(`Imported: ${result.template.id}`);
}
```

---

## Types

### ArtifactFilters

```typescript
interface ArtifactFilters {
  status?: string;
  owner?: string;
  dateFrom?: Date;
  dateTo?: Date;
  tags?: string[];
  type?: ArtifactType;
}
```

### ArtifactType

```typescript
type ArtifactType = 'rfc' | 'adr' | 'decomposition';
```

### RFCStatus

```typescript
type RFCStatus = 'draft' | 'review' | 'approved' | 'rejected' | 'implemented';
```

### ADRStatus

```typescript
type ADRStatus = 'proposed' | 'accepted' | 'deprecated' | 'superseded';
```

---

## Error Handling

The toolkit uses domain-specific errors:

```typescript
import {
  ValidationError,
  SecurityError,
  NotFoundError,
  StorageError,
  SerializationError
} from 'architecture-toolkit';

try {
  await rfcService.get('INVALID-ID');
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(`Validation failed: ${error.field}`);
  }
}
```

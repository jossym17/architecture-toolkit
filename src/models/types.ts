// Core type definitions for Architecture Documentation Toolkit

// Artifact Types
export type ArtifactType = 'rfc' | 'adr' | 'decomposition';

// Status Types
export type RFCStatus = 'draft' | 'review' | 'approved' | 'rejected' | 'implemented';
export type ADRStatus = 'proposed' | 'accepted' | 'deprecated' | 'superseded';
export type PhaseStatus = 'pending' | 'in-progress' | 'completed' | 'blocked';
export type TaskStatus = 'todo' | 'in-progress' | 'done';

// Reference Types
export type ReferenceType = 'implements' | 'supersedes' | 'relates-to' | 'depends-on';

// Union type for all artifact statuses
export type ArtifactStatus = RFCStatus | ADRStatus;

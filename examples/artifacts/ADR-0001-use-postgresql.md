---
id: ADR-0001
type: adr
title: Use PostgreSQL as Primary Relational Database
status: accepted
createdAt: 2025-01-10T09:00:00Z
updatedAt: 2025-01-12T16:00:00Z
owner: data-platform-team
tags: [database, postgresql, infrastructure]
references: []
---

## Context

We are building a new order management system that requires:

- ACID transactions for financial data
- Complex queries with joins across multiple tables
- JSON document storage for flexible order metadata
- Full-text search for order lookup
- High availability with automatic failover

### Forces

- Team has strong PostgreSQL expertise
- Need to support 10K transactions per second
- Must integrate with existing data warehouse (Snowflake)
- Budget constraints favor open-source solutions
- Compliance requires data residency in specific regions

## Decision

We will use **PostgreSQL 16** as our primary relational database, deployed on AWS RDS with Multi-AZ configuration.

### Rationale

1. **Feature completeness**: PostgreSQL's JSONB, full-text search, and advanced indexing meet all our requirements in a single database
2. **Team expertise**: 80% of our backend engineers have PostgreSQL experience
3. **Cost efficiency**: Open-source with managed options (RDS) provides good TCO
4. **Ecosystem**: Excellent tooling, extensions (PostGIS, pg_stat_statements), and community support
5. **Performance**: Proven performance at our scale with proper indexing and partitioning

## Consequences

### Positive

- Single database technology reduces operational complexity
- JSONB eliminates need for separate document store
- Strong consistency model simplifies application logic
- Excellent query planner handles complex analytical queries
- Native logical replication to data warehouse

### Negative

- Horizontal scaling requires application-level sharding
- Some team members need training on PostgreSQL-specific features
- Vendor lock-in to AWS RDS for managed features

### Neutral

- Need to establish connection pooling strategy (PgBouncer)
- Must implement proper backup and point-in-time recovery procedures
- Monitoring requires PostgreSQL-specific tooling

## Alternatives Considered

### MySQL 8.0

**Description:** Popular open-source relational database

**Why rejected:**
- Weaker JSON support compared to PostgreSQL
- Less sophisticated query planner
- Team has less MySQL expertise

### Amazon Aurora

**Description:** AWS cloud-native MySQL/PostgreSQL compatible database

**Why rejected:**
- Higher cost at our scale
- Vendor lock-in concerns
- PostgreSQL compatibility mode has some limitations

### CockroachDB

**Description:** Distributed SQL database with automatic sharding

**Why rejected:**
- Higher operational complexity
- Less mature ecosystem
- Overkill for our current scale
- Team would need significant training

## Implementation Notes

- Use RDS db.r6g.2xlarge instances (8 vCPU, 64GB RAM)
- Enable Multi-AZ for high availability
- Configure read replicas for reporting queries
- Implement connection pooling with PgBouncer
- Set up automated backups with 30-day retention

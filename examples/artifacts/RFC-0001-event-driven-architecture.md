---
id: RFC-0001
type: rfc
title: Migrate to Event-Driven Architecture
status: approved
createdAt: 2025-01-15T10:00:00Z
updatedAt: 2025-02-01T14:30:00Z
owner: platform-team
tags: [architecture, events, scalability, microservices]
references:
  - targetId: ADR-0001
    targetType: adr
    referenceType: implements
---

## Problem Statement

### Background
Our current synchronous request-response architecture is reaching its scalability limits. As we've grown to serve 10M+ daily active users, we're experiencing:

- Cascading failures when downstream services are slow
- Tight coupling between services making changes risky
- Difficulty scaling individual components independently

### Current State
- 15 microservices communicating via REST APIs
- Average latency: 450ms for complex operations
- 99th percentile latency: 2.5s during peak hours
- 3-5 incidents per month related to service coupling

### Pain Points
- Teams cannot deploy independently due to API contracts
- Adding new features requires coordinating multiple teams
- Real-time features are difficult to implement

## Success Criteria

1. Reduce 99th percentile latency to under 500ms
2. Achieve zero cascading failures from downstream service issues
3. Enable independent team deployments (< 2 hour deploy cycle)
4. Support real-time event streaming for 1M concurrent connections

## Options Analysis

### Option 1: Apache Kafka
**Description:** Implement Kafka as the central event backbone

**Pros:**
- Industry-proven at massive scale (LinkedIn, Netflix)
- Strong ecosystem and tooling
- Excellent durability guarantees

**Cons:**
- Operational complexity
- Requires dedicated team expertise
- Higher infrastructure cost

**Estimated Cost:** $50K/month infrastructure + 2 FTE
**Estimated Timeline:** 6 months

### Option 2: AWS EventBridge + SNS/SQS
**Description:** Use AWS managed services for event routing

**Pros:**
- Fully managed, low operational overhead
- Native AWS integration
- Pay-per-use pricing

**Cons:**
- Vendor lock-in
- Less flexibility for complex routing
- Limited replay capabilities

**Estimated Cost:** $20K/month (estimated)
**Estimated Timeline:** 4 months

### Option 3: RabbitMQ
**Description:** Deploy RabbitMQ clusters for message routing

**Pros:**
- Flexible routing patterns
- Lower learning curve
- Good for smaller scale

**Cons:**
- Scaling challenges at our volume
- Less suitable for event sourcing
- Requires cluster management

**Estimated Cost:** $15K/month + 1 FTE
**Estimated Timeline:** 5 months

## Recommended Approach

We recommend **Option 1: Apache Kafka** for the following reasons:

1. **Scale requirements**: Our projected growth to 50M DAU requires Kafka's proven scalability
2. **Event sourcing**: Kafka's log-based architecture enables event replay and audit trails
3. **Ecosystem**: Kafka Connect and Kafka Streams provide powerful integration options
4. **Industry alignment**: Most of our peer companies use Kafka, aiding hiring and knowledge sharing

## Migration Path

### Phase 1: Foundation (Weeks 1-4)
- Deploy Kafka cluster in staging
- Implement schema registry
- Create event publishing library
- Train teams on Kafka concepts

### Phase 2: Pilot (Weeks 5-8)
- Migrate notification service to events
- Implement dead letter queues
- Set up monitoring and alerting
- Document patterns and anti-patterns

### Phase 3: Core Services (Weeks 9-16)
- Migrate order processing pipeline
- Implement saga pattern for distributed transactions
- Add event replay capabilities
- Performance testing at scale

### Phase 4: Full Migration (Weeks 17-24)
- Migrate remaining services
- Deprecate synchronous APIs
- Implement CQRS where beneficial
- Final performance optimization

## Rollback Plan

1. **Dual-write period**: All services write to both REST and Kafka for 2 weeks
2. **Feature flags**: Event consumption behind feature flags per service
3. **Fallback routing**: API Gateway can route to REST endpoints if Kafka unavailable
4. **Data reconciliation**: Nightly jobs to verify event/REST consistency

## Security Notes

- All events encrypted in transit (TLS 1.3)
- At-rest encryption for Kafka topics
- RBAC for topic access control
- PII fields encrypted at application level
- Audit logging for all event access

## Cost Model

### Year 1
- Infrastructure: $600K
- Personnel (2 FTE): $400K
- Training: $50K
- **Total: $1.05M**

### Year 2+
- Infrastructure: $720K (growth)
- Personnel (1 FTE maintenance): $200K
- **Total: $920K/year**

### ROI
- Reduced incident costs: $200K/year
- Faster feature delivery: $500K/year (estimated)
- **Payback period: 18 months**

## Timeline

| Milestone | Date | Owner |
|-----------|------|-------|
| RFC Approval | Feb 1, 2025 | Architecture Board |
| Kafka Cluster Ready | Mar 1, 2025 | Platform Team |
| Pilot Complete | Apr 15, 2025 | Platform Team |
| Core Migration | Jul 1, 2025 | All Teams |
| Full Migration | Sep 1, 2025 | All Teams |

## Signoffs

- [x] Platform Team Lead - Jan 28, 2025
- [x] Security Team - Jan 30, 2025
- [x] Infrastructure Team - Jan 31, 2025
- [x] Architecture Board - Feb 1, 2025

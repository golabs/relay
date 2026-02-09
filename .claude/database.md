# HubAI Database Schema Documentation

This document provides a comprehensive reference for the HubAI database schema, including all models, relationships, and
InsuredHQ integration fields.

---

## Table of Contents

1. [Overview](#overview)
2. [Core Models](#core-models)
    - [User](#user)
    - [Session](#session)
    - [Client](#client)
    - [Broker](#broker)
    - [Policy](#policy)
3. [Document & Extraction Models](#document--extraction-models)
4. [Workflow Models](#workflow-models)
5. [AI Models](#ai-models)
6. [InsuredHQ Accounts Models](#insuredhq-accounts-models)
7. [Configuration Models](#configuration-models)
8. [Enums](#enums)
9. [Entity Relationships](#entity-relationships)
10. [Proposed Changes](#proposed-changes)

---

## Overview

- **Database**: PostgreSQL (production), SQLite (development)
- **ORM**: Prisma
- **Timestamps**: All stored as `BigInt` epoch milliseconds
- **IDs**: Mix of `Int` and `BigInt` with `@default(autoincrement())`

---

## Core Models

### User

Authentication and user management.

| Field                | Type    | Description                             |
|----------------------|---------|-----------------------------------------|
| `id`                 | BigInt  | Primary key                             |
| `email`              | String  | User email                              |
| `password`           | String  | Hashed password                         |
| `firstName`          | String  | First name                              |
| `lastName`           | String  | Last name                               |
| `role`               | String  | USER, ADMIN, SUPERVISOR, CLAIMS_HANDLER |
| `department`         | String? | Department                              |
| `avatar`             | String? | Avatar URL                              |
| `voiceTokenLimit`    | Int     | Voice token limit (default: 2000)       |
| `standardTokenLimit` | Int     | Standard token limit (default: 100000)  |
| `voiceUnlimited`     | Boolean | Unlimited voice tokens                  |
| `standardUnlimited`  | Boolean | Unlimited standard tokens               |
| `createdAt`          | BigInt  | Creation timestamp                      |
| `updatedAt`          | BigInt  | Last update timestamp                   |

**Relations:**

- `activities` → Activity[]
- `createdPolicies` → Policy[] (policies created by this user)
- `policies` → Policy[] (policies assigned to this user)
- `comments` → Comment[]
- `sessions` → Session[]
- `assignedTasks` → WorkflowTask[]
- `createdTasks` → WorkflowTask[]
- `completedTasks` → WorkflowTask[]
- `taskComments` → TaskComment[]
- `tokenUsage` → TokenUsage[]

---

### Session

JWT refresh token sessions.

| Field          | Type    | Description          |
|----------------|---------|----------------------|
| `id`           | BigInt  | Primary key          |
| `userId`       | BigInt? | FK to User           |
| `refreshToken` | String  | JWT refresh token    |
| `expiresAt`    | BigInt  | Expiration timestamp |
| `createdAt`    | BigInt  | Creation timestamp   |

**Relations:**

- `user` → User? (onDelete: Cascade)

---

### Client

Insured party details for InsuredHQ integration.

| Field                         | Type    | Description                                 |
|-------------------------------|---------|---------------------------------------------|
| `id`                          | Int     | Primary key                                 |
| `old_id`                      | String? | Legacy ID (unique)                          |
| **InsuredHQ Integration**     |         |                                             |
| `insuredHqClientId`           | String? | InsuredHQ client_id after sync (unique)     |
| **Client Details**            |         |                                             |
| `companyName`                 | String  | Company/business name                       |
| `firstName`                   | String? | Contact first name                          |
| `lastName`                    | String? | Contact last name                           |
| `email`                       | String? | Email address                               |
| `phone`                       | String? | Phone number                                |
| `address`                     | String? | Address                                     |
| **InsuredHQ Required Fields** |         |                                             |
| `branch`                      | String  | InsuredHQ branch ID (default: "1")          |
| `currency`                    | String  | InsuredHQ currency ID (default: "1")        |
| `clientType`                  | String  | InsuredHQ client type (default: "business") |
| `tradeTerms`                  | String  | InsuredHQ trade terms (default: "0 Days")   |
| **Business Registration**     |         |                                             |
| `abn`                         | String? | Australian Business Number                  |
| **Audit**                     |         |                                             |
| `createdAt`                   | BigInt  | Creation timestamp                          |
| `updatedAt`                   | BigInt  | Last update timestamp                       |

**Relations:**

- `policies` → Policy[] (policies where this client is the insured)

**Indexes:**

- `insuredHqClientId`
- `companyName`
- `email`
- `clientType`

---

### Broker

Broker/intermediary details for InsuredHQ integration.

| Field                         | Type    | Description                               |
|-------------------------------|---------|-------------------------------------------|
| `id`                          | Int     | Primary key                               |
| `old_id`                      | String? | Legacy ID (unique)                        |
| **InsuredHQ Integration**     |         |                                           |
| `insuredHqBrokerId`           | String? | InsuredHQ client_id for broker (unique)   |
| **Broker Details**            |         |                                           |
| `companyName`                 | String  | Broker firm name                          |
| `contactPerson`               | String? | Primary contact person                    |
| `firstName`                   | String? | Contact first name                        |
| `lastName`                    | String? | Contact last name                         |
| `email`                       | String? | Email address                             |
| `phone`                       | String? | Phone number                              |
| **Address Fields**            |         |                                           |
| `street`                      | String? | Street address → address1                 |
| `suburb`                      | String? | Suburb/City → city                        |
| `state`                       | String? | State → state                             |
| `postcode`                    | String? | Postcode → post_code                      |
| `country`                     | String? | Country → country                         |
| **InsuredHQ Required Fields** |         |                                           |
| `branch`                      | String  | InsuredHQ branch ID (default: "1")        |
| `currency`                    | String  | InsuredHQ currency ID (default: "1")      |
| `tradeTerms`                  | String  | InsuredHQ trade terms (default: "0 Days") |
| **Business Registration**     |         |                                           |
| `abn`                         | String? | Australian Business Number (tax_number)   |
| **Audit**                     |         |                                           |
| `createdAt`                   | BigInt  | Creation timestamp                        |
| `updatedAt`                   | BigInt  | Last update timestamp                     |

**Relations:**

- `policies` → Policy[] (policies where this broker is intermediary)

**Indexes:**

- `insuredHqBrokerId`
- `companyName`
- `email`

---

### Policy

Core policy/claim model aligned with InsuredHQ conventions.

| Field                      | Type        | Description                                   |
|----------------------------|-------------|-----------------------------------------------|
| `id`                       | Int         | Primary key                                   |
| `old_id`                   | String?     | Legacy ID (unique)                            |
| **Client Reference**       |             |                                               |
| `clientId`                 | Int?        | FK to Client (insured party)                  |
| **Broker Reference**       |             |                                               |
| `brokerId`                 | Int?        | FK to Broker table                            |
| `insuredHqBrokerId`        | String?     | InsuredHQ broker ID (quick access)            |
| **Core Fields**            |             |                                               |
| `policyNumber`             | String?     | Primary identifier (POL-XXXXXXXX)             |
| `insuredName`              | String      | Policyholder/client name (maps to "insured")  |
| `policyType`               | String      | Hull, Cargo, Liability (default: "Cargo")     |
| `lossType`                 | String      | Legacy field (default: "Cargo")               |
| **Policy Dates**           |             |                                               |
| `lossDate`                 | BigInt      | Legacy date field                             |
| `effectiveDate`            | BigInt?     | Policy start date                             |
| `expirationDate`           | BigInt?     | Policy end date                               |
| `createdAt`                | BigInt      | Creation timestamp                            |
| `updatedAt`                | BigInt      | Last update timestamp                         |
| **Financial Fields**       |             |                                               |
| `reserve`                  | Float       | Reserve amount (default: 0)                   |
| `coverageLimit`            | Float?      | Sum insured / coverage limit                  |
| `deductible`               | Float?      | Policy deductible                             |
| `premium`                  | Float?      | Policy premium                                |
| `lossAmount`               | Float?      | Loss amount                                   |
| `currency`                 | String      | Currency code (default: "AUD")                |
| **Status Fields**          |             |                                               |
| `stage`                    | PolicyStage | Open, Declined, Closed                        |
| `priority`                 | Priority    | High, Medium, Low                             |
| **Workflow Fields**        |             |                                               |
| `days`                     | Int         | Days in current stage                         |
| `currentStep`              | Int         | Current workflow step                         |
| `totalSteps`               | Int         | Total workflow steps (7)                      |
| `nextAction`               | String?     | Next required action                          |
| **Description & Location** |             |                                               |
| `description`              | String      | Policy description                            |
| `location`                 | String?     | Risk location                                 |
| `vesselName`               | String?     | For Hull policies                             |
| `voyageDetails`            | String?     | For Cargo policies                            |
| **Broker Information**     |             |                                               |
| `brokerName`               | String?     | Broker company name (maps to "broker")        |
| `brokerContact`            | String?     | Broker contact person                         |
| `brokerEmail`              | String?     | Broker email                                  |
| `brokerPhone`              | String?     | Broker phone                                  |
| `brokerLocation`           | String?     | Broker location                               |
| **Insured Contact**        |             |                                               |
| `insuredEmail`             | String?     | Insured email (maps to "clientEmail")         |
| `insuredPhone`             | String?     | Insured phone (maps to "clientPhone")         |
| `insuredAddress`           | String?     | Insured address                               |
| **Underwriting**           |             |                                               |
| `underwriter`              | String?     | Underwriter name                              |
| `riskClass`                | String?     | Risk classification                           |
| **Extra Data**             |             |                                               |
| `extraData`                | Json        | Additional fields as JSONB (default: {})      |
| **InsuredHQ Integration**  |             |                                               |
| `insuredHqClientId`        | String?     | InsuredHQ client ID for insured               |
| `insuredHqPolicyId`        | String?     | InsuredHQ policy ID                           |
| `brokerAssociated`         | Boolean     | Whether net_broker_id is set (default: false) |
| **System Fields**          |             |                                               |
| `responsibleId`            | BigInt?     | FK to User (responsible)                      |
| `createdById`              | BigInt?     | FK to User (creator)                          |

**Relations:**

- `client` → Client? (onDelete: SetNull)
- `broker` → Broker? (onDelete: SetNull)
- `aiAnalysis` → AIAnalysis[]
- `activities` → Activity[]
- `createdBy` → User?
- `responsible` → User?
- `workflow` → PolicyWorkflow[]
- `documents` → Document[]
- `extractions` → DocumentExtraction[]
- `clientInvoices` → ClientInvoice[]
- `clientPayments` → ClientPayment[]
- `approvedPayments` → ApprovedPayment[]
- `creditorInvoices` → CreditorInvoice[]
- `creditorPayments` → CreditorPayment[]
- `clientInstalments` → ClientInstalment[]
- `creditorInstalments` → CreditorInstalment[]
- `accrualReports` → AccrualReport[]

**Indexes:**

- `clientId`, `brokerId`
- `policyType`, `effectiveDate`, `expirationDate`
- `insuredName`, `priority`, `responsibleId`, `stage`
- `insuredHqClientId`, `insuredHqPolicyId`, `insuredHqBrokerId`

---

## Enums

### PolicyStatus

- `Active` - Policy is active/in-force
- `Expired` - Policy has expired
- `Cancelled` - Policy was cancelled

### Priority

- `High`
- `Medium`
- `Low`

### PolicyStage

- `Open`
- `Declined`
- `Closed`

### WorkflowStatus

- `open`
- `declined`
- `closed`

---

## Entity Relationships

```
User ─┬─< Session
      ├─< Activity
      ├─< Policy (createdBy)
      ├─< Policy (responsible)
      ├─< Comment
      ├─< WorkflowTask (assignee/creator/completer)
      ├─< TaskComment
      └─< TokenUsage

Client ─< Policy (insured party)

Broker ─< Policy (intermediary)

Policy ─┬─< Document ─< DocumentExtraction ─< ExtractedFieldValue
        ├─< AIAnalysis
        ├─< Activity
        ├─< PolicyWorkflow ─< WorkflowStep ─┬─< Comment
        │                                   └─< WorkflowTask ─< TaskComment
        ├─< DocumentExtraction
        ├─< ClientInvoice
        ├─< ClientPayment
        ├─< ApprovedPayment
        ├─< CreditorInvoice
        ├─< CreditorPayment
        ├─< ClientInstalment
        ├─< CreditorInstalment
        └─< AccrualReport

DocumentTypeDefinition ─┬─< AttributeDefinition ─< ExtractedFieldValue
                        └─< DocumentExtraction
```

---

## Notes

- All timestamps are stored as `BigInt` epoch milliseconds
- Legacy `old_id` fields exist for migration compatibility
- InsuredHQ IDs are stored as `String` (they return numeric strings)
- JSONB fields (`extraData`, `extractedFields`) use GIN indexes for search
- Policy table maps to internal "Claim" table for backward compatibility

---

*For full schema details, see `backend/prisma/schema.prisma`*

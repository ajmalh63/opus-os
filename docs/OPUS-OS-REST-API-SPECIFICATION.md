# Opus OS Enterprise REST API Specification (v1)

Welcome to the **Opus OS REST API & Developer Platform** reference manual. This specification defines the external developer API, authentication contracts, idempotency rules, outbound webhook delivery mechanisms, and endpoint schemas across all operational divisions of Opus Overseas.

---

## 1. Gateway Architecture & Environments

| Environment | Base URL | Auth Mechanism |
|---|---|---|
| **Production API Gateway** | `https://app.opusoverseas.com/api/v1` | `Authorization: Bearer opus_live_sk_...` |
| **Local Development** | `http://localhost:8787/api/v1` (or `:5173/api/v1`) | `Authorization: Bearer opus_test_sk_...` |
| **Interactive API Playground** | `https://app.opusoverseas.com/api/v1/docs` | Scalar UI in browser |
| **OpenAPI 3.1 Specification** | `https://app.opusoverseas.com/api/v1/openapi.json` | JSON Schema format |

---

## 2. Authentication & Authorization

All requests to `/api/v1/*` must include a valid **API Key** in the HTTP `Authorization` header.

```http
Authorization: Bearer opus_live_sk_8f7b2c91a0d4e5f6...
```

### Key Security Standards (OWASP APTS-AR-012)
* **Entropy**: Generated using 256-bit cryptographically secure random bytes.
* **Hashing at Rest**: Keys are hashed via **SHA-256** prior to database storage. Plaintext keys are shown **only once** upon generation.
* **Granular Principle of Least Privilege**: Each key is bound to explicit scopes.

### Available Scopes

| Scope Key | Scope Name | Description |
|---|---|---|
| `*` | **Super Admin** | Unrestricted access across all endpoints and key management. |
| `leads:read` | **Leads Reader** | Query and filter incoming leads across divisions. |
| `leads:write` | **Leads Writer** | Ingest new leads from external forms, ad campaigns, and bots. |
| `clients:read` | **Client 360 Reader** | View comprehensive client application histories and engagements. |
| `clients:write` | **Client Stage Manager** | Advance client pipeline stages and attach CRM notes. |
| `study-abroad:read` | **Study Abroad Reader** | Execute live profile match calculations and view university applications. |
| `study-abroad:write` | **Study Abroad Writer** | Create student university application snapshots. |
| `visa:read` | **Visa Cases Reader** | List active visa cases, appointment schedules, and checklists. |
| `visa:write` | **Visa Cases Writer** | Update consular checklist milestones and visa granting status. |
| `umrah:read` | **Umrah Inventory Reader** | Query package pricing tiers and group departure seat counts. |
| `umrah:write` | **Umrah Booking Writer** | Reserve party/family seats with automatic 24-hour hold windows. |
| `attestation:read` | **Attestation Rate Reader** | Query indicative country rate cards and SLA turnarounds. |
| `attestation:write` | **Attestation Order Writer** | Submit document attestation orders. |
| `recruitment:read` | **Recruitment Reader** | Query active overseas job demands and vacancies. |
| `recruitment:write` | **Recruitment Writer** | Publish employer job requirements to the network. |
| `bookings:read` | **Appointments Reader** | Query Cal.com 1-on-1 consultation bookings. |
| `bookings:write` | **Appointments Manager** | Mark attendance status (`completed`, `no_show`). |
| `payments:read` | **Ledger Reader** | Inspect payments, invoices, and Razorpay links. |
| `documents:read` | **Vault Reader** | Query client certificate uploads in R2. |
| `documents:write` | **Vault Verifier** | Mark uploaded documents `verified` or `rejected`. |
| `partners:read` | **Affiliate Reader** | Query active partner referral codes and commission links. |
| `messages:write` | **WhatsApp Dispatcher** | Send real-time outbound WhatsApp messages via OpenWA. |
| `webhooks:manage` | **Webhook Manager** | Subscribe and delete external webhook listeners. |

---

## 3. Core Enterprise Standards

### A. Stripe-Grade Idempotency (`Idempotency-Key` Header)
To prevent accidental duplicate creation (e.g. double-creating leads or duplicate Umrah seat reservations due to network retry), include an `Idempotency-Key` header on mutating requests (`POST`, `PUT`, `PATCH`).

```http
POST /api/v1/leads HTTP/1.1
Host: app.opusoverseas.com
Authorization: Bearer opus_live_sk_...
Idempotency-Key: 7b8c2d10-4e3a-4f51-8d2a-1c0b9a8e7d6f
Content-Type: application/json
```

* **Behavior**: If a request succeeds and is subsequently retried with the identical key and payload within 24 hours, Opus OS returns the cached HTTP response with the header **`X-Idempotent-Replay: true`**.
* **Payload Mismatch Defense**: If a key is reused with a *different* request payload, the API returns **`409 Conflict`**.

---

### B. Rate Limiting
Each API Key is enforced with a **Token-Bucket Rate Limiter** (default: 120 requests/minute). When exceeded:
* **HTTP Status**: `429 Too Many Requests`
* **Response Header**: `Retry-After: 60`

---

### C. Standard Response Formats

#### Success Response (`200 OK` / `201 Created`)
```json
{
  "success": true,
  "data": { ... },
  "pagination": { "limit": 50, "offset": 0, "count": 1 }
}
```

#### Error Response (`400`, `401`, `403`, `404`, `409`, `429`, `500`)
```json
{
  "error": "Validation Error",
  "message": "Missing required field 'phone'.",
  "code": "VALIDATION_FAILED"
}
```

---

## 4. Endpoints Reference by Module

---

### 🎓 1. Study Abroad & Admissions

#### `POST /api/v1/study-abroad/match`
Calculate live profile eligibility score (0–100) and categorize into **Match**, **Reach**, or **Safe** tiers against university admission matrices.

* **Required Scope**: `study-abroad:read`
* **Request Body**:
```json
{
  "gpa": 8.4,
  "ielts": 7.0,
  "targetCountry": "United Kingdom",
  "tuitionBudgetLakhs": 22
}
```
* **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "tier": "match",
    "score": 92,
    "reasons": [
      "CGPA 8.4 satisfies UK Tier-1 minimum requirement (6.5)",
      "IELTS 7.0 clears direct postgraduate admission threshold"
    ],
    "misses": []
  }
}
```

#### `GET /api/v1/study-abroad/applications`
List university application snapshots with status filters.

* **Required Scope**: `study-abroad:read`
* **Query Parameters**: `clientId` (optional)

#### `POST /api/v1/study-abroad/applications`
Create a new university application snapshot for a student.

* **Required Scope**: `study-abroad:write`
* **Request Body**:
```json
{
  "clientId": "OP-2026-1049",
  "universityName": "University of Birmingham",
  "programName": "MSc Advanced Computer Science",
  "targetCountry": "United Kingdom",
  "targetIntake": "Fall 2026"
}
```

---

### ✈️ 2. Visas & Immigration

#### `GET /api/v1/visas/applications`
List active visa filings across tourist, student, and work categories.

* **Required Scope**: `visa:read`
* **Query Parameters**: `clientId` (optional)

#### `PATCH /api/v1/visas/applications/:id/status`
Update the status of a visa case (e.g. `document_prep`, `slot_booked`, `granted`, `rejected`).

* **Required Scope**: `visa:write`
* **Request Body**:
```json
{
  "status": "granted"
}
```

---

### 🕋 3. Umrah Pilgrimage & Travel

#### `GET /api/v1/umrah/packages`
Browse active wholesale and retail package catalog with hotel star ratings and room sharing tiers.

* **Required Scope**: `umrah:read`

#### `GET /api/v1/umrah/departures`
List upcoming scheduled group departures with real-time remaining seat capacity.

* **Required Scope**: `umrah:read`
* **Response (`200 OK`)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "DEP-2026-NOV-15",
      "packageId": "PKG-PREMIUM-15D",
      "title": "15-Day Premium Executive Hyderabad Departure",
      "departureDate": "2026-11-15",
      "endDate": "2026-11-30",
      "departureCity": "Hyderabad",
      "airline": "Saudia",
      "capacity": 30,
      "bookedSeats": 18,
      "availableSeats": 12,
      "status": "open"
    }
  ]
}
```

#### `POST /api/v1/umrah/bookings`
Create a party/family booking and hold seats with a 24-hour window.

* **Required Scope**: `umrah:write`
* **Request Body**:
```json
{
  "clientId": "OP-2026-8831",
  "departureId": "DEP-2026-NOV-15",
  "roomConfig": "quad",
  "passengers": [
    { "name": "Mohammed Farooq", "category": "adult" },
    { "name": "Amina Farooq", "category": "adult" },
    { "name": "Zaid Farooq", "category": "child_with_bed" }
  ]
}
```

---

### 📜 4. Document Attestation & Apostille

#### `GET /api/v1/attestation/rate-cards`
List indicative pricing and SLA turnarounds by destination country and category.

* **Required Scope**: `attestation:read`
* **Query Parameters**: `country` (optional, e.g. `UAE`, `Saudi Arabia`, `Qatar`)

#### `POST /api/v1/attestation/orders`
Submit a certificate attestation order.

* **Required Scope**: `attestation:write`
* **Request Body**:
```json
{
  "clientId": "OP-2026-1049",
  "destinationCountry": "UAE",
  "category": "educational",
  "documentType": "degree"
}
```

---

### 💼 5. Overseas Recruitment & Manpower

#### `GET /api/v1/recruitment/jobs`
List open verified job vacancies in Gulf and European markets.

* **Required Scope**: `recruitment:read`
* **Query Parameters**: `country`, `sector`

#### `POST /api/v1/recruitment/jobs`
Publish an overseas employer job posting.

* **Required Scope**: `recruitment:write`
* **Request Body**:
```json
{
  "title": "Registered Nurse (ICU)",
  "country": "Saudi Arabia",
  "sector": "Healthcare & Nursing",
  "salaryText": "SAR 6,500 - 8,000 / month (Tax-Free)",
  "vacancies": 5,
  "employer": "King Fahad Specialist Hospital"
}
```

---

### 👥 6. CRM & Leads Intake

#### `GET /api/v1/leads`
Query incoming leads with division filters and pagination.

* **Required Scope**: `leads:read`
* **Query Parameters**: `division` (`study-abroad`, `visa`, `umrah`, `attestation`, `manpower`), `limit`, `offset`

#### `POST /api/v1/leads`
Create a new lead with automated Client Token generation and stage initialization.

* **Required Scope**: `leads:write`
* **Request Body**:
```json
{
  "name": "Sarah Khan",
  "phone": "+919876543210",
  "email": "sarah.khan@example.com",
  "division": "study-abroad",
  "notes": "Looking for Fall 2026 intake in Ireland"
}
```

#### `GET /api/v1/clients/:id`
Fetch complete Client 360 profile, active engagements, and task progress.

* **Required Scope**: `clients:read`

#### `PATCH /api/v1/clients/:id/stage`
Advance a client's pipeline stage with tamper-evident audit logging.

* **Required Scope**: `clients:write`
* **Request Body**:
```json
{
  "stageKey": "offer_letter",
  "notes": "Unconditional offer letter verified"
}
```

---

### 📅 7. Consultation Bookings (Cal.com)

#### `GET /api/v1/bookings`
List 1-on-1 scheduled appointments across counselors.

* **Required Scope**: `bookings:read`
* **Query Parameters**: `division`, `status`

#### `PATCH /api/v1/bookings/:id/status`
Update appointment completion status (`completed`, `no_show`, `cancelled`).

* **Required Scope**: `bookings:write`

---

### 💰 8. Finance & Invoicing

#### `GET /api/v1/payments`
Query the billing ledger, GST breakdowns, and Razorpay payment link records.

* **Required Scope**: `payments:read`
* **Query Parameters**: `clientId`, `status` (`draft`, `confirmed`, `paid`, `synced`)

---

### 📁 9. Document Vault

#### `GET /api/v1/documents`
List client uploaded documents in Cloudflare R2 with verification statuses.

* **Required Scope**: `documents:read`
* **Query Parameters**: `clientId` (required)

#### `PATCH /api/v1/documents/:id/verify`
Mark a document `verified` or `rejected`.

* **Required Scope**: `documents:write`
* **Request Body**:
```json
{
  "status": "verified"
}
```

---

### 💬 10. WhatsApp & Omnichannel Messaging

#### `POST /api/v1/messages/whatsapp`
Dispatch real-time outbound WhatsApp message to a client via OpenWA.

* **Required Scope**: `messages:write`
* **Request Body**:
```json
{
  "phone": "+919876543210",
  "text": "Hello Sarah, your admission offer letter from Birmingham is ready in your portal!"
}
```

---

### 🤝 11. Partner & Affiliate Network

#### `GET /api/v1/partners`
List active affiliate partners, referral codes, and tracking links.

* **Required Scope**: `partners:read`

---

### 🔐 12. Super Admin API Key Governance

#### `GET /api/v1/keys`
List active API keys (masked with first 12 characters).

* **Required Scope**: `*`

#### `POST /api/v1/keys`
Generate a new high-entropy API key with custom scopes and rate limits.

* **Required Scope**: `*`
* **Request Body**:
```json
{
  "name": "Zapier Lead Automation",
  "environment": "live",
  "scopes": ["leads:write", "clients:read"],
  "rateLimitPerMinute": 180,
  "expiresInDays": 365
}
```

#### `DELETE /api/v1/keys/:id`
Instantly revoke an API key.

* **Required Scope**: `*`

---

## 5. Outbound Webhooks Delivery (HMAC-SHA256)

Opus OS broadcasts real-time events to external webhooks whenever data changes.

### Real-Time Event Catalogue
* `lead.created`
* `client.stage_changed`
* `study_abroad.application_created`
* `visa.status_changed`
* `umrah.booking_created`
* `attestation.order_created`
* `recruitment.job_created`
* `booking.status_changed`
* `document.verified`

### Webhook Delivery Headers
* `Content-Type: application/json`
* `User-Agent: OpusOS-Webhook/1.0`
* `X-Opus-Event: lead.created`
* `X-Opus-Delivery-Id: del_1787238000_a8f9b2c1`
* `X-Opus-Signature: t=1787238000,v1=9f8e7d6c5b4a3...`

### Verifying Signatures

#### Node.js / JavaScript Example
```javascript
import crypto from 'crypto';

export function verifyOpusWebhook(rawBody, signatureHeader, secret) {
  const parts = signatureHeader.split(',');
  const timestamp = parts.find(p => p.startsWith('t=')).split('=')[1];
  const signature = parts.find(p => p.startsWith('v1=')).split('=')[1];

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(expectedSignature, 'utf8')
  );
}
```

#### Python Example
```python
import hmac
import hashlib

def verify_opus_webhook(raw_body: str, signature_header: str, secret: str) -> bool:
    pairs = dict(item.split("=") for item in signature_header.split(","))
    timestamp = pairs.get("t")
    signature = pairs.get("v1")
    
    payload = f"{timestamp}.{raw_body}".encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    
    return hmac.compare_digest(signature, expected)
```

---

## 6. Testing & Support

* **Interactive Explorer**: [`https://app.opusoverseas.com/api/v1/docs`](https://app.opusoverseas.com/api/v1/docs)
* **OpenAPI Raw Spec**: [`https://app.opusoverseas.com/api/v1/openapi.json`](https://app.opusoverseas.com/api/v1/openapi.json)
* **Technical Inquiries**: `support@opusoverseas.com`

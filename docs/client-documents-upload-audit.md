# Documents Upload Modal — Client Workspace Audit (2026-08-22)

**Question:** Is the documents upload modal available in the client's workspace wherever applicable?

**Answer:** **YES in 4/5 divisions, GAP in Umrah** — detailed per-division below. All uploads use presigned PUT (HMAC `BETTER_AUTH_SECRET`, 15-min expiry, magic-byte sniff via `guardUpload`) and then publish `DOCUMENT_UPLOADED` → `client:{id}:documents` + `staff:global:alerts` (wired 2026-08-22).

## Per-Division Availability

| Division | Client UI File | Upload Modal? | How it Works | Sync Wired? |
|----------|----------------|---------------|--------------|-------------|
| **Study Abroad** | `StudyAbroadClientSection.tsx` (tabs: `profile`/`applications`/`documents`) | **YES** — full vault | `POST /applications/:id/docs/:key/presigned?token=` → `PUT /documents/upload?token=&filename=&expires=&signature=&appId=&docKey=&label=` → checklist auto `received` → staff `verified` shows instantly. `uploadDoc()` line 129, `<input type=file>` line 288 + "Other documents" label line 313. | YES — `portal.ts` DOC_UPLOAD + `studyAbroadApps.ts` generic |
| **Visa Services** | `ClientPortal.tsx` → `VisaServices` (inside `ClientPortal.tsx:1745`) + `VisaPrepPortal.tsx` staff | **YES** — full vault | `uploadDoc(docName,file)` → `GET /api/public/portal/documents/presigned?token=&filename=` → `PUT` raw binary → version `v1.0→vX`. UI: `Upload Document` / `Replace` / `Re-upload` on tracker + per-requiredDoc list (2368, 2375). Staff `VisaPrepPortal` has verification panel `All Uploaded Files` (1344) + `View` link. | YES — same `portal.ts` channel + `clients.ts` `DOCUMENT_VERIFIED` |
| **Attestation** | `AttestationClientSection.tsx` + `AttestationPortal.tsx` staff | **PARTIAL → YES** | Client: `Document scan (helps us quote faster — optional)` line 212 + `uploadAppDoc()` staff side `POST /applications/:id/document/presigned` (598) and client `POST /applications/:id/document/presigned?token=` (721) — scan is optional, originals sent via pickup `bookCourier`. Staff `AttestationPortal` has `Upload` span (856) per app. So client CAN upload scan, but flow expects originals via courier. | YES — portal `DOCUMENT_UPLOADED` covers it |
| **Manpower / Jobs** | `ClientPortal.tsx` → `ManpowerJobs` (line 2685) + `ManpowerPortal.tsx` staff | **YES** — resume + profile | `uploadResume(file)` → `FormData(token,resume)` → `/api/public/portal/manpower` resumeKey, plus membership VAS. `ManpowerPortal` staff list shows profile completeness. | YES — same portal channel |
| **Umrah Travel** | `UmrahClientSection.tsx` | **NO — GAP** | Umrah client shows `Required Documents` list (626 docs from `documentsJson`) but **no `<input type=file>`**. Staff `UmrahPortal.tsx` has manifest checklist `umrahChecklists` (passportScanned, visaIssued etc.) but client cannot self-upload. Compare: StudyAbroad has 2 upload inputs, Visa has 2, Attestation has 1, Manpower has 1, Umrah has 0. | Gap — needs dev |
| **Generic Vault (all divisions)** | `ClientPortal.tsx` + `ClientDashboardHub.tsx` vault tab + `Client360.tsx` staff vault | **YES** — generic fallback | `ClientPortal` quick file upload (977 `presigned?token=&filename=`) + 2 bulk upload helpers (1128, 1295) for any `docName`. `ClientDashboardHub` vault id `documents` (52) → `Open Document Vault` (559) navigates to `vault` tab. Staff `Client360` has `Document Vault` upload (1564). | YES |

## Evidence Snippets

- StudyAbroad: `StudyAbroadClientSection.tsx:288` `<input type="file" ... onChange={(e)=>uploadDoc(app.id, key, f)} />` + `265 tab === 'documents'`
- Visa: `ClientPortal.tsx:1930` `fetch(/api/public/portal/documents/presigned?token=...)` + `2368 Upload Document`
- Manpower: `ClientPortal.tsx:2742` `uploadResume` `fd.append('resume', file)` + `fd.append('token', token)`
- Attestation: `AttestationClientSection.tsx:212` scan label + `AttestationPortal.tsx:856` upload span
- Umrah: `grep -c "type=\"file\""` in `UmrahClientSection.tsx` = 0 (no upload), only `parseJson(detail.documentsJson)` display
- Portal API: `portal.ts:322` `GET /documents/presigned` + `346` `PUT /documents/upload` (HMAC, guardUpload, R2 put, `staffAlert` + now `publishSyncEvent`)

## Gap & Fix — Umrah Client Vault

**Impact:** Umrah clients must WhatsApp/email passport scans to staff → staff manually uploads to `Client360` vault → delay + no checklist sync. Breaks Umrah gold standard (documentsJson checklist).

**Proposed fix (copy StudyAbroad pattern, 30 min):**

In `UmrahClientSection.tsx` → add after `documents` list (626) or in tracker `bookings` cards:

```tsx
import { useDropzone } from '...'; // or simple input
const uploadUmrahDoc = async (file:File, label?:string) => {
  const pRes = await fetch(`/api/public/portal/documents/presigned?token=${token}&filename=${encodeURIComponent(file.name)}`);
  const { url } = await pRes.json();
  await fetch(url, { method:'PUT', body: await file.arrayBuffer() });
  queryClient.invalidateQueries({queryKey:['portalUmrahMyBookings']});
  alert('✓ Document uploaded — our team will verify it shortly.');
};
// in JSX where documents.map:
{documents.map(d => <li>{d}</li>)}
<div className="mt-3">
  <label className="cursor-pointer bg-brand-gold/15 text-brand-gold px-3 py-2 rounded-lg text-[10px] font-bold">
    📎 Upload Document for this booking
    <input type="file" className="hidden" accept=".pdf,.jpg,.png,.webp" onChange={e=>{const f=e.target.files?.[0]; if(f) uploadUmrahDoc(f);}} />
  </label>
</div>
```

Backend already handles generic vault — no D1 change, just reuses `portal.ts` same `client:{id}:documents` channel (already wired). Add `UmrahClientSection` upload → staff sees live via `staff:global:alerts` `DOCUMENT_UPLOADED`.

**Alternative:** Link to existing generic vault tab in `ClientPortal.tsx` (already works for Umrah as fallback) — but Umrah tab itself should have inline upload for UX parity.

## Sync Coverage

All client uploads (where available) already publish:
- `client:{id}:documents` `DOCUMENT_UPLOADED` → client vault invalidates live
- `staff:global:alerts` `DOCUMENT_UPLOADED` → staff `AlertsVisibility` bell + `Client360` vault refresh

Umrah after fix will use same 2 channels (no new channel needed).

## Recommendation

- **Keep as is:** StudyAbroad, Visa, Attestation (scan), Manpower
- **Implement now:** Umrah inline upload (above snippet) — aligns all 5 divisions to same vault UX + completes sync fabric parity
- **No extra modal needed:** Generic `ClientPortal` vault already covers edge cases, but division-specific inline is better for conversion


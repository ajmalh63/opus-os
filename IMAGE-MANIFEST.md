# IMAGE MANIFEST — OpusOverseas Public Site

Every visual slot renders a placeholder (styled box + shimmer + caption) carrying the
ready-to-use prompt below. Generate images with any tool (Midjourney / DALL·E / Firefly /
stock), export to `apps/app/public/img/`, then set `src` in `apps/app/src/config/images.ts`
under the matching key — **zero component changes needed**.

Suggested style sheet for consistency:
> "Premium editorial photography · deep navy (#0a2d50) & gold (#d7a019) color grade ·
> warm golden light · shallow depth of field · luxury consultancy brand tone"

---

## Homepage

| Key | Ratio | Prompt |
|---|---|---|
| `hero-study-abroad` | 16:9 | Cinematic wide shot of a happy South-Asian graduate student in a navy gown walking across a historic UK university quad at golden hour, warm amber and deep navy tones, shallow depth of field, editorial photography |
| `hero-visa` | 16:9 | A sleek boarding pass and passport with a golden visa stamp resting on dark navy linen, soft studio light, luxury travel editorial photography, shallow DOF |
| `hero-umrah` | 16:9 | Serene low-angle view of the Kaaba at dusk with warm lantern glow and soft haze, reverent and calm, cinematic color grade with gold and deep blue |
| `hero-attestation` | 16:9 | Close-up of official documents with a gold embassy seal and red apostille ribbon being pressed by a stamp, navy desk surface, premium legal editorial photography |
| `hero-manpower` | 16:9 | Confident Indian construction engineer and healthcare nurse standing on a modern city rooftop at sunrise holding a hard hat, hopeful and aspirational, warm golden light |
| `about-office` | 4:3 | Modern boutique consultancy office interior in warm cream and navy tones with a gold-brass branded wall, sunlight through large windows, premium interior photography |
| `services-grid` | 3:2 | Collage-style editorial photo grid of studying, boarding a plane, holy travel, document stamping and a career handshake — cohesive navy-gold palette |
| `testimonial-1` | 1:1 | Warm portrait of a smiling Indian female masters student on a European campus with blurred autumn trees behind, soft golden light, premium editorial portrait |
| `testimonial-2` | 1:1 | Portrait of a relieved Indian professional couple holding approved visa passports at an airport, smiling, warm natural light, premium editorial portrait |
| `testimonial-3` | 1:1 | Joyful elderly Indian couple in simple white Ihram attire smiling softly, warm light, dignified and calm, premium editorial portrait |

## Division pages (same 5 hero keys reused by `Img` in service cards)

Each division page will reuse `hero-<division>` art at 16:9 and add:
- `study-abroad-campus` 16:9 — Indian students group photo outside a US/UK campus admissions office, golden hour
- `visa-stamp-closeup` 4:3 — extreme close-up of a fresh visa vignette stamp, gold light
- `umrah-makkah` 16:9 — Makkah skyline at twilight from the hotel view, warm glow
- `attestation-desk` 4:3 — official notarized documents with seals on a desk
- `recruitment-site` 16:9 — overseas industrial/healthcare worksite with workers in branded gear

## Lead form
- `lead-form-side` 4:3 — warm, reassuring consultation scene: counselor and student talking across a desk with documents, golden window light

---

### How to add a real image
1. Save file → `apps/app/public/img/<key>.webp` (compress: aim < 120 KB).
2. In `apps/app/src/config/images.ts` set `src: '/img/<key>.webp'` on the entry.
3. Done — `<Img>` renders the real photo automatically (lazy-loaded, object-cover).

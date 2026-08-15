// IMAGE VAULT — single source of truth for every visual slot on the public site.
// Each entry: key → { prompt, ratio, label }.
// Set `src` to a real file path (e.g. '/img/hero-study.webp') once artwork is
// generated — the Img component swaps placeholders for real images with zero
// component changes. Full prompt list also mirrored in /IMAGE-MANIFEST.md.

export interface ImageSpec {
  prompt: string;
  ratio?: '16/9' | '4/3' | '3/2' | '1/1';
  label?: string;
  src?: string;
}

export const IMAGES: Record<string, ImageSpec> = {
  'hero-study-abroad': {
    label: 'Study Abroad Hero',
    ratio: '16/9',
    src: '/img/hero-study-abroad.jpg',
    prompt:
      'Cinematic wide shot of a happy South-Asian graduate student in a navy gown walking across a historic UK university quad at golden hour, warm amber and deep navy tones, shallow depth of field, editorial photography, 16:9',
  },
  'hero-visa-services': {
    label: 'Visa Services',
    ratio: '16/9',
    src: '/img/hero-visa-services.jpg',
    prompt:
      'A sleek boarding pass and passport with a golden visa stamp resting on dark navy linen, soft studio light, luxury travel editorial photography, shallow DOF, 16:9',
  },
  'hero-umrah-travel': {
    label: 'Umrah & Travel',
    ratio: '16/9',
    src: '/img/hero-umrah-travel.jpg',
    prompt:
      'Serene low-angle view of the Kaaba at dusk with warm lantern glow and soft haze, reverent and calm, cinematic color grade with gold and deep blue, 16:9 editorial photography',
  },
  'hero-attestation': {
    label: 'Attestation',
    ratio: '16/9',
    src: '/img/hero-attestation.jpg',
    prompt:
      'Close-up of official documents with a gold embassy seal and red apostille ribbon being pressed by a stamp, navy desk surface, premium legal editorial photography, 16:9',
  },
  'hero-recruitment': {
    label: 'Global Careers',
    ratio: '16/9',
    src: '/img/hero-recruitment.jpg',
    prompt:
      'Confident Indian construction engineer and healthcare nurse standing on a modern city rooftop at sunrise holding a hard hat, hopeful and aspirational, warm golden light, 16:9 editorial photography',
  },
  'about-office': {
    label: 'Our Office',
    ratio: '4/3',
    prompt:
      'Modern boutique consultancy office interior in warm cream and navy tones with a gold-brass branded wall, sunlight through large windows, premium interior photography, 4:3',
  },
  'services-grid': {
    label: 'Services',
    ratio: '3/2',
    prompt:
      'Collage-style editorial photo grid of studying, boarding a plane, holy travel, document stamping and a career handshake — cohesive navy-gold palette, premium brand photography, 3:2',
  },
  'testimonial-1': {
    label: 'Student Story',
    ratio: '1/1',
    prompt:
      'Warm portrait of a smiling Indian female masters student on a European campus with blurred autumn trees behind, soft golden light, premium editorial portrait, square',
  },
  'testimonial-2': {
    label: 'Visa Success',
    ratio: '1/1',
    prompt:
      'Portrait of a relieved Indian professional couple holding approved visa passports at an airport, smiling, warm natural light, premium editorial portrait, square',
  },
  'testimonial-3': {
    label: 'Umrah Journey',
    ratio: '1/1',
    prompt:
      'Joyful elderly Indian couple in simple white Ihram attire smiling softly, warm light, dignified and calm, premium editorial portrait, square',
  },
};

export function imageFor(key: string): ImageSpec {
  return IMAGES[key] ?? { prompt: 'Placeholder image', label: 'Image' };
}
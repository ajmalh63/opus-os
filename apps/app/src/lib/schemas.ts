export const BASE_ORGANIZATION_SCHEMA = {
  '@type': ['EducationalOrganization', 'LocalBusiness', 'TravelAgency', 'EmploymentAgency'],
  '@id': 'https://opusoverseas.com/#organization',
  name: 'Opus Overseas',
  alternateName: ['Opus Overseas Consultants', 'Opus Global Services'],
  url: 'https://opusoverseas.com',
  logo: 'https://opusoverseas.com/logo.png',
  image: 'https://opusoverseas.com/og-image.png',
  description: 'Premier global consultancy for study abroad admissions, visa processing, document attestation, Tours & Travels (world holidays & Umrah), and international manpower recruitment.',
  telephone: '+919398848376',
  email: 'contact@opusoverseas.com',
  priceRange: '$$',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '',
    addressLocality: 'Nizamabad',
    addressRegion: 'Telangana',
    postalCode: '',
    addressCountry: 'IN',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 18.6657,
    longitude: 77.8872,
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: '09:30',
      closes: '18:30',
    },
  ],
  areaServed: [
    { '@type': 'Country', name: 'India' },
    { '@type': 'Country', name: 'United Kingdom' },
    { '@type': 'Country', name: 'United States' },
    { '@type': 'Country', name: 'Canada' },
    { '@type': 'Country', name: 'Germany' },
    { '@type': 'Country', name: 'Australia' },
    { '@type': 'Country', name: 'Saudi Arabia' },
    { '@type': 'Country', name: 'United Arab Emirates' },
    { '@type': 'Country', name: 'Qatar' },
    { '@type': 'Country', name: 'Kuwait' },
  ],
  sameAs: [
    'https://www.facebook.com/opusoverseas',
    'https://www.instagram.com/opusoverseas',
    'https://www.linkedin.com/company/opusoverseas',
  ],
};

export function getBreadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: `https://opusoverseas.com${item.path.startsWith('/') ? item.path : `/${item.path}`}`,
    })),
  };
}

export function getFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function getServiceSchema({
  name,
  description,
  serviceType,
  path,
}: {
  name: string;
  description: string;
  serviceType: string;
  path: string;
}) {
  return {
    '@type': 'Service',
    '@id': `https://opusoverseas.com${path}#service`,
    name,
    description,
    serviceType,
    url: `https://opusoverseas.com${path}`,
    provider: {
      '@id': 'https://opusoverseas.com/#organization',
    },
    termsOfService: 'https://opusoverseas.com/terms',
  };
}

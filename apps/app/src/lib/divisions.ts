import { useQuery } from '@tanstack/react-query';

// Division availability (business-operations gating).
// Single source of truth: GET /api/public/divisions (server enforces too —
// this hook only drives UI visibility). Defaults to ENABLED while unknown so
// existing users never see a flash of "coming soon" during load.

export const DIVISION_KEYS = ['study-abroad', 'visa', 'umrah', 'attestation', 'manpower'] as const;
export type DivisionKey = (typeof DIVISION_KEYS)[number];

export interface DivisionsPayload {
  enabled: Record<string, boolean>;
  list: string[];
}

export function useDivisions() {
  const q = useQuery<DivisionsPayload>({
    queryKey: ['divisions-enabled'],
    queryFn: async () => {
      const res = await fetch('/api/public/divisions', { credentials: 'include', });
      if (!res.ok) throw new Error('Failed to load division availability');
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const enabled = q.data?.enabled ?? null;
  const isEnabled = (key: string): boolean => (enabled === null ? true : !!enabled[key]);
  return { ...q, enabled, isEnabled };
}
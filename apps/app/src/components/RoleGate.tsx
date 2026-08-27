import type { ReactNode } from 'react';
import { useSession } from '../lib/session';

// RoleGate: shows children only to allowed roles; otherwise a styled "no
// access" state. Client-side mirror only - the server enforces real 403s.
export default function RoleGate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { me } = useSession();
  if (!me || !roles.includes(me.role)) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto w-fit rounded-full border border-rose-800/50 bg-rose-50 px-3 py-1 text-[13px] font-bold uppercase tracking-wider text-rose-600">
            Access limited
          </div>
          <p className="mt-4 text-sm text-slate-600">
            This surface is reserved for owners. If you believe this is an error, ask the owner to review your role.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
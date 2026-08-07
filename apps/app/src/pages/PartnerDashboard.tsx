import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';

interface CommissionEntry {
  id: string;
  referralId: string;
  amount: number; // in paise
  status: 'unmatured' | 'matured' | 'paid' | 'held';
  createdAt: number;
}

interface CommissionLedgerResponse {
  commissions: CommissionEntry[];
}

export default function PartnerDashboard() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ show: boolean; msg: string }>({ show: false, msg: '' });
  const showToast = (msg: string) => {
    setToast({ show: true, msg });
    setTimeout(() => setToast({ show: false, msg: '' }), 3500);
  };

  // State to manage partner login/identity
  const [partnerId, setPartnerId] = useState<string>(() => {
    return localStorage.getItem('opus_partner_id') || '';
  });
  const [partnerName, setPartnerName] = useState<string>(() => {
    return localStorage.getItem('opus_partner_name') || '';
  });
  const [partnerToken, setPartnerToken] = useState<string>(() => {
    return localStorage.getItem('opus_partner_token') || '';
  });

  // Login Input State
  const [partnerIdInput, setPartnerIdInput] = useState('');

  // KYC Registration Form State
  const [kycName, setKycName] = useState('');
  const [kycPan, setKycPan] = useState('');
  const [kycBankAccount, setKycBankAccount] = useState('');
  const [kycIfsc, setKycIfsc] = useState('');

  // Referral Submission Form State
  const [clientId, setClientId] = useState('');
  const [commissionRate, setCommissionRate] = useState<number>(5);

  // Fetch Partner Commissions Ledger
  const { data: ledgerData, isFetching: ledgerFetching, error: ledgerError, isError: ledgerIsError } = useQuery<CommissionLedgerResponse>({
    queryKey: ['partnerCommissions', partnerId],
    queryFn: async () => {
      if (!partnerId) return { commissions: [] };
      const res = await fetch(`/api/public/partners/${partnerId}/commissions`, {
        headers: { 'Authorization': `Bearer ${partnerToken}` }
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to fetch commissions ledger.');
      }
      return res.json();
    },
    enabled: !!partnerId,
  });

  // Register Partner Mutation
  const registerMutation = useMutation({
    mutationFn: async (payload: { name: string; panNumber: string; bankAccount: string; ifscCode: string }) => {
      const res = await fetch('/api/public/partners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Affiliate registration failed.');
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.partnerId) {
        localStorage.setItem('opus_partner_id', data.partnerId);
        localStorage.setItem('opus_partner_name', kycName);
        if (data.apiToken) {
          localStorage.setItem('opus_partner_token', data.apiToken);
          setPartnerToken(data.apiToken);
        }
        setPartnerId(data.partnerId);
        setPartnerName(kycName);
        showToast('Affiliate KYC registered and account activated!');
        // Clear inputs
        setKycName('');
        setKycPan('');
        setKycBankAccount('');
        setKycIfsc('');
      }
    },
    onError: (err: any) => {
      showToast(`Registration Error: ${err.message}`);
    },
  });

  // Log Referral Mutation
  const logReferralMutation = useMutation({
    mutationFn: async (payload: { partnerId: string; clientId: string; commissionRate: number }) => {
      const res = await fetch('/api/public/partners/referrals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${partnerToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to log client referral.');
      }
      return res.json();
    },
    onSuccess: () => {
      showToast('Client referral logged successfully!');
      setClientId('');
      setCommissionRate(5);
      queryClient.invalidateQueries({ queryKey: ['partnerCommissions', partnerId] });
    },
    onError: (err: any) => {
      showToast(`Referral Error: ${err.message}`);
    },
  });

  const handleKycSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kycName || !kycPan || !kycBankAccount || !kycIfsc) {
      showToast('Please fill out all KYC fields.');
      return;
    }
    registerMutation.mutate({
      name: kycName,
      panNumber: kycPan,
      bankAccount: kycBankAccount,
      ifscCode: kycIfsc,
    });
  };

  const handlePartnerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = partnerIdInput.trim();
    if (!cleanId) {
      showToast('Please enter a valid Partner ID.');
      return;
    }
    localStorage.setItem('opus_partner_id', cleanId);
    localStorage.setItem('opus_partner_name', 'Affiliate Partner');
    setPartnerId(cleanId);
    setPartnerName('Affiliate Partner');
    setPartnerIdInput('');
    showToast('Dashboard loaded for Partner ID.');
  };

  const handleLogout = () => {
    localStorage.removeItem('opus_partner_id');
    localStorage.removeItem('opus_partner_name');
    setPartnerId('');
    setPartnerName('');
    showToast('Switched account successfully.');
  };

  const handleFillDemoPartner = () => {
    // We can use a demo UUID or register a test partner
    // Let's seed a helper login
    setPartnerIdInput('Hyderabad-Partner-UUID');
    showToast('Demo Partner ID loaded. Please click Access Dashboard.');
  };

  // Compute Balances
  const commissions = ledgerData?.commissions || [];
  const maturedPaise = commissions
    .filter(c => c.status === 'matured')
    .reduce((sum, c) => sum + c.amount, 0);

  const unmaturedPaise = commissions
    .filter(c => c.status === 'unmatured')
    .reduce((sum, c) => sum + c.amount, 0);

  const paidPaise = commissions
    .filter(c => c.status === 'paid')
    .reduce((sum, c) => sum + c.amount, 0);

  const handleReferralSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId.trim()) {
      showToast('Please enter a valid client ID.');
      return;
    }
    logReferralMutation.mutate({
      partnerId,
      clientId: clientId.trim(),
      commissionRate,
    });
  };

  return (
    <div className="bg-[#070B19] text-brand-cream font-sans min-h-screen flex flex-col justify-between selection:bg-brand-gold selection:text-brand-navy">
      {/* HEADER */}
      <header className="bg-brand-navy/80 backdrop-blur-md border-b border-brand-navyLight py-4 px-8 sticky top-0 shadow-lg z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-brand-gold flex items-center justify-center font-display font-bold text-brand-navy">O</div>
          <div>
            <span className="font-display font-bold text-base tracking-wider block text-white">Opus Overseas</span>
            <span className="text-[9px] text-brand-gold tracking-widest uppercase block leading-none">Partner Dashboard</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/portal" className="text-xs text-brand-cream/80 hover:text-brand-gold font-medium transition">
            Client Journey Tracker
          </Link>
          {partnerId && (
            <button
              onClick={handleLogout}
              className="text-xs bg-brand-error/15 border border-brand-error/30 hover:border-brand-error px-3 py-1.5 rounded transition text-brand-error font-semibold"
            >
              Switch Partner
            </button>
          )}
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl w-full mx-auto p-6 md:p-8 flex-1 flex flex-col gap-8">
        
        {/* HERO */}
        <section className="bg-gradient-to-br from-brand-navyLight to-[#111A36] p-8 rounded-2xl border border-brand-navyLight shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="max-w-xl space-y-3">
            <h1 className="font-display font-extrabold text-2xl md:text-3xl text-white leading-tight">
              Grow with the <span className="text-brand-gold">Opus Affiliate Program</span>
            </h1>
            <p className="text-xs text-brand-cream/70 leading-relaxed">
              Earn commissions by referring students and visa applicants. Fully encrypted PAN checks keep your financial KYC credentials safe at rest, while our automated ledger tracks matured and unmatured paise payouts.
            </p>
          </div>
        </section>

        {/* ANONYMOUS STATE: LOGIN OR REGISTER */}
        {!partnerId ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
            {/* REGISTER FORM */}
            <div className="bg-brand-navy/40 border border-brand-navyLight p-6 md:p-8 rounded-2xl flex flex-col gap-6 shadow-xl">
              <div>
                <h2 className="font-display font-bold text-lg text-white">KYC Affiliate Registration</h2>
                <p className="text-[11px] text-brand-cream/50 mt-1">
                  Submit bank routing particulars and PAN details to activate your partner profile.
                </p>
              </div>

              <form onSubmit={handleKycSubmit} className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-brand-gold font-bold block mb-1">
                    Affiliate Name / Agency
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Hyderabad Consultants Ltd"
                    value={kycName}
                    onChange={(e) => setKycName(e.target.value)}
                    className="w-full text-xs p-3 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-brand-gold font-bold block mb-1">
                    PAN Number (Encrypted at Rest)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="e.g. ABCDE1234F"
                    value={kycPan}
                    onChange={(e) => setKycPan(e.target.value.toUpperCase())}
                    className="w-full text-xs p-3 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold font-mono uppercase"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-brand-gold font-bold block mb-1">
                      Bank Account Number
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 50100123456789"
                      value={kycBankAccount}
                      onChange={(e) => setKycBankAccount(e.target.value)}
                      className="w-full text-xs p-3 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-brand-gold font-bold block mb-1">
                      Bank IFSC Code
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={11}
                      placeholder="e.g. HDFC0000001"
                      value={kycIfsc}
                      onChange={(e) => setKycIfsc(e.target.value.toUpperCase())}
                      className="w-full text-xs p-3 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold font-mono uppercase"
                    />
                  </div>
                </div>

                <div className="p-3 bg-brand-navy/40 border border-brand-navyLight rounded text-[10px] text-brand-cream/55 leading-tight">
                  🔒 <strong>DPDP-2023 financial protection notice:</strong> Your PAN identifier is securely encrypted before being committed to the database storage engine.
                </div>

                <button
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="w-full bg-brand-gold hover:bg-brand-goldHover text-brand-navy py-2.5 rounded text-xs font-bold uppercase tracking-wider transition disabled:opacity-50"
                >
                  {registerMutation.isPending ? 'Verifying Credentials...' : 'Submit & Register'}
                </button>
              </form>
            </div>

            {/* DASHBOARD LOOKUP */}
            <div className="bg-brand-navy/40 border border-brand-navyLight p-6 md:p-8 rounded-2xl flex flex-col gap-6 shadow-xl">
              <div>
                <h2 className="font-display font-bold text-lg text-white">Access Existing Partner Dashboard</h2>
                <p className="text-[11px] text-brand-cream/50 mt-1">
                  Enter your registered Partner UUID to check outstanding ledger balances.
                </p>
              </div>

              <form onSubmit={handlePartnerLogin} className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-brand-gold font-bold block mb-1">
                    Partner ID (UUID)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. a8b9c0d1-e2f3-..."
                    value={partnerIdInput}
                    onChange={(e) => setPartnerIdInput(e.target.value)}
                    className="w-full text-xs p-3 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold font-mono"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-brand-cream hover:bg-white text-brand-navy py-2.5 rounded text-xs font-bold uppercase tracking-wider transition"
                >
                  Access Dashboard
                </button>
              </form>

              <div className="border-t border-brand-navyLight/60 pt-4 flex justify-between items-center text-[10px] text-brand-cream/50">
                <span>Testing reference partner:</span>
                <button
                  type="button"
                  onClick={handleFillDemoPartner}
                  className="text-brand-gold hover:underline font-semibold"
                >
                  Load Demo ID
                </button>
              </div>
            </div>

          </div>
        ) : (
          /* ACTIVE PARTNER STATE */
          <div className="space-y-8">
            
            {/* PARTNER HEADER WIDGET */}
            <section className="bg-brand-navy/40 border border-brand-navyLight p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest bg-brand-gold/15 px-2 py-0.5 rounded">
                  Active Partner Account
                </span>
                <h2 className="font-display font-bold text-lg text-white mt-2">{partnerName}</h2>
                <p className="text-[10px] text-brand-cream/60 mt-0.5">
                  Partner ID: <span className="font-mono text-brand-gold">{partnerId}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-brand-success/15 border border-brand-success/30 rounded text-brand-success text-[10px] font-bold uppercase">
                  KYC Verified
                </span>
              </div>
            </section>

            {/* BALANCES GRID */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* MATURED */}
              <div className="bg-gradient-to-br from-brand-navy/60 to-[#12214C] border border-brand-gold/30 p-6 rounded-2xl flex flex-col justify-between shadow-xl min-h-[120px]">
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-brand-gold font-bold">Matured Balance</span>
                  <p className="text-white font-display font-extrabold text-2xl mt-2">
                    ₹{(maturedPaise / 100).toFixed(2)}
                  </p>
                </div>
                <div className="flex justify-between items-center text-[10px] text-brand-cream/50 border-t border-brand-navyLight pt-2 mt-4">
                  <span>Ledger balance:</span>
                  <span className="font-mono">{maturedPaise.toLocaleString()} paise</span>
                </div>
              </div>

              {/* UNMATURED */}
              <div className="bg-brand-navy/40 border border-brand-navyLight p-6 rounded-2xl flex flex-col justify-between shadow-xl min-h-[120px]">
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-brand-cream/65 font-bold">Unmatured Balance</span>
                  <p className="text-brand-cream font-display font-extrabold text-2xl mt-2">
                    ₹{(unmaturedPaise / 100).toFixed(2)}
                  </p>
                </div>
                <div className="flex justify-between items-center text-[10px] text-brand-cream/50 border-t border-brand-navyLight pt-2 mt-4">
                  <span>Ledger balance:</span>
                  <span className="font-mono">{unmaturedPaise.toLocaleString()} paise</span>
                </div>
              </div>

              {/* TOTAL PAID */}
              <div className="bg-brand-navy/40 border border-brand-navyLight p-6 rounded-2xl flex flex-col justify-between shadow-xl min-h-[120px]">
                <div>
                  <span className="text-[9px] uppercase tracking-wider text-brand-success/80 font-bold">Paid Balance</span>
                  <p className="text-brand-success font-display font-extrabold text-2xl mt-2">
                    ₹{(paidPaise / 100).toFixed(2)}
                  </p>
                </div>
                <div className="flex justify-between items-center text-[10px] text-brand-cream/50 border-t border-brand-navyLight pt-2 mt-4">
                  <span>Disbursed:</span>
                  <span className="font-mono">{paidPaise.toLocaleString()} paise</span>
                </div>
              </div>

            </section>

            {/* REFERENCE LOGGER & LEDGER DETAILS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* LEFT COLUMN: LOG REFERRAL FORM */}
              <div className="lg:col-span-4 bg-brand-navy/40 border border-brand-navyLight p-6 rounded-2xl flex flex-col gap-5">
                <div>
                  <h3 className="font-display font-bold text-sm text-white">Log Client Referral</h3>
                  <p className="text-[10px] text-brand-cream/50 mt-0.5">
                    Link a client ID to your partner credentials to calculate referral fees.
                  </p>
                </div>

                <form onSubmit={handleReferralSubmit} className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-brand-gold font-bold block mb-1">
                      Client ID (Token)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. OP-2026-5555"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full text-xs p-3 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-brand-gold font-bold block mb-1">
                      Requested Commission Rate (%)
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={25}
                      value={commissionRate}
                      onChange={(e) => setCommissionRate(parseInt(e.target.value) || 5)}
                      className="w-full text-xs p-3 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={logReferralMutation.isPending}
                    className="w-full bg-brand-gold hover:bg-brand-goldHover text-brand-navy py-2 rounded text-xs font-bold uppercase tracking-wider transition disabled:opacity-50"
                  >
                    {logReferralMutation.isPending ? 'Logging referral...' : 'Commit Referral'}
                  </button>
                </form>
              </div>

              {/* RIGHT COLUMN: COMMISSION LEDGER VIEW */}
              <div className="lg:col-span-8 bg-brand-navy/40 border border-brand-navyLight p-6 rounded-2xl flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-display font-bold text-sm text-white">Affiliate Commission Ledger</h3>
                    <p className="text-[10px] text-brand-cream/50 mt-0.5">
                      Individual referral transaction balances.
                    </p>
                  </div>
                  {ledgerFetching && (
                    <span className="text-[10px] text-brand-gold animate-pulse">Syncing...</span>
                  )}
                </div>

                {ledgerIsError && (
                  <div className="p-3.5 bg-brand-error/15 border border-brand-error/20 text-brand-error rounded text-xs">
                    Failed to fetch commission lists: {ledgerError?.message}
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs min-w-[500px]">
                    <thead>
                      <tr className="border-b border-brand-navyLight text-[10px] font-bold text-brand-cream/50 uppercase tracking-wider">
                        <th className="py-3 px-4">Transaction ID</th>
                        <th className="py-3 px-4">Referral ID</th>
                        <th className="py-3 px-4">Rupee Balance</th>
                        <th className="py-3 px-4">Raw Balance (Paise)</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map((item) => (
                        <tr key={item.id} className="border-b border-brand-navyLight/40 hover:bg-brand-navyLight/15 transition">
                          <td className="py-3 px-4 font-mono text-brand-cream/70">{item.id.substring(0, 8)}...</td>
                          <td className="py-3 px-4 font-mono text-brand-cream/70">{item.referralId.substring(0, 8)}...</td>
                          <td className="py-3 px-4 text-white font-semibold">₹{(item.amount / 100).toFixed(2)}</td>
                          <td className="py-3 px-4 font-mono text-brand-cream/50">{item.amount.toLocaleString()} p</td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              item.status === 'matured'
                                ? 'bg-brand-gold/15 text-brand-gold'
                                : item.status === 'paid'
                                  ? 'bg-brand-success/15 text-brand-success'
                                  : item.status === 'held'
                                    ? 'bg-brand-error/15 text-brand-error'
                                    : 'bg-brand-cream/15 text-brand-cream/60'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}

                      {commissions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-[10px] text-brand-cream/45 border-none">
                            No ledger commissions reported. Refer clients using the left form.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-brand-navy border-t border-brand-navyLight py-6 mt-12 shrink-0">
        <div className="max-w-7xl mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-brand-cream/40">
          <div className="flex items-center gap-3">
            <span className="border border-brand-gold/30 text-brand-gold px-2 py-0.5 rounded text-[10px] font-semibold font-display">
              British Council Certified Agent
            </span>
          </div>
          <div>
            <span>© 2026 Opus Overseas (Telangana, India). All rights reserved.</span>
          </div>
          <div className="flex gap-4 font-semibold">
            <a href="#" className="hover:text-brand-gold transition">Privacy Policy</a>
            <a href="#" className="hover:text-brand-gold transition">DPDP Consent Terms</a>
          </div>
        </div>
      </footer>

      {/* TOAST SYSTEM */}
      <div 
        className={`fixed right-6 bottom-6 bg-brand-navyLight border-l-4 border-brand-gold text-white text-xs px-4 py-3 rounded-lg shadow-2xl transition duration-300 z-50 flex items-center gap-2 ${
          toast.show ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'
        }`}
      >
        <span className="font-bold text-brand-gold">PARTNER SYSTEM:</span>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}

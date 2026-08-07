import { useState } from 'react';

export default function ProductivityToolbox() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'gst' | 'attestation' | 'visa' | 'expiry'>('gst');

  // GST Split Calculator State
  const [inrAmount, setInrAmount] = useState('');
  const [isInterstate, setIsInterstate] = useState(false);

  // Attestation Estimator State
  const [docType, setDocType] = useState('Degree');
  const [destination, setDestination] = useState('Saudi Arabia');

  // Visa Checklist State
  const [country, setCountry] = useState('Germany');

  // Mock Expiries Watchlist
  const mockExpiries = [
    { name: "Ramesh Kumar", item: "Passport", daysLeft: 45, token: "OP-2026-1001" },
    { name: "Priya Patel", item: "German Visa", daysLeft: 12, token: "OP-2026-1002" }
  ];

  // GST calculations
  const calculateGST = () => {
    const rupees = parseFloat(inrAmount) || 0;
    const totalPaise = Math.round(rupees * 100);
    
    // Taxable base = Total / 1.18
    const taxableBasePaise = Math.round(totalPaise / 1.18);
    const totalGstPaise = totalPaise - taxableBasePaise;
    
    let cgstPaise = 0;
    let sgstPaise = 0;
    let igstPaise = 0;

    if (isInterstate) {
      igstPaise = totalGstPaise;
    } else {
      cgstPaise = Math.round(totalGstPaise / 2);
      sgstPaise = totalGstPaise - cgstPaise; // balance out rounding
    }

    return {
      totalPaise,
      taxableBasePaise,
      cgstPaise,
      sgstPaise,
      igstPaise
    };
  };

  const gstResult = calculateGST();

  // Attestation Matrix
  const attestationMatrix: Record<string, Record<string, { chain: string; price: number; days: number }>> = {
    Degree: {
      'Saudi Arabia': { chain: 'Notary -> HRD -> MEA -> Saudi Embassy', price: 550000, days: 12 },
      'UAE': { chain: 'Notary -> SDM -> MEA -> UAE Embassy', price: 680000, days: 10 },
      'Kuwait': { chain: 'Notary -> HRD -> MEA -> Kuwait Embassy', price: 480000, days: 14 }
    },
    Birth: {
      'Saudi Arabia': { chain: 'Notary -> MEA -> Saudi Embassy', price: 350000, days: 8 },
      'UAE': { chain: 'Notary -> MEA -> UAE Embassy', price: 420000, days: 7 },
      'Kuwait': { chain: 'Notary -> MEA -> Kuwait Embassy', price: 320000, days: 10 }
    }
  };

  const attEstimates = attestationMatrix[docType]?.[destination] || { chain: 'Notary -> MEA', price: 200000, days: 5 };

  // Visa Checklist Matrix
  const visaChecklists: Record<string, string[]> = {
    Germany: [
      'German University Admission Letter',
      'Blocked Account Confirmation (Sperrkonto: €11,900)',
      'Travel Health Insurance (Incoming Insurance)',
      'Academic Degree Certificates & Transcripts',
      'Proof of English (IELTS/TOEFL) or German proficiency'
    ],
    UK: [
      'Confirmation of Acceptance for Studies (CAS Letter)',
      'IHS (Immigration Health Surcharge) Payment Confirmation',
      'TB Test Certificate (Approved UKVI clinic)',
      'Financial Proof (Tuition fees + 9 months living costs in bank for 28 days)'
    ],
    US: [
      'Form I-20 issued by SEVP-certified institution',
      'SEVIS I-901 Fee Payment Receipt ($350)',
      'DS-160 Confirmation Page & Barcode',
      'Visa Interview Appointment Letter',
      'Liquid Financial Statements covering 1st Year Estimated Cost'
    ]
  };

  return (
    <>
      {/* Floating Gold Glow Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-[hsl(45,100%,40%)] bg-[hsl(224,25%,18%)] px-5 py-3 text-sm font-semibold text-[hsl(45,100%,50%)] shadow-[0_0_15px_rgba(250,204,21,0.2)] transition-all hover:bg-[hsl(224,25%,22%)] hover:shadow-[0_0_25px_rgba(250,204,21,0.4)]"
      >
        <span className="text-lg">🛠ï¸</span> Productivity Toolbox
      </button>

      {/* Slide-out Sidebar Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          {/* Overlay click to close */}
          <div className="flex-1" onClick={() => setIsOpen(false)} />

          <div className="h-full w-full max-w-md border-l border-[hsl(224,25%,26%)] bg-[hsl(224,25%,12%)] p-6 text-white shadow-2xl transition-all">
            {/* Drawer Header */}
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-[hsl(45,100%,50%)]">
                OpusOS Productivity Drawer
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                ✓
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="mb-6 flex gap-1 rounded-lg bg-[hsl(224,25%,18%)] p-1 text-xs">
              {(['gst', 'attestation', 'visa', 'expiry'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 rounded-md py-2 font-medium capitalize transition-all ${
                    activeTab === tab
                      ? 'bg-[hsl(45,100%,50%)] text-black'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tab === 'gst' ? 'GST Calc' : tab}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div className="h-[calc(100vh-170px)] overflow-y-auto pr-2">
              {/* Tab 1: GST Split Calc */}
              {activeTab === 'gst' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-300">GST Rule 46 Split (18% inclusive)</h3>
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Total Invoice Amount (INR)</label>
                    <input
                      type="number"
                      placeholder="e.g. 15000"
                      value={inrAmount}
                      onChange={(e) => setInrAmount(e.target.value)}
                      className="w-full rounded-md border border-[hsl(224,25%,26%)] bg-[hsl(224,25%,18%)] p-2 text-sm text-white focus:border-[hsl(45,100%,50%)] focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isInterstate"
                      checked={isInterstate}
                      onChange={(e) => setIsInterstate(e.target.checked)}
                      className="accent-[hsl(45,100%,50%)]"
                    />
                    <label htmlFor="isInterstate" className="text-xs text-gray-300">
                      Interstate (Apply 18% IGST)
                    </label>
                  </div>

                  <div className="rounded-lg bg-[hsl(224,25%,18%)] p-4 space-y-2 text-xs">
                    <div className="flex justify-between border-b border-[hsl(224,25%,26%)] pb-2">
                      <span className="text-gray-400">Total Paise:</span>
                      <span className="font-mono text-white">{gstResult.totalPaise.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Base Taxable (Paise):</span>
                      <span className="font-mono text-white">{gstResult.taxableBasePaise.toLocaleString()}</span>
                    </div>
                    {isInterstate ? (
                      <div className="flex justify-between text-yellow-500">
                        <span>IGST (18%):</span>
                        <span className="font-mono">{gstResult.igstPaise.toLocaleString()}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-400">CGST (9%):</span>
                          <span className="font-mono text-white">{gstResult.cgstPaise.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">SGST (9%):</span>
                          <span className="font-mono text-white">{gstResult.sgstPaise.toLocaleString()}</span>
                        </div>
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 italic">
                    Use these values directly in payment ledger insertions to enforce exact tax-precision.
                  </p>
                </div>
              )}

              {/* Tab 2: Attestation Fee Estimator */}
              {activeTab === 'attestation' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-300">Embassy Attestation Quotes</h3>
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Document Type</label>
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="w-full rounded-md border border-[hsl(224,25%,26%)] bg-[hsl(224,25%,18%)] p-2 text-sm text-white focus:outline-none"
                    >
                      <option value="Degree">Degree Certificate</option>
                      <option value="Birth">Birth Certificate</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Destination Embassy</label>
                    <select
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="w-full rounded-md border border-[hsl(224,25%,26%)] bg-[hsl(224,25%,18%)] p-2 text-sm text-white focus:outline-none"
                    >
                      <option value="Saudi Arabia">Saudi Arabia</option>
                      <option value="UAE">UAE</option>
                      <option value="Kuwait">Kuwait</option>
                    </select>
                  </div>

                  <div className="rounded-lg bg-[hsl(224,25%,18%)] p-4 space-y-3 text-xs">
                    <div>
                      <span className="block text-gray-400 mb-1">Legalization Chain:</span>
                      <span className="font-medium text-[hsl(45,100%,50%)]">{attEstimates.chain}</span>
                    </div>
                    <div className="flex justify-between border-t border-[hsl(224,25%,26%)] pt-2">
                      <span className="text-gray-400">Estimated Cost:</span>
                      <span className="font-mono text-white">₹{(attEstimates.price / 100).toLocaleString()} ({attEstimates.price} paise)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Turnaround Time:</span>
                      <span className="text-white">{attEstimates.days} Business Days</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Visa Checklist */}
              {activeTab === 'visa' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-300">Visa Requirements Checklist</h3>
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Select Country</label>
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full rounded-md border border-[hsl(224,25%,26%)] bg-[hsl(224,25%,18%)] p-2 text-sm text-white focus:outline-none"
                    >
                      <option value="Germany">Germany Student Visa</option>
                      <option value="UK">United Kingdom (Student/Tier 4)</option>
                      <option value="US">United States (F1 Academic)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <span className="block text-xs text-gray-400">Core Document Stack:</span>
                    <ul className="space-y-2">
                      {visaChecklists[country]?.map((item, idx) => (
                        <li key={idx} className="flex gap-2 rounded-lg bg-[hsl(224,25%,18%)] p-3 text-xs text-gray-300">
                          <span className="text-[hsl(45,100%,50%)]">✔</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Tab 4: Expiries Watchlist */}
              {activeTab === 'expiry' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-300">Active Expiries Watchlist</h3>
                  <div className="space-y-3">
                    {mockExpiries.map((exp, idx) => (
                      <div key={idx} className="rounded-lg bg-[hsl(224,25%,18%)] p-4 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="font-semibold text-white">{exp.name}</span>
                          <span className="rounded-sm bg-red-900/60 px-2 py-0.5 text-[10px] text-red-300 font-mono">
                            Expires in {exp.daysLeft} days
                          </span>
                        </div>
                        <p className="text-gray-400 text-[11px]">
                          Reason: {exp.item} expiry alert. Contact token {exp.token}.
                        </p>
                        <button
                          onClick={() => {
                            const message = `Hi ${exp.name}, your ${exp.item} renewal window is open. Please upload your document to OpusOS vault.`;
                            navigator.clipboard.writeText(message);
                            alert('WhatsApp reminder text copied to clipboard!');
                          }}
                          className="mt-2 w-full rounded-md bg-emerald-900/40 border border-emerald-700/60 py-1.5 text-xs text-emerald-300 hover:bg-emerald-800/40"
                        >
                          Copy Reminder Message
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

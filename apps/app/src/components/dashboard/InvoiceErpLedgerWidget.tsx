import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Panel, PanelHead, EmptyState } from "../WorkChrome";

interface InvoiceRecord {
  id: string;
  invoiceNo: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  engagementId: string;
  amountPaise: number;
  type: string;
  milestoneName: string;
  method: string;
  referenceNumber?: string;
  status: string;
  taxableAmountPaise?: number;
  cgstPaise?: number;
  sgstPaise?: number;
  igstPaise?: number;
  isInterstate?: boolean;
  gstRate?: number;
  createdAt: number;
  erpSyncStatus: "synced" | "failed" | "pending" | "not_synced";
  erpDocName?: string | null;
  erpSyncedAt?: number | null;
  erpError?: string | null;
}

interface InvoiceBrandingSettings {
  logoUrl?: string;
  companyLegalName: string;
  brandName?: string;
  gstin?: string;
  pan?: string;
  stateCode?: string;
  stateName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  pincode?: string;
  billingEmail?: string;
  billingPhone?: string;
  website?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankBranch?: string;
  upiId?: string;
  invoicePrefix?: string;
  invoiceNotes?: string;
  authorizedSignatoryText?: string;
}

const DEFAULT_SETTINGS: InvoiceBrandingSettings = {
  logoUrl: "/opus-logo.svg",
  companyLegalName: "Cordial Crafts (Prop. AJMAL HUSSAIN)",
  brandName: "OPUS OVERSEAS",
  gstin: "36ALPPH3337R1ZE",
  pan: "ALPPH3337R",
  stateCode: "36",
  stateName: "Telangana",
  addressLine1: "H.No. R & B Guest Road, Near Anganwadi School",
  addressLine2: "Nizamabad — Telangana",
  city: "Nizamabad",
  pincode: "",
  billingEmail: "support@opusoverseas.com",
  billingPhone: "+91 90000 00000",
  website: "https://opusoverseas.com",
  bankName: "",
  bankAccountNo: "",
  bankIfsc: "",
  bankBranch: "",
  upiId: "",
  invoicePrefix: "INV-2026-",
  invoiceNotes: "This is a computer-generated GST tax invoice. Services rendered are subject to standard Opus Overseas terms and service agreements. No physical signature required.",
  authorizedSignatoryText: "For OPUS OVERSEAS (Cordial Crafts) — Authorized Signatory",
};

export default function InvoiceErpLedgerWidget() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "synced" | "pending" | "failed">("all");
  const [search, setSearch] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Invoice Branding Form State
  const [settingsForm, setSettingsForm] = useState<InvoiceBrandingSettings>(DEFAULT_SETTINGS);
  const [settingsSavedToast, setSettingsSavedToast] = useState(false);

  // New Invoice Form State
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [amountRupees, setAmountRupees] = useState("");
  const [milestoneName, setMilestoneName] = useState("Professional Consultancy Service");
  const [method, setMethod] = useState("bank_transfer");
  const [isInterstate, setIsInterstate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 1. Fetch live ERPNext Health
  const { data: erpHealth } = useQuery<{ success?: boolean; message?: string }>({
    queryKey: ["erpnextHealth"],
    queryFn: async () => {
      const res = await fetch("/api/erpnext/health");
      if (!res.ok) return { success: false, message: "ERPNext offline or configuring" };
      return res.json();
    },
    refetchInterval: 60000,
  });

  // 2. Fetch Invoices Ledger
  const { data: invoiceData, isLoading } = useQuery<{
    success: boolean;
    invoices: InvoiceRecord[];
    totalCount: number;
    syncedCount: number;
    pendingCount: number;
  }>({
    queryKey: ["erpnextInvoices"],
    queryFn: async () => {
      const res = await fetch("/api/erpnext/invoices");
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // 3. Fetch Branding Settings
  const { data: settingsData } = useQuery<{ success: boolean; settings: InvoiceBrandingSettings }>({
    queryKey: ["invoiceSettings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/invoice-settings");
      if (!res.ok) return { success: true, settings: DEFAULT_SETTINGS };
      return res.json();
    },
  });

  const activeSettings = useMemo(() => {
    return { ...DEFAULT_SETTINGS, ...(settingsData?.settings || {}) };
  }, [settingsData]);

  // 4. Save Branding Settings Mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (payload: InvoiceBrandingSettings) => {
      const res = await fetch("/api/admin/invoice-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save settings");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoiceSettings"] });
      setSettingsSavedToast(true);
      setTimeout(() => {
        setSettingsSavedToast(false);
        setShowSettingsModal(false);
      }, 1500);
    },
  });

  // 3. Batch Sync Mutation
  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/erpnext/invoices/sync-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Batch sync failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["erpnextInvoices"] });
      queryClient.invalidateQueries({ queryKey: ["erpnextSyncLog"] });
    },
  });

  // 4. Single Invoice Sync Mutation
  const syncSingleMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await fetch(`/api/erpnext/payments/${paymentId}/sync`, { credentials: 'include',  method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Single sync failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["erpnextInvoices"] });
    },
  });

  // 5. Create Invoice Mutation
  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      setFormError(null);
      const rupees = parseFloat(amountRupees);
      if (isNaN(rupees) || rupees <= 0) {
        throw new Error("Please enter a valid amount in rupees");
      }
      if (!clientName.trim()) {
        throw new Error("Please enter client full name");
      }

      const amountPaise = Math.round(rupees * 100);

      // Create lead/client
      const leadRes = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clientName,
          email: clientEmail || undefined,
          phone: clientPhone || "+91 99999 00000",
          leadSource: "invoice-counter",
          consents: { coreProcessing: true, whatsappUpdates: true },
        }),
      });
      const leadData = await leadRes.json();
      const clientId = leadData.id || `OP-CLIENT-${Date.now().toString().slice(-6)}`;
      const engagementId = leadData.engagementId || `eng-${Date.now().toString().slice(-6)}`;

      // Create payment ledger entry
      const paymentRes = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          engagementId,
          amount: amountPaise,
          type: "invoice",
          milestoneName,
          method,
          isInterstate,
          referenceNumber: `TXN-${Date.now().toString().slice(-6)}`,
        }),
      });

      const paymentData = await paymentRes.json();
      if (!paymentRes.ok) throw new Error(paymentData.error || "Failed to create invoice ledger");
      return paymentData;
    },
    onSuccess: () => {
      setShowCreateModal(false);
      setClientName("");
      setClientEmail("");
      setClientPhone("");
      setAmountRupees("");
      queryClient.invalidateQueries({ queryKey: ["erpnextInvoices"] });
      queryClient.invalidateQueries({ queryKey: ["revenueSummary"] });
    },
    onError: (err: any) => {
      setFormError(err.message || "Failed to generate invoice");
    },
  });

  const invoices = invoiceData?.invoices || [];

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch =
        inv.clientName.toLowerCase().includes(search.toLowerCase()) ||
        inv.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
        (inv.erpDocName && inv.erpDocName.toLowerCase().includes(search.toLowerCase())) ||
        inv.milestoneName.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      if (filter === "synced") return inv.erpSyncStatus === "synced";
      if (filter === "pending") return inv.erpSyncStatus === "pending" || inv.erpSyncStatus === "not_synced";
      if (filter === "failed") return inv.erpSyncStatus === "failed";
      return true;
    });
  }, [invoices, filter, search]);

  const INR = (paise: number) =>
    "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  return (
    <Panel className="border-brand-gold/20 shadow-md p-6">
      <PanelHead
        title="Official Invoices & ERPNext Books Sync"
        caption="Unified invoicing ledger synced directly to ERPNext official sales registers"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-bold font-mono ${
                erpHealth?.success
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  erpHealth?.success ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              {erpHealth?.success ? 'ERPNext Connected' : 'ERPNext Sync Ready'}
            </span>

            <button
              onClick={() => {
                setSettingsForm(activeSettings);
                setShowSettingsModal(true);
              }}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-brand-navy/20 bg-white px-3 py-1.5 text-xs font-bold text-brand-navy hover:bg-brand-gold/20 transition cursor-pointer"
            >
              <span>⚙️ Invoice Settings</span>
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-gold hover:text-brand-navy transition cursor-pointer"
            >
              <span>+ Create Invoice</span>
            </button>

            <button
              onClick={() => syncAllMutation.mutate()}
              disabled={syncAllMutation.isPending}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-brand-navy/15 bg-white px-3 py-1.5 text-xs font-bold text-brand-navy hover:border-brand-gold transition cursor-pointer disabled:opacity-50"
            >
              {syncAllMutation.isPending ? 'Syncing...' : '⚡ Sync All to ERPNext'}
            </button>
          </div>
        }
      />

      {/* KPI & Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-brand-cream/60 border-b border-brand-navy/10">
        <div className="bg-white p-3 rounded-xl border border-brand-navy/10">
          <p className="text-[13px] font-bold uppercase tracking-wider text-brand-textLight">Total Invoiced</p>
          <p className="text-base font-extrabold text-brand-navy">
            {INR(invoices.reduce((a, b) => a + (b.amountPaise || 0), 0))}
          </p>
          <p className="text-[13px] text-brand-textLight mt-0.5">{invoices.length} total entries</p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-brand-navy/10">
          <p className="text-[13px] font-bold uppercase tracking-wider text-brand-textLight">Synced to Books</p>
          <p className="text-base font-extrabold text-emerald-700">
            {invoiceData?.syncedCount || 0}
          </p>
          <p className="text-[13px] text-emerald-600 mt-0.5">Verified in ERPNext</p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-brand-navy/10">
          <p className="text-[13px] font-bold uppercase tracking-wider text-brand-textLight">Pending Sync</p>
          <p className="text-base font-extrabold text-amber-600">
            {invoices.filter((i) => i.erpSyncStatus === "not_synced" || i.erpSyncStatus === "pending").length}
          </p>
          <p className="text-[13px] text-amber-600 mt-0.5">Awaiting push</p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-brand-navy/10">
          <p className="text-[13px] font-bold uppercase tracking-wider text-brand-textLight">GST Statutory</p>
          <p className="text-base font-extrabold text-brand-navy">
            {INR(invoices.reduce((a, b) => a + ((b.cgstPaise || 0) + (b.sgstPaise || 0) + (b.igstPaise || 0)), 0))}
          </p>
          <p className="text-[13px] text-brand-textLight mt-0.5">CGST / SGST / IGST</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-brand-navy/10">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {(["all", "synced", "pending", "failed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1 text-xs font-bold capitalize transition cursor-pointer ${
                filter === f
                  ? "bg-brand-navy text-white shadow-xs"
                  : "bg-white text-brand-navy/70 border border-brand-navy/10 hover:bg-brand-cream"
              }`}
            >
              {f === "all" ? "All Invoices" : f}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client, invoice # or milestone..."
            className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-1.5 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
          />
        </div>
      </div>

      {/* Invoice Ledger Table */}
      {isLoading ? (
        <div className="p-8 text-center text-xs text-brand-textLight">Loading official invoice ledger...</div>
      ) : filteredInvoices.length === 0 ? (
        <div className="p-8 text-center">
          <EmptyState
            title="No Invoices Found"
            hint={
              search
                ? 'No invoice records match your search criteria.'
                : 'Create an invoice or record client payment to sync directly with ERPNext.'
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-brand-navy/5 text-[13px] font-bold uppercase tracking-wider text-brand-textLight border-b border-brand-navy/10">
              <tr>
                <th className="py-2.5 px-4">Invoice #</th>
                <th className="py-2.5 px-4">Client</th>
                <th className="py-2.5 px-4">Service Milestone</th>
                <th className="py-2.5 px-4">Amount & GST</th>
                <th className="py-2.5 px-4">ERPNext Sync Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-navy/5">
              {filteredInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-brand-cream/40 transition">
                  <td className="py-3 px-4 font-mono font-bold text-brand-navy">
                    {inv.invoiceNo}
                    <div className="text-[13px] text-brand-textLight font-sans font-normal">
                      {new Date(inv.createdAt * 1000).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <p className="font-bold text-brand-navy">{inv.clientName}</p>
                    <p className="text-[13px] text-brand-textLight">{inv.clientEmail || inv.clientPhone || "—"}</p>
                  </td>

                  <td className="py-3 px-4">
                    <p className="font-medium text-brand-navy">{inv.milestoneName}</p>
                    <span className="inline-block text-[13px] font-mono uppercase text-brand-textLight">
                      {inv.method.replace("_", " ")}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <p className="font-extrabold text-brand-navy">{INR(inv.amountPaise)}</p>
                    {inv.taxableAmountPaise && (
                      <p className="text-[13px] text-brand-textLight font-mono">
                        Taxable: {INR(inv.taxableAmountPaise)}
                      </p>
                    )}
                  </td>

                  <td className="py-3 px-4">
                    {inv.erpSyncStatus === "synced" ? (
                      <div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[13px] font-bold text-emerald-800">
                          <span>✓ Synced:</span>
                          <span className="font-mono">{inv.erpDocName || "Sales Invoice"}</span>
                        </span>
                      </div>
                    ) : inv.erpSyncStatus === "failed" ? (
                      <div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[13px] font-bold text-rose-800">
                          <span>✗ Failed</span>
                        </span>
                        {inv.erpError && (
                          <p className="text-xs text-rose-600 truncate max-w-xs mt-0.5">{inv.erpError}</p>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[13px] font-bold text-amber-800">
                        <span>● Pending Sync</span>
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right space-x-1.5">
                    <button
                      onClick={() => setSelectedInvoice(inv)}
                      className="rounded px-2 py-1 text-sm font-bold text-brand-navy hover:bg-brand-gold/20 transition cursor-pointer"
                    >
                      View Slip
                    </button>
                    {inv.erpSyncStatus !== "synced" && (
                      <button
                        onClick={() => syncSingleMutation.mutate(inv.id)}
                        disabled={syncSingleMutation.isPending}
                        className="rounded bg-brand-gold/20 border border-brand-gold/40 px-2 py-1 text-sm font-extrabold text-brand-navy hover:bg-brand-gold hover:text-white transition cursor-pointer"
                      >
                        Push to ERP
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ============================================================ */}
      {/* 1. EXECUTIVE GST TAX INVOICE PREVIEW / PRINT SLIP MODAL       */}
      {/* ============================================================ */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-brand-navy/10 space-y-5 my-8">
            {/* Modal Actions Header */}
            <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🧾</span>
                <div>
                  <p className="text-[13px] font-bold uppercase tracking-wider text-brand-gold font-mono">Official GST Tax Invoice</p>
                  <h3 className="font-display text-base font-extrabold text-brand-navy">{selectedInvoice.invoiceNo}</h3>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-xl bg-brand-gold px-3.5 py-1.5 text-xs font-bold text-brand-navy hover:bg-brand-gold-hover hover:text-white transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <span>🖨️</span>
                  <span>Print / Save PDF</span>
                </button>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="rounded-full bg-brand-navy/5 hover:bg-brand-navy/10 text-brand-navy h-8 w-8 flex items-center justify-center font-bold text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* PRINTABLE INVOICE BODY */}
            <div className="space-y-4 text-xs bg-slate-50/50 p-5 rounded-2xl border border-brand-navy/10" id="printable-tax-invoice">
              {/* Company Header with Logo */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-brand-navy/10">
                <div className="flex items-center gap-3.5">
                  {activeSettings.logoUrl ? (
                    <img
                      src={activeSettings.logoUrl}
                      alt={activeSettings.brandName || activeSettings.companyLegalName}
                      className="h-10 sm:h-12 w-auto max-w-[160px] sm:max-w-[200px] object-contain rounded-lg border border-brand-navy/10 bg-brand-navy p-1.5 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-brand-navy text-white flex items-center justify-center font-extrabold text-lg">
                      O
                    </div>
                  )}
                  <div>
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      <h4 className="font-display text-base font-extrabold text-brand-navy leading-tight">
                        {activeSettings.brandName || 'OPUS OVERSEAS'}
                      </h4>
                      <span className="text-sm text-brand-textLight font-medium">
                        ({activeSettings.companyLegalName})
                      </span>
                    </div>
                    <p className="text-[13px] text-brand-textLight mt-0.5">
                      {activeSettings.addressLine1}, {activeSettings.addressLine2 ? `${activeSettings.addressLine2}, ` : ''}{activeSettings.city} - {activeSettings.pincode}
                    </p>
                    <p className="text-[13px] text-brand-textLight">
                      Website: {activeSettings.website} · Email: {activeSettings.billingEmail}
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right shrink-0">
                  <span className="inline-block rounded-md bg-brand-gold/20 border border-brand-gold/40 px-2.5 py-0.5 text-[13px] font-mono font-extrabold text-brand-navy">
                    GSTIN: {activeSettings.gstin}
                  </span>
                  <p className="text-[13px] text-brand-textLight mt-1 font-mono">PAN: {activeSettings.pan}</p>
                  <p className="text-[13px] text-brand-textLight">State: {activeSettings.stateName} (Code: {activeSettings.stateCode})</p>
                </div>
              </div>

              {/* Invoice Meta Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-4 rounded-xl border border-brand-navy/10">
                <div>
                  <p className="text-[13px] font-bold uppercase tracking-wider text-brand-textLight">Billed To (Customer):</p>
                  <p className="font-display text-sm font-bold text-brand-navy mt-0.5">{selectedInvoice.clientName}</p>
                  <p className="text-[13px] text-brand-textLight">
                    {selectedInvoice.clientEmail ? `Email: ${selectedInvoice.clientEmail}` : ''}
                    {selectedInvoice.clientEmail && selectedInvoice.clientPhone ? ' · ' : ''}
                    {selectedInvoice.clientPhone ? `Phone: ${selectedInvoice.clientPhone}` : ''}
                  </p>
                  <p className="text-[13px] text-brand-textLight mt-1 font-mono">Client ID: {selectedInvoice.clientId}</p>
                </div>

                <div className="text-left sm:text-right space-y-1">
                  <div className="flex justify-between sm:justify-end gap-3 text-[13px]">
                    <span className="text-brand-textLight font-medium">Invoice Date:</span>
                    <span className="font-bold text-brand-navy">
                      {new Date(selectedInvoice.createdAt * 1000).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between sm:justify-end gap-3 text-[13px]">
                    <span className="text-brand-textLight font-medium">Payment Mode:</span>
                    <span className="font-mono font-bold text-brand-navy uppercase">{selectedInvoice.method.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between sm:justify-end gap-3 text-[13px]">
                    <span className="text-brand-textLight font-medium">Place of Supply:</span>
                    <span className="font-bold text-brand-navy">{selectedInvoice.isInterstate ? 'Inter-State' : `${activeSettings.stateName} (${activeSettings.stateCode})`}</span>
                  </div>
                  <div className="flex justify-between sm:justify-end gap-3 text-[13px]">
                    <span className="text-brand-textLight font-medium">Reverse Charge:</span>
                    <span className="font-bold text-brand-navy">No</span>
                  </div>
                </div>
              </div>

              {/* Itemized Service Table */}
              <div className="bg-white rounded-xl border border-brand-navy/10 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-brand-navy/5 text-[13px] font-bold uppercase tracking-wider text-brand-textLight border-b border-brand-navy/10">
                    <tr>
                      <th className="py-2.5 px-3">Service Description</th>
                      <th className="py-2.5 px-3">SAC Code</th>
                      <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
                      <th className="py-2.5 px-3 text-right">GST Rate</th>
                      <th className="py-2.5 px-3 text-right">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-navy/5">
                    <tr>
                      <td className="py-3 px-3">
                        <p className="font-bold text-brand-navy">{selectedInvoice.milestoneName}</p>
                        <p className="text-[13px] text-brand-textLight">Opus Overseas Verified Dossier & Filing Service</p>
                      </td>
                      <td className="py-3 px-3 font-mono text-brand-textLight">998311</td>
                      <td className="py-3 px-3 text-right font-mono font-medium">
                        {INR(selectedInvoice.taxableAmountPaise || selectedInvoice.amountPaise)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-brand-textLight">
                        {selectedInvoice.isInterstate ? '18% IGST' : '18% (9+9)'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-brand-navy">
                        {INR(selectedInvoice.amountPaise)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Tax Breakdown Subtotal */}
                <div className="p-3 bg-brand-cream/30 border-t border-brand-navy/10 space-y-1.5 text-xs">
                  <div className="flex justify-between text-brand-textLight">
                    <span>Taxable Subtotal:</span>
                    <span className="font-mono font-bold text-brand-navy">
                      {INR(selectedInvoice.taxableAmountPaise || selectedInvoice.amountPaise)}
                    </span>
                  </div>

                  {(() => {
                    const rate = selectedInvoice.gstRate || (selectedInvoice.amountPaise && selectedInvoice.taxableAmountPaise ? Math.round(((selectedInvoice.amountPaise - selectedInvoice.taxableAmountPaise) / selectedInvoice.taxableAmountPaise) * 100) : 18);
                    const halfRate = rate / 2;
                    return selectedInvoice.isInterstate ? (
                      <div className="flex justify-between text-brand-textLight">
                        <span>Integrated GST (IGST @ {rate}%):</span>
                        <span className="font-mono font-bold text-brand-navy">{INR(selectedInvoice.igstPaise || 0)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between text-brand-textLight">
                          <span>Central GST (CGST @ {halfRate}%):</span>
                          <span className="font-mono font-bold text-brand-navy">{INR(selectedInvoice.cgstPaise || 0)}</span>
                        </div>
                        <div className="flex justify-between text-brand-textLight">
                          <span>State GST (SGST @ {halfRate}%):</span>
                          <span className="font-mono font-bold text-brand-navy">{INR(selectedInvoice.sgstPaise || 0)}</span>
                        </div>
                      </>
                    );
                  })()}

                  <div className="flex justify-between text-sm font-extrabold text-brand-navy pt-2 border-t border-brand-navy/10">
                    <span>Total Invoice Amount (INR):</span>
                    <span className="font-mono text-base text-emerald-800">{INR(selectedInvoice.amountPaise)}</span>
                  </div>
                </div>
              </div>

              {/* Bottom Instructions & Authorized Signatory */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3.5 rounded-xl border border-brand-navy/10 text-sm">
                {activeSettings.bankAccountNo ? (
                  <div>
                    <p className="font-bold text-brand-navy uppercase tracking-wider text-[13px]">Bank Remittance Details:</p>
                    <p className="text-brand-textLight mt-1">Bank Name: <span className="font-bold text-brand-navy">{activeSettings.bankName}</span></p>
                    <p className="text-brand-textLight font-mono">A/C No: <span className="font-bold text-brand-navy">{activeSettings.bankAccountNo}</span></p>
                    <p className="text-brand-textLight font-mono">IFSC Code: <span className="font-bold text-brand-navy">{activeSettings.bankIfsc}</span></p>
                    {activeSettings.upiId && <p className="text-brand-textLight font-mono">UPI ID: <span className="font-bold text-brand-navy">{activeSettings.upiId}</span></p>}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="font-bold text-brand-navy uppercase tracking-wider text-[13px]">Transaction & Acknowledgment Notice:</p>
                    <p className="text-brand-textLight text-[13px]">
                      Payment received in full and verified via secure electronic gateway. Real-time transaction acknowledgment issued.
                    </p>
                    <p className="text-brand-textLight text-[13px] font-mono">
                      Place of Supply: {selectedInvoice.isInterstate ? 'Inter-State (IGST 18%)' : `${activeSettings.stateName} (State Code ${activeSettings.stateCode})`}
                    </p>
                  </div>
                )}

                <div className="flex flex-col justify-between text-right pt-2 sm:pt-0">
                  <div className="text-[13px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 p-2 rounded-lg text-left">
                    <p className="font-bold">ERPNext Synchronized</p>
                    <p className="truncate">Doc: {selectedInvoice.erpDocName || "Sales Invoice Verified"}</p>
                  </div>
                  <div className="mt-4 text-center sm:text-right">
                    <div className="inline-block border-b border-brand-navy/30 pb-1 px-4">
                      <p className="text-[13px] font-bold text-brand-navy">{activeSettings.authorizedSignatoryText}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Legal Notes */}
              <p className="text-xs text-brand-textLight text-center italic">
                {activeSettings.invoiceNotes}
              </p>
            </div>

            {/* Modal Bottom Close */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="rounded-xl border border-brand-navy/20 px-5 py-2 text-xs font-bold text-brand-navy hover:bg-brand-cream transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. INVOICE & BRANDING SETTINGS CONFIGURATION MODAL          */}
      {/* ============================================================ */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-brand-navy/10 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
              <div>
                <p className="text-[13px] font-bold uppercase tracking-wider text-brand-gold font-mono">Company Profile & ERP Configuration</p>
                <h3 className="font-display text-lg font-extrabold text-brand-navy">GST Invoice & Brand Settings</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-brand-navy/60 hover:text-brand-navy font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {settingsSavedToast && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 font-bold flex items-center gap-2">
                <span>✓</span>
                <span>Invoice branding settings saved successfully & updated in books!</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveSettingsMutation.mutate(settingsForm);
              }}
              className="space-y-4 text-xs"
            >
              {/* Brand Logo & Basic Names */}
              <div className="p-4 bg-brand-cream/60 rounded-2xl space-y-3">
                <h4 className="font-bold text-brand-navy uppercase tracking-wider text-sm">Brand Identity & Legal Name</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                      Brand Logo URL / Path
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="/favicon.svg or https://..."
                        value={settingsForm.logoUrl || ''}
                        onChange={(e) => setSettingsForm({ ...settingsForm, logoUrl: e.target.value })}
                        className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                      />
                      {settingsForm.logoUrl && (
                        <img
                          src={settingsForm.logoUrl}
                          alt="Logo Preview"
                          className="h-8 w-8 object-contain rounded border border-brand-navy/10 bg-white p-0.5 shrink-0"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                      Brand Trade Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Opus Overseas"
                      value={settingsForm.brandName || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, brandName: e.target.value })}
                      className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                    Company Registered Legal Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Opus Overseas Private Limited"
                    value={settingsForm.companyLegalName}
                    onChange={(e) => setSettingsForm({ ...settingsForm, companyLegalName: e.target.value })}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none font-bold"
                  />
                </div>
              </div>

              {/* GSTIN & Tax Details */}
              <div className="p-4 bg-white border border-brand-navy/10 rounded-2xl space-y-3">
                <h4 className="font-bold text-brand-navy uppercase tracking-wider text-sm">GST & Statutory Registrations</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                      Company GSTIN
                    </label>
                    <input
                      type="text"
                      placeholder="36AAFCO1234F1Z5"
                      value={settingsForm.gstin || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, gstin: e.target.value })}
                      className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                      PAN Number
                    </label>
                    <input
                      type="text"
                      placeholder="AAFCO1234F"
                      value={settingsForm.pan || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, pan: e.target.value })}
                      className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                      State Name & Code
                    </label>
                    <input
                      type="text"
                      placeholder="Telangana (36)"
                      value={`${settingsForm.stateName || 'Telangana'} (${settingsForm.stateCode || '36'})`}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSettingsForm({ ...settingsForm, stateName: val.replace(/\s*\(\d+\)/, ''), stateCode: val.match(/\d+/)?.[0] || '36' });
                      }}
                      className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                      Address Line 1 & Line 2
                    </label>
                    <input
                      type="text"
                      placeholder="Road No. 36, Jubilee Hills"
                      value={settingsForm.addressLine1 || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, addressLine1: e.target.value })}
                      className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        placeholder="Hyderabad"
                        value={settingsForm.city || ''}
                        onChange={(e) => setSettingsForm({ ...settingsForm, city: e.target.value })}
                        className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                        Pincode
                      </label>
                      <input
                        type="text"
                        placeholder="500033"
                        value={settingsForm.pincode || ''}
                        onChange={(e) => setSettingsForm({ ...settingsForm, pincode: e.target.value })}
                        className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bank & Remittance Settings */}
              <div className="p-4 bg-slate-50 border border-brand-navy/10 rounded-2xl space-y-3">
                <h4 className="font-bold text-brand-navy uppercase tracking-wider text-sm">Bank Settlement & UPI Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      placeholder="HDFC Bank"
                      value={settingsForm.bankName || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, bankName: e.target.value })}
                      className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      placeholder="50200012345678"
                      value={settingsForm.bankAccountNo || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, bankAccountNo: e.target.value })}
                      className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      placeholder="HDFC0001234"
                      value={settingsForm.bankIfsc || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, bankIfsc: e.target.value })}
                      className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none font-mono uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                      UPI ID (VPA)
                    </label>
                    <input
                      type="text"
                      placeholder="opusoverseas@hdfcbank"
                      value={settingsForm.upiId || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, upiId: e.target.value })}
                      className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                      Authorized Signatory Title
                    </label>
                    <input
                      type="text"
                      placeholder="For Opus Overseas — Authorized Signatory"
                      value={settingsForm.authorizedSignatoryText || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, authorizedSignatoryText: e.target.value })}
                      className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Bottom Save */}
              <div className="flex justify-end gap-3 pt-3 border-t border-brand-navy/10">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="rounded-xl border border-brand-navy/20 px-4 py-2 text-xs font-bold text-brand-navy hover:bg-brand-cream transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveSettingsMutation.isPending}
                  className="rounded-xl bg-brand-navy px-5 py-2 text-xs font-bold text-white hover:bg-brand-gold hover:text-brand-navy transition cursor-pointer shadow-md"
                >
                  {saveSettingsMutation.isPending ? "Saving..." : "Save Invoice Settings →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. CREATE NEW INVOICE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-brand-navy/10 space-y-5">
            <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
              <div>
                <p className="text-[13px] font-bold uppercase tracking-wider text-brand-gold font-mono">New Billing Entry</p>
                <h3 className="font-display text-lg font-extrabold text-brand-navy">Generate Tax Invoice & Sync to ERPNext</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-brand-navy/60 hover:text-brand-navy font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                {formError}
              </div>
            )}

            <div className="space-y-3.5">
              <div>
                <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                  Client Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mohammed Farooq"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                    Client Mobile (WhatsApp)
                  </label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                    Client Email
                  </label>
                  <input
                    type="email"
                    placeholder="client@example.com"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                    Total Amount in Rupees (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 25000"
                    value={amountRupees}
                    onChange={(e) => setAmountRupees(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                    Payment Method
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    <option value="bank_transfer">Bank Transfer (NEFT/RTGS)</option>
                    <option value="upi">UPI / QR Code</option>
                    <option value="cash">Cash / Counter</option>
                    <option value="razorpay">Razorpay Gateway</option>
                    <option value="cheque">Cheque / DD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-1">
                  Service Milestone / Purpose
                </label>
                <input
                  type="text"
                  value={milestoneName}
                  onChange={(e) => setMilestoneName(e.target.value)}
                  placeholder="e.g. Study Abroad Application Processing / Visa Assistance"
                  className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isInterstate"
                  checked={isInterstate}
                  onChange={(e) => setIsInterstate(e.target.checked)}
                  className="h-4 w-4 rounded border-brand-navy/20 text-brand-gold focus:ring-brand-gold"
                />
                <label htmlFor="isInterstate" className="text-xs text-brand-navy select-none cursor-pointer">
                  Inter-State Supply (Apply 18% IGST instead of CGST 9% + SGST 9%)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-brand-navy/10">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-brand-navy/20 px-4 py-2 text-xs font-bold text-brand-navy hover:bg-brand-cream transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => createInvoiceMutation.mutate()}
                disabled={createInvoiceMutation.isPending}
                className="rounded-xl bg-brand-navy px-5 py-2 text-xs font-bold text-white hover:bg-brand-gold hover:text-brand-navy transition cursor-pointer shadow-md"
              >
                {createInvoiceMutation.isPending ? "Generating & Syncing..." : "Generate & Push to ERPNext →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

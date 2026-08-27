/**
 * Statutory Indian GST Classification & Calculation
 * Entity: Opus Overseas / Cordial Crafts (GSTIN: 36ALPPH3337R1ZE, Telangana)
 * Regime: Standard 18% GST with full Input Tax Credit (ITC)
 * 
 * Statutory Rates Across All Business Divisions:
 * Intra-State (Telangana): 9% CGST + 9% SGST (Total: 18%)
 * Inter-State (Rest of India): 18% IGST
 * 
 * SAC Codes:
 * 1. Study Abroad / Education Consulting: SAC 998311 / 999293
 * 2. Visa Advisory: SAC 998311 / 998559
 * 3. Attestation & Legalization: SAC 998214 / 998319
 * 4. Manpower Placement & Recruitment: SAC 998512 / 998511
 * 5. Umrah & Tour Operator Packages (with full ITC): SAC 998555
 * 6. General Professional Services (Default): SAC 9983
 */

export interface GstRateConfig {
  sacCode: string;
  description: string;
  standardRate: number; // percentage: 18%
  cgstRate: number;     // intra-state Central GST: 9%
  sgstRate: number;     // intra-state State GST: 9%
  igstRate: number;     // inter-state Integrated GST: 18%
}

export const DIVISION_GST_CONFIG: Record<string, GstRateConfig> = {
  "study-abroad": {
    sacCode: "998311",
    description: "Management Consulting & International Education Advisory",
    standardRate: 18,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
  },
  "visa": {
    sacCode: "998311",
    description: "Immigration & Visa Processing Consultancy Services",
    standardRate: 18,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
  },
  "attestation": {
    sacCode: "998214",
    description: "Document Authentication & Embassy Attestation Support",
    standardRate: 18,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
  },
  "manpower": {
    sacCode: "998512",
    description: "Executive Recruitment & Overseas Placement Services",
    standardRate: 18,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
  },
  "umrah": {
    sacCode: "998555",
    description: "Tour Operator Services for Pilgrimage Packages (Full ITC)",
    standardRate: 18,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
  },
  "default": {
    sacCode: "9983",
    description: "Other Professional, Technical and Business Services",
    standardRate: 18,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 18,
  },
};

export interface GstSplitResult {
  taxableAmount: number; // paise
  cgst: number;          // paise
  sgst: number;          // paise
  igst: number;          // paise
  gstTotal: number;      // paise
  isInterstate: boolean;
  rate: number;          // total %
  cgstRate: number;      // %
  sgstRate: number;      // %
  igstRate: number;      // %
}

/**
 * Calculates GST-inclusive split in integer paise.
 * For intra-state transactions (Telangana -> Telangana): CGST + SGST (50% each of total tax).
 * For inter-state transactions: IGST (100% of total tax).
 */
export function calculateGstSplit(
  grossAmountPaise: number,
  isInterstate: boolean = false,
  ratePercentage: number = 18
): GstSplitResult {
  const rate = typeof ratePercentage === "number" && ratePercentage >= 0 ? ratePercentage : 18;

  if (rate === 0 || grossAmountPaise <= 0) {
    return {
      taxableAmount: grossAmountPaise,
      cgst: 0,
      sgst: 0,
      igst: 0,
      gstTotal: 0,
      isInterstate: !!isInterstate,
      rate: 0,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 0,
    };
  }

  const multiplier = 1 + rate / 100;
  const taxableAmount = Math.round(grossAmountPaise / multiplier);
  const gstTotal = grossAmountPaise - taxableAmount;

  if (isInterstate) {
    return {
      taxableAmount,
      cgst: 0,
      sgst: 0,
      igst: gstTotal,
      gstTotal,
      isInterstate: true,
      rate,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: rate,
    };
  }

  const halfRate = rate / 2;
  const cgst = Math.floor(gstTotal / 2);
  const sgst = gstTotal - cgst;

  return {
    taxableAmount,
    cgst,
    sgst,
    igst: 0,
    gstTotal,
    isInterstate: false,
    rate,
    cgstRate: halfRate,
    sgstRate: halfRate,
    igstRate: 0,
  };
}

import { describe, it, expect } from "vitest";
import { calculateGstSplit, DIVISION_GST_CONFIG } from "@opusos/shared";

describe("GST Statutory Split & Rate Calculation", () => {
  it("computes 18% GST intra-state (Telangana): 9% CGST + 9% SGST", () => {
    // ₹11,800 total (1,180,000 paise) -> Taxable: ₹10,000 (1,000,000 paise), CGST: ₹900 (90,000 paise), SGST: ₹900 (90,000 paise)
    const result = calculateGstSplit(1180000, false, 18);
    expect(result.taxableAmount).toBe(1000000);
    expect(result.cgst).toBe(90000);
    expect(result.sgst).toBe(90000);
    expect(result.igst).toBe(0);
    expect(result.cgstRate).toBe(9);
    expect(result.sgstRate).toBe(9);
    expect(result.igstRate).toBe(0);
    expect(result.rate).toBe(18);
    expect(result.isInterstate).toBe(false);
  });

  it("computes 18% GST inter-state (Outside Telangana): 18% IGST", () => {
    const result = calculateGstSplit(1180000, true, 18);
    expect(result.taxableAmount).toBe(1000000);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.igst).toBe(180000);
    expect(result.igstRate).toBe(18);
    expect(result.isInterstate).toBe(true);
  });

  it("computes 5% GST for Umrah tour packages intra-state: 2.5% CGST + 2.5% SGST", () => {
    // ₹105,000 total (10,500,000 paise) @ 5% -> Taxable: ₹100,000 (10,000,000 paise), CGST: ₹2,500 (250,000 paise), SGST: ₹2,500 (250,000 paise)
    const result = calculateGstSplit(10500000, false, 5);
    expect(result.taxableAmount).toBe(10000000);
    expect(result.cgst).toBe(250000);
    expect(result.sgst).toBe(250000);
    expect(result.igst).toBe(0);
    expect(result.cgstRate).toBe(2.5);
    expect(result.sgstRate).toBe(2.5);
  });

  it("computes 5% GST for Umrah tour packages inter-state: 5% IGST", () => {
    const result = calculateGstSplit(10500000, true, 5);
    expect(result.taxableAmount).toBe(10000000);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.igst).toBe(500000);
    expect(result.igstRate).toBe(5);
  });

  it("has accurate statutory SAC codes configured for all business verticals with 9% CGST + 9% SGST", () => {
    expect(DIVISION_GST_CONFIG["study-abroad"].standardRate).toBe(18);
    expect(DIVISION_GST_CONFIG["study-abroad"].cgstRate).toBe(9);
    expect(DIVISION_GST_CONFIG["study-abroad"].sgstRate).toBe(9);

    expect(DIVISION_GST_CONFIG["visa"].standardRate).toBe(18);
    expect(DIVISION_GST_CONFIG["attestation"].standardRate).toBe(18);
    expect(DIVISION_GST_CONFIG["manpower"].standardRate).toBe(18);

    expect(DIVISION_GST_CONFIG["umrah"].standardRate).toBe(18);
    expect(DIVISION_GST_CONFIG["umrah"].cgstRate).toBe(9);
    expect(DIVISION_GST_CONFIG["umrah"].sgstRate).toBe(9);
    expect(DIVISION_GST_CONFIG["umrah"].igstRate).toBe(18);
  });
});

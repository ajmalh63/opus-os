/**
 * OpusOS Professional Email Templates Engine
 * 
 * Standardized, responsive HTML email templates infused with Opus Overseas Brand DNA:
 * - Brand Navy: #0a2d50
 * - Brand Blue: #235a96
 * - Brand Gold: #d7a019
 * - Brand Gold BG: #FAF3DC
 * - Brand Gold Light: #F5E6B8
 * - Brand Cream: #FAF8F4
 * - Brand Text Dark: #0a2d50
 * - Brand Text Light: #4B5563
 * - Slate / Muted: #718096
 * - Headings & Buttons: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
 * - Body Typography: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
 */

/**
 * Reusable Gold Bulletproof CTA Button with brand elevation
 */
function ctaButton(label: string, url: string): string {
  return `
<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:28px 0 24px 0;">
  <tr>
    <td align="center" style="border-radius:30px;background-color:#d7a019;box-shadow:0 4px 14px rgba(215,160,25,0.32);">
      <a href="${url}" target="_blank" style="display:inline-block;padding:15px 36px;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:800;color:#0a2d50;text-decoration:none;text-transform:uppercase;letter-spacing:1.2px;border-radius:30px;">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}

/**
 * Reusable Info Card Box (Brand Cream + Gold tint border)
 */
function infoBox(rows: { label: string; value: string }[]): string {
  const rowHtml = rows.map(r => `
    <tr>
      <td style="padding:9px 0;font-family:'IBM Plex Sans',-apple-system,sans-serif;font-size:13px;color:#718096;font-weight:500;width:38%;vertical-align:top;">${r.label}</td>
      <td style="padding:9px 0;font-family:'IBM Plex Sans',-apple-system,sans-serif;font-size:14px;color:#0a2d50;font-weight:700;vertical-align:top;">${r.value}</td>
    </tr>
  `).join('');

  return `
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:22px 0;background-color:#fcfbf9;border:1px solid #ede8df;border-radius:14px;padding:16px 22px;">
  ${rowHtml}
</table>`;
}

/**
 * Reusable Highlight Banner Box
 */
function highlightBanner(text: string, icon = '🔒'): string {
  return `
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:20px 0;background-color:#FAF3DC;border:1px solid #F5E6B8;border-radius:12px;padding:13px 18px;">
  <tr>
    <td style="font-family:'IBM Plex Sans',-apple-system,sans-serif;font-size:13px;color:#0a2d50;line-height:1.5;">
      ${icon} ${text}
    </td>
  </tr>
</table>`;
}

// ============================================================================
// 1. Authentication & Security Templates
// ============================================================================

export interface VerificationEmailParams {
  name: string;
  verifyUrl: string;
}

export function verificationEmailTemplate(params: VerificationEmailParams): { subject: string; html: string } {
  const name = params.name || 'Valued Member';
  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">Welcome to Opus Overseas</h2>
    <p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Hello <strong>${name}</strong>, thank you for creating your account with Opus Overseas.
    </p>
    <p style="margin:0 0 20px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Please verify your email address to activate your account and access your client workspace.
    </p>
    ${ctaButton('Activate Account →', params.verifyUrl)}
    ${highlightBanner('This activation link is personalized and secure for your account.')}
    <p style="margin:24px 0 8px 0;font-family:'IBM Plex Sans',sans-serif;color:#718096;font-size:12px;line-height:1.5;">
      If the button above does not work, copy and paste this link into your browser:
    </p>
    <p style="margin:0;word-break:break-all;font-family:'IBM Plex Sans',sans-serif;font-size:12px;color:#718096;">
      <a href="${params.verifyUrl}" style="color:#0a2d50;font-weight:600;text-decoration:underline;">${params.verifyUrl}</a>
    </p>
  `;
  return {
    subject: 'Verify & Activate Your Opus Overseas Account',
    html: html.trim(),
  };
}

export interface PasswordResetEmailParams {
  name: string;
  resetUrl: string;
  expiresInMinutes?: number;
}

export function passwordResetEmailTemplate(params: PasswordResetEmailParams): { subject: string; html: string } {
  const name = params.name || 'Valued Member';
  const expiry = params.expiresInMinutes || 10;
  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">Reset Your Password</h2>
    <p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Hello <strong>${name}</strong>, we received a request to reset the password for your Opus Overseas account.
    </p>
    <p style="margin:0 0 20px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Click the button below to choose a new password. This secure link is valid for <strong>${expiry} minutes</strong>.
    </p>
    ${ctaButton('Reset Password →', params.resetUrl)}
    ${highlightBanner(`This security link expires in ${expiry} minutes. If you did not request a password reset, you can safely ignore this email.`)}
    <p style="margin:24px 0 8px 0;font-family:'IBM Plex Sans',sans-serif;color:#718096;font-size:12px;line-height:1.5;">
      Button not working? Copy and paste this link:
    </p>
    <p style="margin:0;word-break:break-all;font-family:'IBM Plex Sans',sans-serif;font-size:12px;color:#718096;">
      <a href="${params.resetUrl}" style="color:#0a2d50;font-weight:600;text-decoration:underline;">${params.resetUrl}</a>
    </p>
  `;
  return {
    subject: 'Reset Your Opus Overseas Password',
    html: html.trim(),
  };
}

export interface OtpEmailParams {
  name?: string;
  otpCode: string;
  expiresInMinutes?: number;
}

export function otpEmailTemplate(params: OtpEmailParams): { subject: string; html: string } {
  const expiry = params.expiresInMinutes || 10;
  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">Your Security Code</h2>
    <p style="margin:0 0 20px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Use the one-time authentication code below to complete your sign-in to Opus Overseas:
    </p>
    <div style="margin:26px 0;padding:24px;background-color:#FAF8F4;border:2px dashed #d7a019;border-radius:16px;text-align:center;">
      <span style="font-family:'Montserrat',monospace,Consolas;font-size:36px;font-weight:800;letter-spacing:10px;color:#0a2d50;display:inline-block;">
        ${params.otpCode}
      </span>
    </div>
    ${highlightBanner(`This code is valid for ${expiry} minutes. For your security, never share this code with anyone.`)}
  `;
  return {
    subject: `Your Opus Overseas Code: ${params.otpCode}`,
    html: html.trim(),
  };
}

// ============================================================================
// 2. Payments & Transaction Receipts
// ============================================================================

export interface PaymentReceiptParams {
  clientName: string;
  amountPaise: number;
  milestoneName: string;
  paymentId: string;
  paymentMethod?: string;
  date?: string;
  portalUrl?: string;
}

export function paymentReceiptTemplate(params: PaymentReceiptParams): { subject: string; html: string } {
  const formattedAmount = `₹${(params.amountPaise / 100).toLocaleString('en-IN')}`;
  const dateStr = params.date || new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const portalUrl = params.portalUrl || 'https://opusoverseas.com/login';

  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">Payment Confirmation</h2>
    <p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Dear <strong>${params.clientName}</strong>, we have successfully received and verified your payment.
    </p>
    ${infoBox([
      { label: 'Amount Paid:', value: formattedAmount },
      { label: 'Payment For:', value: params.milestoneName },
      { label: 'Transaction ID:', value: params.paymentId },
      { label: 'Payment Date:', value: dateStr },
      { label: 'Status:', value: 'Verified & Confirmed ✓' },
    ])}
    ${ctaButton('View In Client Workspace →', portalUrl)}
    <p style="margin:16px 0 0 0;font-family:'IBM Plex Sans',sans-serif;color:#718096;font-size:12px;line-height:1.5;">
      Your official tax invoice and milestone receipt have been updated in your client portal.
    </p>
  `;
  return {
    subject: `Opus Overseas — payment receipt ${params.paymentId} (${formattedAmount})`,
    html: html.trim(),
  };
}

// ============================================================================
// 3. Service Agreements & E-Signatures
// ============================================================================

export interface AgreementInviteParams {
  clientName: string;
  agreementTitle: string;
  signUrl: string;
  expiryDays?: number;
}

export function agreementInviteTemplate(params: AgreementInviteParams): { subject: string; html: string } {
  const days = params.expiryDays || 7;
  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">Service Agreement Ready for Signature</h2>
    <p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Dear <strong>${params.clientName}</strong>, your formal service agreement with Opus Overseas is ready for electronic review and signature.
    </p>
    ${infoBox([
      { label: 'Agreement Title:', value: params.agreementTitle },
      { label: 'Review Period:', value: `${days} Days` },
      { label: 'Format:', value: 'Secure Digital E-Signature' },
    ])}
    ${ctaButton('Review & Sign Agreement →', params.signUrl)}
    <p style="margin:16px 0 0 0;font-family:'IBM Plex Sans',sans-serif;color:#718096;font-size:12px;line-height:1.5;">
      Please complete the signature process to proceed with your onboarding and case filing.
    </p>
  `;
  return {
    subject: `Action Required: Please sign your ${params.agreementTitle}`,
    html: html.trim(),
  };
}

export interface AgreementSignedParams {
  clientName: string;
  agreementTitle: string;
  downloadUrl: string;
  signedDate?: string;
}

export function agreementSignedTemplate(params: AgreementSignedParams): { subject: string; html: string } {
  const dateStr = params.signedDate || new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">Agreement Executed Successfully</h2>
    <p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Dear <strong>${params.clientName}</strong>, your service agreement has been executed and signed by all parties.
    </p>
    ${infoBox([
      { label: 'Agreement Title:', value: params.agreementTitle },
      { label: 'Executed On:', value: dateStr },
      { label: 'Status:', value: 'Legally Executed & Archived ✓' },
    ])}
    ${ctaButton('Download Executed Copy →', params.downloadUrl)}
    <p style="margin:16px 0 0 0;font-family:'IBM Plex Sans',sans-serif;color:#718096;font-size:12px;line-height:1.5;">
      A permanent tamper-evident copy of this agreement is stored in your client portal.
    </p>
  `;
  return {
    subject: `Executed Copy: ${params.agreementTitle}`,
    html: html.trim(),
  };
}

// ============================================================================
// 4. Study Abroad & Operational Updates
// ============================================================================

export interface StudyAbroadMilestoneParams {
  clientName: string;
  universityName: string;
  courseName?: string;
  stageTitle: string;
  details: string;
  portalUrl?: string;
}

export function studyAbroadMilestoneTemplate(params: StudyAbroadMilestoneParams): { subject: string; html: string } {
  const portalUrl = params.portalUrl || 'https://opusoverseas.com/login';
  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">Application Update: ${params.stageTitle}</h2>
    <p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Dear <strong>${params.clientName}</strong>, there is a new milestone update regarding your university application.
    </p>
    ${infoBox([
      { label: 'University:', value: params.universityName },
      ...(params.courseName ? [{ label: 'Program:', value: params.courseName }] : []),
      { label: 'Status:', value: params.stageTitle },
    ])}
    <p style="margin:16px 0 20px 0;font-family:'IBM Plex Sans',sans-serif;color:#0a2d50;font-size:14px;line-height:1.6;background-color:#FAF3DC;padding:14px 18px;border-radius:10px;border-left:4px solid #d7a019;">
      ${params.details}
    </p>
    ${ctaButton('Track In Student Portal →', portalUrl)}
  `;
  return {
    subject: `Study Abroad Update: ${params.universityName} — ${params.stageTitle}`,
    html: html.trim(),
  };
}

export interface AttestationProgressParams {
  clientName: string;
  documentType: string;
  currentStage: string;
  country?: string;
  awbNumber?: string;
  portalUrl?: string;
}

export function attestationProgressTemplate(params: AttestationProgressParams): { subject: string; html: string } {
  const portalUrl = params.portalUrl || 'https://opusoverseas.com/login';
  const rows = [
    { label: 'Document:', value: params.documentType },
    { label: 'Current Stage:', value: params.currentStage },
    ...(params.country ? [{ label: 'Destination:', value: params.country }] : []),
    ...(params.awbNumber ? [{ label: 'Tracking AWB:', value: params.awbNumber }] : []),
  ];

  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">Document Attestation Progress</h2>
    <p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Dear <strong>${params.clientName}</strong>, your document authentication chain has advanced to the next milestone.
    </p>
    ${infoBox(rows)}
    ${ctaButton('View Live Document Tracker →', portalUrl)}
  `;
  return {
    subject: `Attestation Update: ${params.documentType} — ${params.currentStage}`,
    html: html.trim(),
  };
}

// ============================================================================
// 5. Partner Program Payouts
// ============================================================================

export interface PartnerPayoutParams {
  partnerName: string;
  payoutAmountPaise: number;
  clientRef?: string;
  payoutId: string;
  partnerPortalUrl?: string;
}

export function partnerPayoutTemplate(params: PartnerPayoutParams): { subject: string; html: string } {
  const formatted = `₹${(params.payoutAmountPaise / 100).toLocaleString('en-IN')}`;
  const portalUrl = params.partnerPortalUrl || 'https://opusoverseas.com/partner';
  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">Commission Payout Approved</h2>
    <p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Dear <strong>${params.partnerName}</strong>, your referral commission payout has been approved and processed.
    </p>
    ${infoBox([
      { label: 'Commission Amount:', value: formatted },
      { label: 'Payout ID:', value: params.payoutId },
      ...(params.clientRef ? [{ label: 'Client Reference:', value: params.clientRef }] : []),
      { label: 'Status:', value: 'Processed & Credited ✓' },
    ])}
    ${ctaButton('Open Partner Dashboard →', portalUrl)}
  `;
  return {
    subject: `Partner Commission Credit: ${formatted} (${params.payoutId})`,
    html: html.trim(),
  };
}

// ============================================================================
// 6a. Document Verification — client document review outcome
// ============================================================================

export interface DocumentVerifiedParams {
  clientName: string;
  fileName: string;
  note?: string;
  portalUrl?: string;
}

export function documentVerifiedTemplate(params: DocumentVerifiedParams): { subject: string; html: string } {
  const portalUrl = params.portalUrl || 'https://opusoverseas.com/login';
  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">Document Verified ✓</h2>
    <p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Dear <strong>${params.clientName}</strong>, great news — one of your documents has been verified by our team.
    </p>
    ${infoBox([
      { label: 'Document:', value: params.fileName },
      { label: 'Status:', value: 'Verified & Accepted ✓' },
      ...(params.note ? [{ label: 'Note:', value: params.note }] : []),
    ])}
    ${highlightBanner('Your file is now marked verified and will be included in your case submission.')}
    ${ctaButton('View Document Centre →', portalUrl)}
  `;
  return {
    subject: `Document verified ✓ — ${params.fileName}`,
    html: html.trim(),
  };
}

// ============================================================================
// 6b. Partner Payout Status — approved / paid
// ============================================================================

export interface PayoutStatusParams {
  partnerName: string;
  amountPaise: number;
  status: 'approved' | 'paid';
  payoutId?: string;
  partnerPortalUrl?: string;
}

export function payoutStatusTemplate(params: PayoutStatusParams): { subject: string; html: string } {
  const formatted = `₹${(params.amountPaise / 100).toLocaleString('en-IN')}`;
  const portalUrl = params.partnerPortalUrl || 'https://opusoverseas.com/partner';
  const isPaid = params.status === 'paid';
  const title = isPaid ? 'Payout Settled' : 'Payout Approved';
  const statusLabel = isPaid ? 'Settled & Transferred ✓' : 'Approved — Settlement In Progress';
  const ctaLabel = isPaid ? 'View Settlement →' : 'Track Payout →';
  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">${title}</h2>
    <p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Dear <strong>${params.partnerName}</strong>, your referral commission payout has been <strong>${params.status}</strong>.
    </p>
    ${infoBox([
      { label: 'Amount:', value: formatted },
      ...(params.payoutId ? [{ label: 'Payout ID:', value: params.payoutId }] : []),
      { label: 'Status:', value: statusLabel },
    ])}
    ${isPaid ? highlightBanner('Funds have been transferred to your registered settlement account.', '💸') : highlightBanner('Settlement will be credited to your registered account shortly.')}
    ${ctaButton(ctaLabel, portalUrl)}
  `;
  return {
    subject: isPaid ? `Payout settled — ${formatted}` : `Payout approved — ${formatted}`,
    html: html.trim(),
  };
}

// ============================================================================
// 6c. Partner Payout Request Received — acknowledgement
// ============================================================================

export interface PayoutRequestReceivedParams {
  partnerName: string;
  amountPaise: number;
  requestedAt?: string;
  partnerPortalUrl?: string;
}

export function payoutRequestReceivedTemplate(params: PayoutRequestReceivedParams): { subject: string; html: string } {
  const formatted = `₹${(params.amountPaise / 100).toLocaleString('en-IN')}`;
  const dateStr = params.requestedAt || new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const portalUrl = params.partnerPortalUrl || 'https://opusoverseas.com/partner';
  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">Payout Request Received</h2>
    <p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Dear <strong>${params.partnerName}</strong>, we have received your commission payout request and queued it for owner approval.
    </p>
    ${infoBox([
      { label: 'Requested Amount:', value: formatted },
      { label: 'Requested On:', value: dateStr },
      { label: 'Status:', value: 'Awaiting Approval' },
    ])}
    ${highlightBanner('Our team will review and approve your request promptly. You will receive a confirmation once it is processed.')}
    ${ctaButton('Open Partner Dashboard →', portalUrl)}
  `;
  return {
    subject: `Payout request received — ${formatted}`,
    html: html.trim(),
  };
}

// ============================================================================
// 7. Consultations & Lifecycle Nurture
// ============================================================================

export interface BookingConfirmationParams {
  clientName: string;
  counselorName: string;
  meetingTime: string;
  meetingLink: string;
}

export function bookingConfirmationTemplate(params: BookingConfirmationParams): { subject: string; html: string } {
  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">Consultation Confirmed</h2>
    <p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Dear <strong>${params.clientName}</strong>, your 1-on-1 consultation session with our advisory team has been scheduled.
    </p>
    ${infoBox([
      { label: 'Counselor:', value: params.counselorName },
      { label: 'Scheduled Time:', value: params.meetingTime },
      { label: 'Format:', value: 'Online Video Consultation' },
    ])}
    ${ctaButton('Join Video Consultation →', params.meetingLink)}
  `;
  return {
    subject: `Consultation Confirmed: ${params.meetingTime} with ${params.counselorName}`,
    html: html.trim(),
  };
}

export interface NurtureTouchParams {
  leadName?: string;
  heading: string;
  messageBody: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export function nurtureTouchTemplate(params: NurtureTouchParams): { subject: string; html: string } {
  const name = params.leadName || 'Valued Visitor';
  const cta = params.ctaLabel && params.ctaUrl ? ctaButton(params.ctaLabel, params.ctaUrl) : '';
  const html = `
    <h2 style="margin:0 0 14px 0;font-family:'Montserrat',-apple-system,BlinkMacSystemFont,sans-serif;color:#0a2d50;font-size:22px;font-weight:700;letter-spacing:-0.03em;">${params.heading}</h2>
    <p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      Hello <strong>${name}</strong>,
    </p>
    <p style="margin:0 0 20px 0;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;color:#4B5563;font-size:15px;line-height:1.6;">
      ${params.messageBody}
    </p>
    ${cta}
  `;
  return {
    subject: params.heading,
    html: html.trim(),
  };
}

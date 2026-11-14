/**
 * The gradefarm. email look, shared by every email: the welcome email
 * (welcome-email.ts) builds its own body from these pieces, and every other
 * email goes through renderEmail (email.ts), which uses them too.
 *
 * Table-based HTML with inline styles, so it holds together in Gmail,
 * Outlook and Apple Mail. Images (wordmark, icons) are served from the web
 * app's public/email folder.
 */
import { appUrl, escapeHtml } from "./email";

export const FONT = "'Plus Jakarta Sans',Arial,Helvetica,sans-serif";
export const NAVY = "#0c1037";
export const GOLD = "#f1be43";
export const GOLD_TEXT = "#a16207";
export const BODY = "#475069";
export const MUTED = "#5a6178";
export const LINE = "#e2e6f0";
export const CARD = "#f6f7fb";
export const PAGE = "#eef0f6";

export const SUPPORT_EMAIL = "support@titaniumtutoring.com.au";

export const img = (file: string) => `${appUrl()}/email/${file}`;

/** Hidden inbox preview text, padded so the client doesn't pull body text in after it. */
const preheader = (text: string) =>
  `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE}">${escapeHtml(text)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>`;

/** The whole document: page background, the white card holding `body` (table rows), and the footer under it. */
export function page(opts: { title: string; preheader?: string; body: string; footer: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(opts.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&amp;display=swap" rel="stylesheet">
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%}
  img{border:0;outline:none;text-decoration:none}
  a{color:${GOLD_TEXT}}
  @media (max-width:620px){
    .gf-pad{padding-left:24px!important;padding-right:24px!important}
    .gf-card{padding:18px 14px!important}
    .gf-h1{font-size:28px!important}
    .gf-h1s{font-size:22px!important}
    .gf-sq{width:40px!important;height:40px!important}
    .gf-col{display:block!important;width:100%!important;padding:0 0 10px!important}
    .gf-line{padding:0 4px!important}
    .gf-stack{display:block!important;padding:14px 0 0!important}
    .gf-dl{display:block!important;width:auto!important;padding:10px 14px 0!important}
    .gf-dv{display:block!important;padding:2px 14px 10px!important;border-top:0!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE}">
${opts.preheader ? preheader(opts.preheader) : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;border-collapse:separate;font-family:${FONT};color:${NAVY}">
${opts.body}
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td style="padding:16px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED}">${opts.footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The light wordmark as the card's first row. */
export const wordmarkRow = () =>
  `<tr><td class="gf-pad" style="padding:28px 40px 0"><img src="${img("wordmark-light.png")}" width="144" height="24" alt="gradefarm." style="display:block;width:144px;height:24px"></td></tr>`;

/** A gold button that still looks like one where padding on links is ignored. */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border-radius:10px;background:${GOLD}"><a href="${escapeHtml(href)}" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:15px;font-weight:800;line-height:1;color:${NAVY};text-decoration:none;white-space:nowrap;border-radius:10px">${escapeHtml(label)}</a></td>
</tr></table>`;
}

/** Small gold capitals above a section. */
export const label = (text: string) =>
  `<div style="font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:1.4px;color:${GOLD_TEXT}">${escapeHtml(text)}</div>`;

const COMPANY = "gradefarm. is run by Titanium Tutoring, Adelaide, SA.";

/** The footer under the card: why they got it, who we are, and (for automated mail) how to stop it. */
export function footer(why: string, unsubscribe?: { url: string; label: string }): string {
  const stop = unsubscribe
    ? `<br><a href="${escapeHtml(unsubscribe.url)}" style="color:${MUTED};text-decoration:underline">${escapeHtml(unsubscribe.label)}</a>`
    : "";
  return `${escapeHtml(why)} ${COMPANY} Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:${MUTED}">${SUPPORT_EMAIL}</a>${stop}`;
}

export function footerText(why: string, unsubscribe?: { url: string; label: string }): string {
  return `${why} ${COMPANY} Questions? ${SUPPORT_EMAIL}${unsubscribe ? `\n${unsubscribe.label}: ${unsubscribe.url}` : ""}`;
}

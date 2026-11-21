/**
 * The account emails Supabase Auth sends itself: confirm your email, reset
 * your password, and confirm a change of email. They're built here with the
 * shared layout (renderEmail) so they match every other email, then written
 * to supabase/templates/ by scripts/auth-email-templates.ts and pasted into
 * the Supabase dashboard (Authentication → Emails → Templates).
 *
 * The {{ .ConfirmationURL }}, {{ .Email }} and {{ .NewEmail }} placeholders
 * are Supabase's (Go templates), filled in when it sends. They pass through
 * renderEmail's escaping unchanged, since they hold no HTML characters.
 */
import { renderEmail, type EmailContent } from "./email";

export type AuthTemplate = {
  /** File name under supabase/templates/. */
  file: string;
  /** The dashboard's name for the template. */
  dashboardName: string;
  subject: string;
  content: EmailContent;
};

export const AUTH_TEMPLATES: AuthTemplate[] = [
  {
    file: "confirm-signup.html",
    dashboardName: "Confirm signup",
    subject: "Confirm your email for gradefarm.",
    content: {
      heading: "Confirm your email",
      preview: "One click and your gradefarm. account is ready.",
      paragraphs: [
        "Thanks for signing up to gradefarm. Confirm that {{ .Email }} is your email address and your account is ready to go.",
      ],
      cta: { label: "Confirm my email", url: "{{ .ConfirmationURL }}" },
      footer: "You're receiving this because this email address was used to sign up to gradefarm. If that wasn't you, ignore this email and nothing more will happen.",
    },
  },
  {
    file: "reset-password.html",
    dashboardName: "Reset password",
    subject: "Reset your gradefarm. password",
    content: {
      heading: "Reset your password",
      preview: "Choose a new password for your gradefarm. account.",
      paragraphs: [
        "We got a request to reset the password for {{ .Email }}. Choose a new one with the button below. The link works once.",
      ],
      cta: { label: "Choose a new password", url: "{{ .ConfirmationURL }}" },
      footer: "You're receiving this because a password reset was requested for your gradefarm. account. If that wasn't you, ignore this email: your password stays the same.",
    },
  },
  {
    file: "change-email.html",
    dashboardName: "Change email address",
    subject: "Confirm your new email for gradefarm.",
    content: {
      heading: "Confirm your new email",
      preview: "Confirm the change to your gradefarm. sign-in email.",
      paragraphs: [
        "You asked to change your gradefarm. sign-in email from {{ .Email }} to {{ .NewEmail }}. Confirm it and the change goes through.",
      ],
      cta: { label: "Confirm the change", url: "{{ .ConfirmationURL }}" },
      footer: "You're receiving this because a change of email was requested for a gradefarm. account. If that wasn't you, don't click the link, and tell us at once.",
    },
  },
];

/** The template's HTML, as pasted into the dashboard. */
export function authTemplateHtml(t: AuthTemplate): string {
  return renderEmail(t.content).html;
}

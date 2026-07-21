/**
 * Email sender using Resend.
 * https://resend.com — free tier: 3,000 emails/month, 100/day.
 *
 * Setup:
 *  1. nippysky.com is already verified on Resend (Akù uses it) — reuse it.
 *  2. Create a dedicated API key for Ụgwọ → set RESEND_API_KEY in .env
 *  3. Set EMAIL_FROM to "Ụgwọ <auth@nippysky.com>"
 */
import { Resend } from 'resend';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set');
    _resend = new Resend(key);
  }
  return _resend;
}

function getFrom(): string {
  return process.env.EMAIL_FROM ?? 'Ụgwọ <onboarding@resend.dev>';
}

// ─── Magic Link Email ─────────────────────────────────────────────────────────

export async function sendMagicLinkEmail(opts: {
  to:       string;
  name:     string | null;
  url:      string;
  otpCode?: string;
}): Promise<void> {
  const resend     = getResend();
  const firstName  = opts.name ? opts.name.split(' ')[0] : null;
  const expiryMins = process.env.MAGIC_LINK_EXPIRY_MINUTES ?? '15';

  const html = magicLinkTemplate({ firstName, url: opts.url, expiryMins, otpCode: opts.otpCode });

  const { error } = await resend.emails.send({
    from:    getFrom(),
    to:      opts.to,
    subject: '🔐 Your Ụgwọ sign-in link',
    html,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

// ─── Brand tokens ─────────────────────────────────────────────────────────────
// Kept in sync with src/theme/colors.ts and server/public/styles.css so the
// email, app and marketing site all read as the same product.

const BRAND = {
  indigo:      '#1E2A4A',
  indigoLight: '#2A3A63',
  amber:       '#E8A33D',
  amberLight:  '#F0BC6B',
  paper:       '#FAF9F7',
  ink:         '#101114',
  slate:       '#53555C',
  slateLight:  '#87898F',
  hairline:    '#E5E2DB',
  logoUrl:     'https://ugwo.nippysky.com/img/icon-rounded-256.png',
};

const FONT_SERIF = "'Fraunces',Georgia,'Times New Roman',serif";
const FONT_SANS  = "'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif";

// ─── Template ─────────────────────────────────────────────────────────────────

function magicLinkTemplate(opts: {
  firstName:  string | null;
  url:        string;
  expiryMins: string;
  otpCode?:   string;
}): string {
  const { firstName, url, expiryMins, otpCode } = opts;
  const greeting = firstName ? `Hi ${firstName}` : 'Hi there';

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="light"/>
  <meta name="supported-color-schemes" content="light"/>
  <title>Sign in to Ụgwọ</title>
  <!--[if !mso]><!-->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <!--<![endif]-->
  <style>
    body,table,td,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    * { box-sizing:border-box; }

    @media only screen and (max-width:600px) {
      .wrapper  { padding:28px 10px !important; }
      .card     { border-radius:0 !important; }
      .hpad     { padding:30px 26px 24px !important; }
      .bpad     { padding:38px 26px 30px !important; }
      .fpad     { padding:20px 26px !important; }
      .btn-wrap { padding:0 !important; }
      .btn-a    { padding:15px 30px !important; font-size:15px !important; width:100% !important; }
      h1        { font-size:24px !important; }
      .logo-img { width:48px !important; height:48px !important; }
      .otp-code { font-size:28px !important; letter-spacing:7px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.paper};font-family:${FONT_SANS};">

  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->

  <!-- Preview text (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${BRAND.paper};">
    ${greeting} — your Ụgwọ sign-in link is ready. Tap to open the app.&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;&ensp;&#847;
  </div>

  <!-- Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td class="wrapper" align="center" style="padding:56px 16px;">

        <!-- Card -->
        <table role="presentation" class="card" width="540" cellpadding="0" cellspacing="0" border="0"
               style="background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 16px 48px rgba(30,42,74,0.14);">

          <!-- ── Header ── -->
          <tr>
            <td class="hpad" style="background:${BRAND.indigo};padding:36px 44px 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="56" style="vertical-align:middle;">
                    <img class="logo-img" src="${BRAND.logoUrl}" width="56" height="56" alt="Ụgwọ"
                         style="display:block;width:56px;height:56px;border-radius:16px;"/>
                  </td>
                  <td style="vertical-align:middle;padding-left:16px;">
                    <span style="font-family:${FONT_SERIF};font-size:28px;font-weight:300;color:${BRAND.paper};letter-spacing:-0.6px;line-height:1.1;">Ụgwọ</span>
                    <br/>
                    <span style="font-size:10px;color:${BRAND.amber};letter-spacing:2.5px;text-transform:uppercase;font-weight:600;">Owed · Remembered · Settled</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Amber accent hairline -->
          <tr>
            <td height="2" style="background:linear-gradient(90deg,${BRAND.indigo} 0%,${BRAND.amber} 50%,${BRAND.indigo} 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td class="bpad" style="padding:48px 44px 38px;">

              <p style="margin:0 0 6px;font-size:13px;color:${BRAND.slateLight};letter-spacing:0.2px;">${greeting},</p>

              <h1 style="margin:0 0 18px;font-family:${FONT_SERIF};font-size:29px;font-weight:300;color:${BRAND.ink};letter-spacing:-0.6px;line-height:1.25;">
                Your sign-in link<br/>is ready.
              </h1>

              <p style="margin:0 0 36px;font-size:15px;color:${BRAND.slate};line-height:1.75;">
                Tap the button below to open Ụgwọ and sign in instantly.
                This link is valid for&nbsp;<strong style="color:${BRAND.indigo};font-weight:600;">${expiryMins} minutes</strong>
                and can only be used once.
              </p>

              <!-- ── CTA Button ── -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:36px;">
                <tr>
                  <td class="btn-wrap" align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                      href="${url}"
                      style="height:54px;v-text-anchor:middle;width:240px;"
                      arcsize="50%"
                      strokecolor="${BRAND.indigo}"
                      fillcolor="${BRAND.indigo}">
                      <w:anchorlock/>
                      <center style="color:${BRAND.paper};font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;letter-spacing:0.3px;">
                        Sign in to Ụgwọ →
                      </center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="border-radius:100px;background:${BRAND.indigo};box-shadow:0 6px 20px rgba(30,42,74,0.28);">
                          <a class="btn-a" href="${url}"
                             style="display:inline-block;padding:17px 52px;font-size:16px;font-weight:600;color:${BRAND.paper};text-decoration:none;letter-spacing:0.3px;border-radius:100px;line-height:1;">
                            Sign in to Ụgwọ &nbsp;→
                          </a>
                        </td>
                      </tr>
                    </table>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid ${BRAND.hairline};font-size:0;">&nbsp;</td></tr>
              </table>

              <!-- Fallback link -->
              <p style="margin:22px 0 4px;font-size:12px;color:${BRAND.slateLight};">
                Button not working? Copy this link into your browser:
              </p>
              <p style="margin:0;font-size:11px;color:#B0B2B8;word-break:break-all;line-height:1.6;">${url}</p>

              ${otpCode ? `
              <!-- OTP code block -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr><td style="border-top:1px solid ${BRAND.hairline};font-size:0;">&nbsp;</td></tr>
              </table>
              <p style="margin:22px 0 4px;font-size:13px;color:${BRAND.slate};line-height:1.65;">
                Got the email on a different device? Enter this code on the device where you started sign-in:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;">
                <tr>
                  <td style="background:${BRAND.paper};border:1px solid ${BRAND.amberLight};border-radius:14px;padding:20px 28px;text-align:center;">
                    <p style="margin:0 0 6px;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:${BRAND.amber};font-weight:700;">One-time code</p>
                    <p class="otp-code" style="margin:0;font-size:34px;font-weight:600;letter-spacing:9px;color:${BRAND.indigo};font-family:${FONT_SERIF};">${otpCode}</p>
                    <p style="margin:8px 0 0;font-size:11px;color:${BRAND.slateLight};">Expires in ${expiryMins} minutes · one-time use</p>
                  </td>
                </tr>
              </table>
              ` : ''}

            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td class="fpad" style="background:${BRAND.paper};padding:24px 44px;border-top:1px solid ${BRAND.hairline};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="22" style="vertical-align:top;padding-top:1px;">
                    <span style="font-size:15px;">🔒</span>
                  </td>
                  <td style="padding-left:10px;">
                    <p style="margin:0;font-size:12px;color:${BRAND.slate};line-height:1.65;">
                      If you didn't request this, you can safely ignore this email — your account is secure.
                      This link will expire automatically and cannot be reused.
                      We can't see your debts. Nobody can.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Card -->

        <!-- Below-card tagline -->
        <p style="margin:24px 0 0;font-family:${FONT_SANS};font-size:11px;color:${BRAND.slateLight};text-align:center;letter-spacing:0.3px;">
          Ụgwọ — Owed. Remembered. Settled. &nbsp;·&nbsp; A venture by NIPPYSKY
        </p>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

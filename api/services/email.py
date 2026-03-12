"""Email service using Resend for TanyaHukum transactional emails."""
import logging
import resend
from api.config import settings

logger = logging.getLogger(__name__)

resend.api_key = settings.resend_api_key


def _base_layout(content_html: str) -> str:
    """Wrap content in the branded TanyaHukum email layout."""
    return f"""\
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#F5F0EB;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F0EB;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(26,35,50,0.08);">

<!-- Header -->
<tr>
<td style="background:linear-gradient(135deg,#1A2332 0%,#2A3A4F 100%);padding:28px 32px;text-align:center;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <span style="font-size:24px;font-weight:800;color:#FF6B35;letter-spacing:-0.5px;">Tanya</span><span style="font-size:24px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">Hukum</span>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding-top:6px;">
      <span style="font-size:11px;color:#8B9BB4;letter-spacing:1.5px;text-transform:uppercase;">Analisis Kontrak Berbasis AI</span>
    </td>
  </tr>
  </table>
</td>
</tr>

<!-- Content -->
<tr>
<td style="padding:32px;">
{content_html}
</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#F8F5F1;padding:24px 32px;border-top:1px solid #EDE8E3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <p style="margin:0 0 8px;font-size:12px;color:#6B7280;">
        Email ini dikirim oleh <strong style="color:#1A2332;">TanyaHukum</strong>
      </p>
      <p style="margin:0 0 12px;font-size:11px;color:#9CA3AF;">
        Analisis kontrak cerdas untuk masyarakat Indonesia
      </p>
      <p style="margin:0;padding:12px 16px;background-color:#FFF5F0;border-radius:8px;border-left:3px solid #FF6B35;font-size:11px;color:#92400E;line-height:1.5;">
        ⚠️ <strong>Disclaimer:</strong> Ini adalah layanan demo dalam tahap pengembangan. 
        Hasil analisis bukan nasihat hukum. Selalu konsultasikan dengan pengacara profesional 
        untuk keputusan hukum.
      </p>
    </td>
  </tr>
  </table>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>"""


def send_user_confirmation(
    to_email: str,
    user_name: str,
    analysis_filename: str | None = None,
    overall_score: float | None = None,
) -> bool:
    """Send consultation booking confirmation to user."""

    score_badge = ""
    if overall_score is not None:
        if overall_score >= 7:
            badge_color, badge_bg, badge_label = "#DC2626", "#FEE2E2", "Risiko Tinggi"
        elif overall_score >= 4:
            badge_color, badge_bg, badge_label = "#D97706", "#FEF3C7", "Perlu Perhatian"
        else:
            badge_color, badge_bg, badge_label = "#059669", "#D1FAE5", "Risiko Rendah"
        score_badge = f"""\
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
<tr><td>
  <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#F8F5F1;border-radius:12px;padding:16px 20px;width:100%;">
  <tr>
    <td style="padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:1px;">Dokumen yang dianalisis</p>
      <p style="margin:0 0 12px;font-size:14px;color:#1A2332;font-weight:600;">{analysis_filename or 'Kontrak'}</p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="background-color:{badge_bg};color:{badge_color};font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;">
          Skor {overall_score}/10 — {badge_label}
        </td>
      </tr></table>
    </td>
  </tr>
  </table>
</td></tr>
</table>"""

    content = f"""\
<h1 style="margin:0 0 8px;font-size:22px;color:#1A2332;font-weight:700;">
  Halo, {user_name}! 👋
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#4B5563;line-height:1.6;">
  Permintaan konsultasi hukum Anda telah kami terima.
</p>

{score_badge}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
<tr><td style="background-color:#FFF5F0;border-radius:12px;padding:20px 24px;">
  <h2 style="margin:0 0 16px;font-size:16px;color:#FF6B35;font-weight:700;">
    Apa yang akan terjadi selanjutnya?
  </h2>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding-bottom:12px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#FF6B35;color:#FFFFFF;font-size:12px;font-weight:700;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;vertical-align:top;">1</td>
          <td style="padding-left:12px;font-size:14px;color:#1A2332;line-height:1.5;">
            <strong>Tim kami menerima data Anda</strong><br>
            <span style="color:#6B7280;font-size:13px;">Data kontak Anda telah tercatat di sistem kami</span>
          </td>
        </tr></table>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:12px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#FF6B35;color:#FFFFFF;font-size:12px;font-weight:700;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;vertical-align:top;">2</td>
          <td style="padding-left:12px;font-size:14px;color:#1A2332;line-height:1.5;">
            <strong>Kami menghubungi Anda via WhatsApp</strong><br>
            <span style="color:#6B7280;font-size:13px;">Staf kami akan menghubungi dalam 1x24 jam untuk konfirmasi jadwal</span>
          </td>
        </tr></table>
      </td>
    </tr>
    <tr>
      <td>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="background-color:#FF6B35;color:#FFFFFF;font-size:12px;font-weight:700;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;vertical-align:top;">3</td>
          <td style="padding-left:12px;font-size:14px;color:#1A2332;line-height:1.5;">
            <strong>Konsultasi awal gratis</strong><br>
            <span style="color:#6B7280;font-size:13px;">Sesi konsultasi pertama tanpa biaya dan tanpa kewajiban</span>
          </td>
        </tr></table>
      </td>
    </tr>
  </table>
</td></tr>
</table>

<p style="margin:0;font-size:14px;color:#4B5563;line-height:1.6;">
  Jika ada pertanyaan sebelum kami menghubungi, silakan balas email ini.
</p>
<p style="margin:16px 0 0;font-size:14px;color:#1A2332;">
  Salam hangat,<br>
  <strong style="color:#FF6B35;">Tim TanyaHukum</strong>
</p>"""

    html = _base_layout(content)

    try:
        params: resend.Emails.SendParams = {
            "from": settings.resend_from_email,
            "to": [to_email],
            "subject": "Permintaan Konsultasi Anda Telah Diterima — TanyaHukum",
            "html": html,
        }
        result = resend.Emails.send(params)
        logger.info(f"User confirmation email sent to {to_email}: {result}")
        return True
    except Exception as e:
        logger.error(f"Failed to send user confirmation email to {to_email}: {e}", exc_info=True)
        return False


def send_admin_notification(
    user_name: str,
    user_email: str,
    user_wa: str,
    analysis_id: str | None = None,
    analysis_filename: str | None = None,
    overall_score: float | None = None,
    high_risk_count: int = 0,
    total_clauses: int = 0,
) -> bool:
    """Send new consultation lead notification to admin."""

    score_color = "#DC2626" if (overall_score or 0) >= 7 else "#D97706" if (overall_score or 0) >= 4 else "#059669"
    analysis_link = f"https://tanyahukum.dev/cek-dokumen/{analysis_id}/" if analysis_id else "#"

    content = f"""\
<div style="margin-bottom:20px;padding:16px 20px;background-color:#FEF3C7;border-radius:12px;border-left:4px solid #F59E0B;">
  <p style="margin:0;font-size:14px;color:#92400E;font-weight:600;">
    🔔 Permintaan Konsultasi Baru
  </p>
</div>

<h1 style="margin:0 0 24px;font-size:20px;color:#1A2332;font-weight:700;">
  Lead baru dari TanyaHukum
</h1>

<!-- Contact Info -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;background-color:#F8F5F1;border-radius:12px;overflow:hidden;">
<tr><td style="padding:20px 24px;">
  <p style="margin:0 0 4px;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:1px;">Data Kontak</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6B7280;width:90px;">Nama</td>
      <td style="padding:6px 0;font-size:14px;color:#1A2332;font-weight:600;">{user_name}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6B7280;">Email</td>
      <td style="padding:6px 0;font-size:14px;color:#1A2332;">
        <a href="mailto:{user_email}" style="color:#FF6B35;text-decoration:none;">{user_email}</a>
      </td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6B7280;">WhatsApp</td>
      <td style="padding:6px 0;font-size:14px;color:#1A2332;">
        <a href="https://wa.me/{user_wa.replace('+','').replace('-','').replace(' ','')}" style="color:#FF6B35;text-decoration:none;">{user_wa}</a>
      </td>
    </tr>
  </table>
</td></tr>
</table>

<!-- Analysis Summary -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;background-color:#F8F5F1;border-radius:12px;overflow:hidden;">
<tr><td style="padding:20px 24px;">
  <p style="margin:0 0 4px;font-size:11px;color:#6B7280;text-transform:uppercase;letter-spacing:1px;">Kontrak yang Dianalisis</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6B7280;width:90px;">File</td>
      <td style="padding:6px 0;font-size:14px;color:#1A2332;font-weight:600;">{analysis_filename or '-'}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6B7280;">Skor</td>
      <td style="padding:6px 0;">
        <span style="font-size:14px;font-weight:700;color:{score_color};">{overall_score or '-'}/10</span>
      </td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#6B7280;">Klausa</td>
      <td style="padding:6px 0;font-size:14px;color:#1A2332;">{total_clauses} total, <strong style="color:#DC2626;">{high_risk_count} risiko tinggi</strong></td>
    </tr>
  </table>
</td></tr>
</table>

<!-- CTA -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
<tr><td align="center">
  <a href="{analysis_link}" style="display:inline-block;background-color:#FF6B35;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;">
    Lihat Hasil Analisis
  </a>
</td></tr>
</table>

<p style="margin:0;font-size:13px;color:#6B7280;text-align:center;">
  Segera hubungi user via WhatsApp untuk konfirmasi jadwal konsultasi.
</p>"""

    html = _base_layout(content)

    try:
        params: resend.Emails.SendParams = {
            "from": settings.resend_from_email,
            "to": [settings.admin_email],
            "subject": f"🔔 Konsultasi Baru — {user_name} (Skor {overall_score or '?'}/10)",
            "html": html,
            "reply_to": user_email,
        }
        result = resend.Emails.send(params)
        logger.info(f"Admin notification email sent: {result}")
        return True
    except Exception as e:
        logger.error(f"Failed to send admin notification email: {e}", exc_info=True)
        return False

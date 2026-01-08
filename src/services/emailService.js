import nodemailer from 'nodemailer'

/**
 * Email Service
 * Handles sending emails for reports and notifications
 */

// Create transporter - configured via environment variables
const createTransporter = () => {
  // Check if email is configured
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('Email service not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env')
    return null
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

/**
 * Send report notification email to admin
 */
export async function sendReportEmail(report) {
  const transporter = createTransporter()

  if (!transporter) {
    console.log('Email not sent - SMTP not configured. Report details:', report)
    return { sent: false, reason: 'SMTP not configured' }
  }

  const reportEmail = process.env.REPORT_EMAIL || 'info@stepmode.app'

  // Build content link based on report type
  let contentInfo = ''
  if (report.post_id) {
    contentInfo = `Post ID: ${report.post_id}`
  } else if (report.comment_id) {
    contentInfo = `Comment ID: ${report.comment_id}`
  } else if (report.reported_user_id) {
    contentInfo = `User ID: ${report.reported_user_id}`
  }

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #ff4444; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .field { margin-bottom: 15px; }
        .label { font-weight: bold; color: #666; }
        .value { margin-top: 5px; }
        .urgent { background: #fff3cd; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #ffc107; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Content Report</h1>
          <p>Action Required</p>
        </div>
        <div class="content">
          <div class="field">
            <div class="label">Report ID</div>
            <div class="value">${report.id}</div>
          </div>
          <div class="field">
            <div class="label">Report Type</div>
            <div class="value" style="text-transform: capitalize;">${report.report_type.replace('_', ' ')}</div>
          </div>
          <div class="field">
            <div class="label">Reporter</div>
            <div class="value">@${report.reporter_username} (${report.reporter_email})</div>
          </div>
          <div class="field">
            <div class="label">Reported Content</div>
            <div class="value">${contentInfo}</div>
          </div>
          ${report.reported_username ? `
          <div class="field">
            <div class="label">Reported User</div>
            <div class="value">@${report.reported_username}</div>
          </div>
          ` : ''}
          ${report.description ? `
          <div class="field">
            <div class="label">Description</div>
            <div class="value">${report.description}</div>
          </div>
          ` : ''}
          <div class="field">
            <div class="label">Submitted At</div>
            <div class="value">${new Date(report.created_at).toLocaleString()}</div>
          </div>
          <div class="urgent">
            <strong>Action required within 24 hours</strong> per App Store guidelines.
          </div>
        </div>
        <div class="footer">
          <p>This is an automated notification from StepMode. Do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    await transporter.sendMail({
      from: `"StepMode Reports" <${process.env.SMTP_USER}>`,
      to: reportEmail,
      subject: `[URGENT] Content Report: ${report.report_type.replace('_', ' ')}`,
      html: emailHtml,
    })

    console.log(`Report email sent to ${reportEmail} for report ${report.id}`)
    return { sent: true }
  } catch (error) {
    console.error('Failed to send report email:', error)
    return { sent: false, error: error.message }
  }
}

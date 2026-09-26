import { ReplitConnectors } from '@replit/connectors-sdk';

function getSender(): string {
  const sender = process.env.MAIL_FROM;
  if (!sender || !/^[^<>\r\n]+ <[^<>\s@]+@[^<>\s@]+>$/.test(sender)) {
    throw new Error("Email sender is not configured. Set MAIL_FROM to a name and address on a verified sending domain.");
  }
  return sender;
}

async function deliverEmail(message: Record<string, unknown>): Promise<void> {
  const response = await new ReplitConnectors().proxy('resend', '/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...message, from: getSender() }),
  });
  if (!response.ok) {
    // Do not log or return provider response bodies; they may contain message content.
    throw new Error(`Email provider rejected the message (HTTP ${response.status}).`);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

interface SendNotificationEmailParams {
  to: string;
  subject: string;
  body: string;
  senderName?: string;
  agencyName?: string;
}

interface SendInviteEmailParams {
  to: string;
  inviteToken: string;
  agencyName: string;
  clientName: string;
  baseUrl: string;
}

export async function sendInviteEmail({
  to,
  inviteToken,
  agencyName,
  clientName,
  baseUrl,
}: SendInviteEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const inviteUrl = `${baseUrl}/api/login?invite_token=${encodeURIComponent(inviteToken)}`;
    
    await deliverEmail({
      to: [to],
      subject: `You've been invited to EventHQ`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); padding: 24px; border-radius: 8px 8px 0 0;">
             <h1 style="color: white; margin: 0; font-size: 24px;">${escapeHtml(agencyName)}</h1>
          </div>
          <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <h2 style="color: #1f2937; margin-top: 0;">Welcome to EventHQ!</h2>
            <p style="color: #4b5563; line-height: 1.6;">
               You've been invited to join <strong>${escapeHtml(agencyName)}</strong> as a client for <strong>${escapeHtml(clientName)}</strong>.
            </p>
            <p style="color: #4b5563; line-height: 1.6;">
              Click the button below to create your account and get started:
            </p>
            <div style="text-align: center; margin: 32px 0;">
               <a href="${escapeHtml(inviteUrl)}" style="background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #9ca3af; font-size: 12px;">
               Or copy this link: ${escapeHtml(inviteUrl)}
            </p>
          </div>
          <div style="text-align: center; padding: 16px; color: #9ca3af; font-size: 12px;">
            Sent via EventHQ
          </div>
        </div>
      `,
      text: `You've been invited to EventHQ by ${agencyName}!\n\nClick this link to accept: ${inviteUrl}`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Invite email send error:', err.message);
    return { success: false, error: err.message || 'Failed to send invite email' };
  }
}

export async function sendNotificationEmail({
  to,
  subject,
  body,
  senderName,
  agencyName,
}: SendNotificationEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const fromName = agencyName || 'EventHQ';
    
    await deliverEmail({
      to: [to],
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); padding: 24px; border-radius: 8px 8px 0 0;">
             <h1 style="color: white; margin: 0; font-size: 24px;">${escapeHtml(fromName)}</h1>
          </div>
          <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
             <h2 style="color: #1f2937; margin-top: 0;">${escapeHtml(subject)}</h2>
             <div style="color: #4b5563; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(body)}</div>
             ${senderName ? `<p style="color: #6b7280; margin-top: 24px; font-size: 14px;">— ${escapeHtml(senderName)}</p>` : ''}
          </div>
          <div style="text-align: center; padding: 16px; color: #9ca3af; font-size: 12px;">
            Sent via EventHQ
          </div>
        </div>
      `,
      text: `${subject}\n\n${body}${senderName ? `\n\n— ${senderName}` : ''}`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Email send error:', err.message);
    return { success: false, error: err.message || 'Failed to send email' };
  }
}

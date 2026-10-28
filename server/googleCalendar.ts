// Google Calendar access. On Vercel EventHQ signs in as a Google service account
// (GOOGLE_SERVICE_ACCOUNT_KEY: the account's JSON key, raw or base64). Each client's calendar
// must be shared with the service account's email. The Replit connector is the fallback.
import { google } from 'googleapis';

type ServiceAccount = { client_email: string; private_key: string };
let parsedKey: ServiceAccount | null | undefined;

function serviceAccount(): ServiceAccount | null {
  if (parsedKey !== undefined) return parsedKey;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  parsedKey = null;
  if (raw) {
    try {
      const json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
      if (json.client_email && json.private_key) parsedKey = { client_email: json.client_email, private_key: json.private_key };
      else console.error("GOOGLE_SERVICE_ACCOUNT_KEY is missing client_email or private_key");
    } catch {
      console.error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON");
    }
  }
  return parsedKey;
}

// The email each client calendar has to be shared with, when a service account is set up.
export const googleServiceAccountEmail = () => serviceAccount()?.client_email ?? null;
export const isGoogleCalendarConfigured = () => !!serviceAccount() || !!process.env.REPLIT_CONNECTORS_HOSTNAME;
// With domain-wide delegation the service account acts as this Workspace user, which lets it send invites.
const delegatedUser = () => process.env.GOOGLE_CALENDAR_DELEGATED_USER?.trim() || undefined;

let connectionSettings: any;

async function getReplitAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error('Google Calendar is not set up on the server');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-calendar',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Calendar not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
export async function getGoogleCalendarClient() {
  const sa = serviceAccount();
  if (sa) {
    const auth = new google.auth.JWT({
      email: sa.client_email, key: sa.private_key, subject: delegatedUser(),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    return google.calendar({ version: 'v3', auth });
  }
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: await getReplitAccessToken() });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

// Turns Google API errors into something an admin can act on.
export function describeGoogleCalendarError(error: any): string {
  const status = error?.code ?? error?.response?.status;
  const email = googleServiceAccountEmail();
  if (status === 404 || status === 403) {
    return email
      ? `EventHQ can't open this calendar. In Google Calendar, share it with ${email} ("Make changes to events").`
      : "EventHQ can't open this calendar. Check the Calendar ID and its sharing settings.";
  }
  return error?.message || "Google Calendar request failed";
}

const isAttendeeRestriction = (error: any) => /Domain-Wide Delegation|cannot invite attendees/i.test(error?.message || "");

export interface CalendarEventData {
  title: string;
  description?: string | null;
  eventDate: Date;
  endDate?: Date | null;
  timezone: string;
  attendeeEmails: string[];
  eventLink?: string | null;
}

const eventBody = (data: CalendarEventData, withAttendees: boolean) => {
  // Use provided endDate or default to 1 hour after start
  const endDate = data.endDate ? new Date(data.endDate) : new Date(data.eventDate.getTime() + 60 * 60 * 1000);
  return {
    summary: data.title,
    description: data.description || undefined,
    start: { dateTime: data.eventDate.toISOString(), timeZone: data.timezone },
    end: { dateTime: endDate.toISOString(), timeZone: data.timezone },
    attendees: withAttendees ? data.attendeeEmails.map(email => ({ email })) : [],
    reminders: { useDefault: true },
  };
};

// Google refuses attendee invites from a service account without domain-wide delegation.
// In that case the event is saved without attendees and invitesSkipped is set.
async function withAttendeeFallback<T>(data: CalendarEventData, run: (withAttendees: boolean) => Promise<T>): Promise<{ result: T; invitesSkipped: boolean }> {
  try {
    return { result: await run(data.attendeeEmails.length > 0), invitesSkipped: false };
  } catch (error) {
    if (!data.attendeeEmails.length || !isAttendeeRestriction(error)) throw error;
    return { result: await run(false), invitesSkipped: true };
  }
}

export type GoogleWriteResult = { ok: boolean; eventId?: string | null; invitesSkipped?: boolean; error?: string };

export async function createGoogleCalendarEvent(data: CalendarEventData, calendarId: string): Promise<GoogleWriteResult> {
  try {
    const calendar = await getGoogleCalendarClient();
    const { result, invitesSkipped } = await withAttendeeFallback(data, withAttendees => calendar.events.insert({
      calendarId, requestBody: eventBody(data, withAttendees), sendUpdates: withAttendees ? 'all' : 'none',
    }));
    return { ok: !!result.data.id, eventId: result.data.id || null, invitesSkipped };
  } catch (error) {
    console.error('Failed to create Google Calendar event:', error);
    return { ok: false, error: describeGoogleCalendarError(error) };
  }
}

export async function updateGoogleCalendarEvent(eventId: string, data: CalendarEventData, calendarId: string): Promise<GoogleWriteResult> {
  try {
    const calendar = await getGoogleCalendarClient();
    const { invitesSkipped } = await withAttendeeFallback(data, withAttendees => calendar.events.update({
      calendarId, eventId, requestBody: eventBody(data, withAttendees), sendUpdates: withAttendees ? 'all' : 'none',
    }));
    return { ok: true, eventId, invitesSkipped };
  } catch (error) {
    console.error('Failed to update Google Calendar event:', error);
    return { ok: false, error: describeGoogleCalendarError(error) };
  }
}

export async function deleteGoogleCalendarEvent(eventId: string, calendarId: string): Promise<boolean> {
  try {
    const calendar = await getGoogleCalendarClient();
    await calendar.events.delete({ calendarId, eventId, sendUpdates: 'all' });
    return true;
  } catch (error: any) {
    // Already gone from Google: nothing left to delete.
    if ((error?.code ?? error?.response?.status) === 404 || (error?.code ?? error?.response?.status) === 410) return true;
    console.error('Failed to delete Google Calendar event:', error);
    return false;
  }
}

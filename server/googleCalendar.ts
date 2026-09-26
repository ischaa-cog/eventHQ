// Google Calendar Integration via Replit Connector
import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
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
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export interface CalendarEventData {
  title: string;
  description?: string | null;
  eventDate: Date;
  endDate?: Date | null;
  timezone: string;
  attendeeEmails: string[];
  eventLink?: string | null;
}

export async function createGoogleCalendarEvent(data: CalendarEventData, calendarId: string): Promise<string | null> {
  try {
    const calendar = await getGoogleCalendarClient();
    
    // Use provided endDate or default to 1 hour after start
    const endDate = data.endDate ? new Date(data.endDate) : new Date(data.eventDate.getTime() + 60 * 60 * 1000);
    
    const event = {
      summary: data.title,
      description: data.description || undefined,
      start: {
        dateTime: data.eventDate.toISOString(),
        timeZone: data.timezone,
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: data.timezone,
      },
      attendees: data.attendeeEmails.map(email => ({ email })),
      reminders: {
        useDefault: true,
      },
      conferenceData: data.eventLink ? undefined : undefined,
    };

    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
      sendUpdates: 'all', // Send email notifications to attendees
    });

    console.log('Created Google Calendar event:', response.data.id);
    return response.data.id || null;
  } catch (error) {
    console.error('Failed to create Google Calendar event:', error);
    return null;
  }
}

export async function updateGoogleCalendarEvent(eventId: string, data: CalendarEventData, calendarId: string): Promise<boolean> {
  try {
    const calendar = await getGoogleCalendarClient();
    
    // Use provided endDate or default to 1 hour after start
    const endDate = data.endDate ? new Date(data.endDate) : new Date(data.eventDate.getTime() + 60 * 60 * 1000);
    
    const event = {
      summary: data.title,
      description: data.description || undefined,
      start: {
        dateTime: data.eventDate.toISOString(),
        timeZone: data.timezone,
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: data.timezone,
      },
      attendees: data.attendeeEmails.map(email => ({ email })),
    };

    await calendar.events.update({
      calendarId,
      eventId: eventId,
      requestBody: event,
      sendUpdates: 'all', // Notify attendees of changes
    });

    console.log('Updated Google Calendar event:', eventId);
    return true;
  } catch (error) {
    console.error('Failed to update Google Calendar event:', error);
    return false;
  }
}

export async function deleteGoogleCalendarEvent(eventId: string, calendarId: string): Promise<boolean> {
  try {
    const calendar = await getGoogleCalendarClient();
    
    await calendar.events.delete({
      calendarId,
      eventId: eventId,
      sendUpdates: 'all', // Notify attendees of cancellation
    });

    console.log('Deleted Google Calendar event:', eventId);
    return true;
  } catch (error) {
    console.error('Failed to delete Google Calendar event:', error);
    return false;
  }
}

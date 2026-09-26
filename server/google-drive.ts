import { google } from "googleapis";
import { storage } from "./storage";
import { Readable } from "stream";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }
  
  const redirectUri = `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000"}/api/google-drive/callback`;
  
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthorizationUrl(state: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    state,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  email: string;
}> {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Failed to get tokens from Google");
  }
  
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    email: userInfo.data.email || "unknown",
  };
}

export async function getAuthenticatedClient(clientId: number) {
  const client = await storage.getClient(clientId);
  if (!client?.googleDriveAccessToken || !client?.googleDriveRefreshToken) {
    throw new Error("Client not connected to Google Drive");
  }
  
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: client.googleDriveAccessToken,
    refresh_token: client.googleDriveRefreshToken,
  });
  
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await storage.updateClientGoogleDrive(clientId, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || client.googleDriveRefreshToken,
        folderId: client.googleDriveFolderId,
        email: client.googleDriveEmail,
      });
    }
  });
  
  return oauth2Client;
}

export async function createFolder(clientId: number, folderName: string): Promise<string> {
  const auth = await getAuthenticatedClient(clientId);
  const drive = google.drive({ version: "v3", auth });
  
  const response = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  
  return response.data.id || "";
}

export async function uploadFile(
  clientId: number,
  fileName: string,
  content: string,
  mimeType: string = "text/plain",
  parentFolderId?: string
): Promise<{ fileId: string; webViewLink: string }> {
  const auth = await getAuthenticatedClient(clientId);
  const drive = google.drive({ version: "v3", auth });
  
  const client = await storage.getClient(clientId);
  const folderId = parentFolderId || client?.googleDriveFolderId;
  
  const fileMetadata: any = {
    name: fileName,
  };
  
  if (folderId) {
    fileMetadata.parents = [folderId];
  }
  
  const contentStream = Readable.from(Buffer.from(content, "utf-8"));
  
  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: {
      mimeType,
      body: contentStream,
    },
    fields: "id, webViewLink",
  });
  
  return {
    fileId: response.data.id || "",
    webViewLink: response.data.webViewLink || "",
  };
}

export async function ensureClientFolder(clientId: number, clientName: string): Promise<string> {
  const client = await storage.getClient(clientId);
  
  if (client?.googleDriveFolderId) {
    return client.googleDriveFolderId;
  }
  
  const folderId = await createFolder(clientId, `EventHQ - ${clientName}`);
  
  await storage.updateClientGoogleDrive(clientId, {
    accessToken: client?.googleDriveAccessToken,
    refreshToken: client?.googleDriveRefreshToken,
    folderId,
    email: client?.googleDriveEmail,
  });
  
  return folderId;
}

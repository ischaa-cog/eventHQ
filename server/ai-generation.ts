import OpenAI from "openai";
import { storage } from "./storage";
import type { Event, Client, InsertAsset, AssetTemplate } from "@shared/schema";
import { uploadFile, ensureClientFolder } from "./google-drive";

function getOpenAIClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("AI generation is not configured. Add OPENAI_API_KEY to enable it.");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

interface TierData {
  [tierId: string]: { price: string; description: string };
}

const ASSET_PROMPTS: Record<string, { title: string; systemPrompt: string }> = {
  email_promo: {
    title: "Email Promo Sequence",
    systemPrompt: `You are an expert email copywriter for online events. Create a 5-email promotional sequence that builds anticipation and drives registrations. Each email should have a clear subject line, preview text, and body copy. Use the event details, audience pain points, and desired outcomes provided. Format in markdown with clear separation between emails.`,
  },
  social_promo: {
    title: "Social Media Posts",
    systemPrompt: `You are a social media marketing expert. Create 10-15 engaging social media posts to promote the event. Include a mix of formats: announcement posts, curiosity hooks, testimonial-style posts, countdown posts, and last-chance posts. Each post should be platform-agnostic but optimized for engagement. Format in markdown.`,
  },
  ad_copy: {
    title: "Facebook Ad Copy",
    systemPrompt: `You are a direct response advertising expert. Create 3-5 Facebook ad variations with different angles (pain-focused, outcome-focused, curiosity-focused). Each ad should include: headline, primary text, and call-to-action. Format in markdown.`,
  },
  reg_page: {
    title: "Registration Page Copy",
    systemPrompt: `You are a conversion copywriter. Create compelling registration page copy including: headline, subheadline, bullet points of what attendees will learn, speaker/host bio section placeholder, and call-to-action sections. Format in markdown.`,
  },
  slides: {
    title: "Slide Deck Outline",
    systemPrompt: `You are a presentation expert. Create a detailed slide deck outline with 15-25 slides. Include: opening hook, agenda, main teaching points, case studies/examples placeholders, and call-to-action sequence. Format in markdown with slide numbers and speaker notes.`,
  },
  scripts: {
    title: "Presenter Script",
    systemPrompt: `You are a presentation coach. Create a presenter script that flows naturally. Include: opening hook (first 2 minutes), transitions between sections, key talking points, and closing/CTA script. Format in markdown.`,
  },
  replay_emails: {
    title: "Replay Email Sequence",
    systemPrompt: `You are an email copywriter. Create a 3-5 email replay sequence for after the event. Include: immediate replay access email, value recap email, urgency/deadline email, and final reminder. Format in markdown.`,
  },
  day1_content: {
    title: "Day 1 Content & Homework",
    systemPrompt: `You are a course content creator. Create Day 1 content for a 5-day challenge including: teaching outline, key takeaways, action steps/homework, and community engagement prompts. Format in markdown.`,
  },
  day2_content: {
    title: "Day 2 Content & Homework",
    systemPrompt: `You are a course content creator. Create Day 2 content building on Day 1, including: teaching outline, key takeaways, action steps/homework, and community engagement prompts. Format in markdown.`,
  },
  day3_content: {
    title: "Day 3 Content & Homework",
    systemPrompt: `You are a course content creator. Create Day 3 content (midpoint of challenge) including: teaching outline, key takeaways, action steps/homework, and community engagement prompts. Format in markdown.`,
  },
  day4_content: {
    title: "Day 4 Content & Homework",
    systemPrompt: `You are a course content creator. Create Day 4 content leading toward the offer, including: teaching outline, key takeaways, action steps/homework, and community engagement prompts. Format in markdown.`,
  },
  day5_content: {
    title: "Day 5 Content & Homework",
    systemPrompt: `You are a course content creator. Create Day 5 content (finale) including: teaching outline, key takeaways, final action steps, transition to offer, and celebration prompts. Format in markdown.`,
  },
  daily_emails: {
    title: "Daily Reminder Emails",
    systemPrompt: `You are an email copywriter. Create 5 daily reminder/recap emails for a challenge. Each email should: remind about today's content, recap yesterday's wins, build excitement, and encourage participation. Format in markdown.`,
  },
  workbook: {
    title: "Challenge Workbook",
    systemPrompt: `You are a curriculum designer. Create a workbook outline with exercises and worksheets for a 5-day challenge. Include: daily reflection prompts, action planning templates, progress trackers, and bonus resources sections. Format in markdown.`,
  },
  speaker_outreach: {
    title: "Speaker Outreach Templates",
    systemPrompt: `You are a partnership outreach expert. Create 3-5 speaker outreach email templates with different angles. Include: initial outreach, follow-up, and acceptance/next steps templates. Format in markdown.`,
  },
  agreements: {
    title: "Speaker Agreements",
    systemPrompt: `You are a business operations expert. Create a speaker agreement template outline including: promotional requirements, content delivery terms, compensation terms (if applicable), and general terms. Note: This is a template outline, not legal advice. Format in markdown.`,
  },
  sponsor_kit: {
    title: "Sponsor Media Kit",
    systemPrompt: `You are a partnership marketing expert. Create a sponsor media kit outline including: event overview, audience demographics, sponsorship tiers and benefits, and contact information sections. Format in markdown.`,
  },
};

function buildEventContext(event: Event, client: Client): string {
  const tierData = event.tierData as TierData | null;
  
  let offerInfo = "";
  if (tierData) {
    offerInfo = Object.entries(tierData)
      .map(([id, data]) => `- ${id}: $${data.price} - ${data.description || "No description"}`)
      .join("\n");
  }

  return `
EVENT DETAILS:
- Event Name: ${event.name}
- Event Type: ${event.type}
- Start Date: ${event.startDate ? new Date(event.startDate).toLocaleDateString() : "TBD"}
- Main Hook/Promise: ${event.hook || "Not specified"}

OFFER LADDER:
${offerInfo || "No tier data"}

Backend Offer: ${event.backendOfferName || "Not specified"} - $${event.backendOfferPrice || "TBD"}
${event.backendOfferDescription ? `What's Included: ${event.backendOfferDescription}` : ""}

TARGET AUDIENCE:
- Who: ${event.targetAudience || "Not specified"}
- Top Pains: ${event.audiencePains || "Not specified"}
- Desired Outcomes: ${event.audienceOutcomes || "Not specified"}
- Banned Words/Phrases: ${event.bannedPhrases || "None"}

CLIENT/BRAND CONTEXT:
- Business: ${client.businessName || client.name}
- Niche: ${client.niche || "Not specified"}
- Brand Voice: ${client.brandVoiceTone?.join(", ") || "Professional"}
- Voice Dos: ${client.brandVoiceDos || "Not specified"}
- Voice Don'ts: ${client.brandVoiceDonts || "Not specified"}
- Banned Words: ${client.bannedWords || "None"}

TRACKING:
- UTM Source: ${event.utmSource || "Not specified"}
- UTM Medium: ${event.utmMedium || "Not specified"}
- UTM Campaign: ${event.utmCampaign || "Not specified"}
`;
}

async function generateAsset(
  assetType: string,
  event: Event,
  client: Client
): Promise<string> {
  const promptConfig = ASSET_PROMPTS[assetType];
  if (!promptConfig) {
    throw new Error(`Unknown asset type: ${assetType}`);
  }

  const eventContext = buildEventContext(event, client);

  const response = await getOpenAIClient().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: promptConfig.systemPrompt },
      {
        role: "user",
        content: `Please create the ${promptConfig.title} for this event:\n\n${eventContext}`,
      },
    ],
    max_tokens: 4000,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content || "Generation failed";
}

export async function runAssetGeneration(
  jobId: number,
  eventId: number,
  selectedAssetTypes: string[]
): Promise<void> {
  try {
    await storage.updateGenerationJob(jobId, { status: "in_progress", progress: 0 });

    const event = await storage.getEvent(eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    const client = await storage.getClient(event.clientId);
    if (!client) {
      throw new Error("Client not found");
    }

    await storage.updateEvent(eventId, { status: "generating" });

    const totalAssets = selectedAssetTypes.length;
    let completed = 0;
    const failedAssets: string[] = [];

    for (const assetType of selectedAssetTypes) {
      try {
        const promptConfig = ASSET_PROMPTS[assetType];
        if (!promptConfig) {
          console.log(`Skipping unknown asset type: ${assetType}`);
          failedAssets.push(`${assetType} (unknown type)`);
          continue;
        }

        const content = await generateAsset(assetType, event, client);

        const assetData: InsertAsset = {
          eventId,
          assetType,
          title: promptConfig.title,
          content,
          status: "draft",
          version: 1,
          ownerRole: "Copy",
        };

        const createdAsset = await storage.createAsset(assetData);
        
        if (client.googleDriveAccessToken) {
          try {
            await ensureClientFolder(client.id, client.name);
            const fileName = `${event.name} - ${promptConfig.title}.md`;
            const { webViewLink } = await uploadFile(client.id, fileName, content, "text/markdown");
            if (webViewLink) {
              await storage.updateAsset(createdAsset.id, { driveUrl: webViewLink });
            }
          } catch (driveError: any) {
            console.error(`Failed to upload ${assetType} to Drive:`, driveError.message);
          }
        }
        
        completed++;
      } catch (error: any) {
        console.error(`Error generating ${assetType}:`, error);
        failedAssets.push(`${assetType}: ${error.message || "Unknown error"}`);
      }
      
      const progress = Math.round(((completed + failedAssets.length) / totalAssets) * 100);
      await storage.updateGenerationJob(jobId, { progress });
    }

    if (failedAssets.length > 0 && completed === 0) {
      await storage.updateGenerationJob(jobId, {
        status: "failed",
        progress: 100,
        errorMessage: `All assets failed: ${failedAssets.join("; ")}`,
      });
      await storage.updateEvent(eventId, { status: "draft" });
    } else if (failedAssets.length > 0) {
      await storage.updateGenerationJob(jobId, {
        status: "completed",
        progress: 100,
        errorMessage: `Some assets failed: ${failedAssets.join("; ")}`,
      });
      await storage.updateEvent(eventId, { status: "completed" });
    } else {
      await storage.updateGenerationJob(jobId, {
        status: "completed",
        progress: 100,
      });
      await storage.updateEvent(eventId, { status: "completed" });
    }
  } catch (error: any) {
    console.error("Generation job failed:", error);
    await storage.updateGenerationJob(jobId, {
      status: "failed",
      errorMessage: error.message,
    });
    await storage.updateEvent(eventId, { status: "draft" });
  }
}

function buildBrandVoiceContext(client: Client): string {
  const parts: string[] = [];

  if (client.brandVoiceTone && client.brandVoiceTone.length > 0) {
    parts.push(`Tone: ${client.brandVoiceTone.join(", ")}`);
  }
  if (client.brandVoiceDos) {
    parts.push(`Do: ${client.brandVoiceDos}`);
  }
  if (client.brandVoiceDonts) {
    parts.push(`Don't: ${client.brandVoiceDonts}`);
  }
  if (client.bannedWords) {
    parts.push(`Never use these words: ${client.bannedWords}`);
  }
  if (client.styleGuide) {
    parts.push(`Style guide: ${client.styleGuide}`);
  }

  return parts.length > 0 ? parts.join("\n") : "Professional and engaging";
}

function buildTemplateSystemPrompt(template: AssetTemplate, client: Client, event: Event): string {
  let prompt = template.systemPrompt;

  const placeholders: Record<string, string> = {
    "{eventName}": event.name,
    "{eventType}": event.type,
    "{offerName}": event.backendOfferName || "",
    "{offerPrice}": event.backendOfferPrice?.toString() || "",
    "{targetAudience}": event.targetAudience || "",
    "{painPoints}": event.audiencePains || "",
    "{transformation}": event.audienceOutcomes || "",
    "{keyBenefits}": event.backendOfferDescription || "",
    "{clientName}": client.name,
    "{brandVoice}": buildBrandVoiceContext(client),
    "{itemCount}": (template.itemCount ?? 5).toString(),
    "{assetType}": template.assetType,
  };

  for (const [key, value] of Object.entries(placeholders)) {
    prompt = prompt.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
  }

  return prompt;
}

function getAssetTypeLabel(assetType: string): string {
  const labels: Record<string, string> = {
    email: "emails",
    sms: "SMS messages",
    social_linkedin: "LinkedIn posts",
    social_facebook: "Facebook posts",
    social_instagram: "Instagram posts",
    script: "video scripts",
    slides: "slide outlines",
    ad_copy: "ad copies",
  };
  return labels[assetType] || assetType;
}

async function generateFromTemplate(
  template: AssetTemplate,
  event: Event,
  client: Client
): Promise<string> {
  const systemPrompt = buildTemplateSystemPrompt(template, client, event);
  const eventContext = buildEventContext(event, client);

  const userPrompt = `Generate ${template.itemCount} ${getAssetTypeLabel(template.assetType)} based on this context:

${eventContext}

${template.includeInstructions ? `Additional Instructions: ${template.includeInstructions}` : ""}

Format each item with a clear subject/headline and body content. Number each item clearly.`;

  const response = await getOpenAIClient().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 4000,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content || "Generation failed";
}

export async function runTemplateBasedGeneration(
  jobId: number,
  eventId: number,
  templateIds: number[]
): Promise<void> {
  try {
    await storage.updateGenerationJob(jobId, { status: "in_progress", progress: 0 });

    const event = await storage.getEvent(eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    const client = await storage.getClient(event.clientId);
    if (!client) {
      throw new Error("Client not found");
    }

    await storage.updateEvent(eventId, { status: "generating" });

    const templates = await Promise.all(
      templateIds.map(id => storage.getAssetTemplate(id))
    );
    const validTemplates = templates.filter((t): t is AssetTemplate => t !== undefined);

    if (validTemplates.length === 0) {
      throw new Error("No valid templates found");
    }

    const totalTemplates = validTemplates.length;
    let completed = 0;
    const failedAssets: string[] = [];

    for (const template of validTemplates) {
      try {
        const content = await generateFromTemplate(template, event, client);

        const assetData: InsertAsset = {
          eventId,
          assetType: template.assetType,
          title: template.name,
          content,
          status: "generated",
          version: 1,
          ownerRole: "Copy",
        };

        const createdAsset = await storage.createAsset(assetData);

        if (client.googleDriveAccessToken) {
          try {
            await ensureClientFolder(client.id, client.name);
            const fileName = `${event.name} - ${template.name}.md`;
            const { webViewLink } = await uploadFile(client.id, fileName, content, "text/markdown");
            if (webViewLink) {
              await storage.updateAsset(createdAsset.id, { driveUrl: webViewLink });
            }
          } catch (driveError: any) {
            console.error(`Failed to upload ${template.name} to Drive:`, driveError.message);
          }
        }

        completed++;
      } catch (error: any) {
        console.error(`Error generating from template ${template.id}:`, error);
        failedAssets.push(`${template.name}: ${error.message || "Unknown error"}`);
      }

      const progress = Math.round(((completed + failedAssets.length) / totalTemplates) * 100);
      await storage.updateGenerationJob(jobId, { progress });
    }

    if (failedAssets.length > 0 && completed === 0) {
      await storage.updateGenerationJob(jobId, {
        status: "failed",
        progress: 100,
        errorMessage: `All templates failed: ${failedAssets.join("; ")}`,
      });
      await storage.updateEvent(eventId, { status: "draft" });
    } else if (failedAssets.length > 0) {
      await storage.updateGenerationJob(jobId, {
        status: "completed",
        progress: 100,
        errorMessage: `Some templates failed: ${failedAssets.join("; ")}`,
      });
      await storage.updateEvent(eventId, { status: "completed" });
    } else {
      await storage.updateGenerationJob(jobId, {
        status: "completed",
        progress: 100,
      });
      await storage.updateEvent(eventId, { status: "completed" });
    }
  } catch (error: any) {
    console.error("Template-based generation job failed:", error);
    await storage.updateGenerationJob(jobId, {
      status: "failed",
      errorMessage: error.message,
    });
    await storage.updateEvent(eventId, { status: "draft" });
  }
}

export async function getAvailableTemplatesForEvent(eventId: number): Promise<AssetTemplate[]> {
  const event = await storage.getEvent(eventId);
  if (!event) return [];

  const client = await storage.getClient(event.clientId);
  if (!client) return [];

  return await storage.getAssetTemplatesByType(client.agencyId, event.type);
}

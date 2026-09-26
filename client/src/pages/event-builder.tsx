import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ArrowRight, ArrowLeft, Wand2, CheckCircle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AssetTemplate } from "@shared/schema";

type EventType = "free_challenge" | "paid_challenge" | "summit" | "webinar";

interface TierConfig {
  id: string;
  label: string;
  priceEditable: boolean;
  defaultPrice: number;
  descriptionLabel: string;
  highlight?: boolean;
}

interface OfferBlueprint {
  displayName: string;
  tiers: TierConfig[];
}

const OFFER_BLUEPRINTS: Record<EventType, OfferBlueprint> = {
  free_challenge: {
    displayName: "Free Challenge",
    tiers: [
      { id: "free", label: "Free Ticket", priceEditable: false, defaultPrice: 0, descriptionLabel: "Included" },
      { id: "vip", label: "VIP Upgrade", priceEditable: true, defaultPrice: 47, descriptionLabel: "VIP Bonuses", highlight: true },
    ],
  },
  paid_challenge: {
    displayName: "Paid Challenge",
    tiers: [
      { id: "general", label: "General Admission", priceEditable: true, defaultPrice: 27, descriptionLabel: "Included" },
      { id: "vip", label: "VIP", priceEditable: true, defaultPrice: 97, descriptionLabel: "VIP Bonuses", highlight: true },
      { id: "platinum", label: "Platinum", priceEditable: true, defaultPrice: 297, descriptionLabel: "Platinum Bonuses" },
    ],
  },
  summit: {
    displayName: "Virtual Summit",
    tiers: [
      { id: "free", label: "Free Access", priceEditable: false, defaultPrice: 0, descriptionLabel: "Included" },
      { id: "vip", label: "VIP All-Access", priceEditable: true, defaultPrice: 47, descriptionLabel: "VIP Bonuses", highlight: true },
    ],
  },
  webinar: {
    displayName: "Masterclass",
    tiers: [
      { id: "free", label: "Free Registration", priceEditable: false, defaultPrice: 0, descriptionLabel: "Included" },
      { id: "offer", label: "Special Offer", priceEditable: true, defaultPrice: 97, descriptionLabel: "What's Included", highlight: true },
    ],
  },
};

const ASSET_CONFIG = {
  webinar: {
    preEvent: [
      { id: "email_promo", label: "Email Promo Sequence (5 emails)", defaultChecked: true },
      { id: "social_promo", label: "Social Media Posts (10 posts)", defaultChecked: true },
      { id: "ad_copy", label: "Facebook Ad Copy (3 variations)", defaultChecked: true },
      { id: "reg_page", label: "Registration Page Copy", defaultChecked: true },
    ],
    eventContent: [
      { id: "slides", label: "Slide Deck Outline", defaultChecked: true },
      { id: "scripts", label: "Presenter Script", defaultChecked: false },
      { id: "replay_emails", label: "Replay Email Sequence (3 emails)", defaultChecked: true },
    ],
  },
  free_challenge: {
    preEvent: [
      { id: "email_promo", label: "Email Promo Sequence (5 emails)", defaultChecked: true },
      { id: "social_promo", label: "Social Media Posts (15 posts)", defaultChecked: true },
      { id: "ad_copy", label: "Facebook Ad Copy (3 variations)", defaultChecked: true },
      { id: "reg_page", label: "Registration Page Copy", defaultChecked: true },
    ],
    eventContent: [
      { id: "day1_content", label: "Day 1 Content & Homework", defaultChecked: true },
      { id: "day2_content", label: "Day 2 Content & Homework", defaultChecked: true },
      { id: "day3_content", label: "Day 3 Content & Homework", defaultChecked: true },
      { id: "day4_content", label: "Day 4 Content & Homework", defaultChecked: true },
      { id: "day5_content", label: "Day 5 Content & Homework", defaultChecked: true },
      { id: "daily_emails", label: "Daily Reminder Emails (5 emails)", defaultChecked: true },
      { id: "workbook", label: "Challenge Workbook", defaultChecked: false },
    ],
  },
  paid_challenge: {
    preEvent: [
      { id: "email_promo", label: "Email Promo Sequence (5 emails)", defaultChecked: true },
      { id: "social_promo", label: "Social Media Posts (15 posts)", defaultChecked: true },
      { id: "ad_copy", label: "Facebook Ad Copy (3 variations)", defaultChecked: true },
      { id: "reg_page", label: "Registration Page Copy", defaultChecked: true },
    ],
    eventContent: [
      { id: "day1_content", label: "Day 1 Content & Homework", defaultChecked: true },
      { id: "day2_content", label: "Day 2 Content & Homework", defaultChecked: true },
      { id: "day3_content", label: "Day 3 Content & Homework", defaultChecked: true },
      { id: "day4_content", label: "Day 4 Content & Homework", defaultChecked: true },
      { id: "day5_content", label: "Day 5 Content & Homework", defaultChecked: true },
      { id: "daily_emails", label: "Daily Reminder Emails (5 emails)", defaultChecked: true },
      { id: "workbook", label: "Challenge Workbook", defaultChecked: false },
    ],
  },
  summit: {
    preEvent: [
      { id: "email_promo", label: "Email Promo Sequence (7 emails)", defaultChecked: true },
      { id: "social_promo", label: "Social Media Posts (20 posts)", defaultChecked: true },
      { id: "ad_copy", label: "Facebook Ad Copy (5 variations)", defaultChecked: true },
      { id: "reg_page", label: "Registration Page Copy", defaultChecked: true },
      { id: "speaker_outreach", label: "Speaker Outreach Templates", defaultChecked: true },
    ],
    eventContent: [
      { id: "slides", label: "Slide Deck Outlines (per speaker)", defaultChecked: true },
      { id: "scripts", label: "Host Scripts & Intros", defaultChecked: false },
      { id: "agreements", label: "Speaker Agreements", defaultChecked: true },
      { id: "replay_emails", label: "Replay Email Sequence (5 emails)", defaultChecked: true },
      { id: "sponsor_kit", label: "Sponsor Media Kit", defaultChecked: false },
    ],
  },
};

interface TierData {
  price: string;
  description: string;
}

function initializeTierData(eventType: EventType): Record<string, TierData> {
  const blueprint = OFFER_BLUEPRINTS[eventType];
  const data: Record<string, TierData> = {};
  blueprint.tiers.forEach((tier) => {
    data[tier.id] = {
      price: tier.defaultPrice.toString(),
      description: "",
    };
  });
  return data;
}

interface EventBuilderDraft {
  version: 1;
  activeTab: string;
  eventType: EventType;
  eventName: string;
  startDate: string;
  timezone: string;
  hook: string;
  tierData: Record<string, TierData>;
  backendOffer: { price: string; productName: string; description: string };
  targetAudience: string;
  pains: string;
  outcomes: string;
  bannedPhrases: string;
  selectedAssets: Record<string, boolean>;
  selectedTemplates: Record<number, boolean>;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}

const EVENT_BUILDER_TABS = ["details", "offer", "audience", "assets"];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readEventBuilderDraft(key: string): EventBuilderDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const rawDraft = window.localStorage.getItem(key);
    if (!rawDraft) return null;
    const parsed: unknown = JSON.parse(rawDraft);
    if (!isRecord(parsed) || parsed.version !== 1) throw new Error("Unsupported draft format");
    const form = parsed.form;
    if (
      !isRecord(form) ||
      !["free_challenge", "paid_challenge", "summit", "webinar"].includes(String(form.eventType)) ||
      !EVENT_BUILDER_TABS.includes(String(form.activeTab)) ||
      !isRecord(form.tierData) ||
      !isRecord(form.backendOffer) ||
      !isRecord(form.selectedAssets) ||
      !isRecord(form.selectedTemplates)
    ) {
      throw new Error("Invalid draft data");
    }

    const stringFields = [
      "eventName", "startDate", "timezone", "hook", "targetAudience", "pains",
      "outcomes", "bannedPhrases", "utmSource", "utmMedium", "utmCampaign",
    ];
    if (stringFields.some((field) => typeof form[field] !== "string")) {
      throw new Error("Invalid draft fields");
    }
    if (
      typeof form.backendOffer.price !== "string" ||
      typeof form.backendOffer.productName !== "string" ||
      typeof form.backendOffer.description !== "string" ||
      Object.values(form.tierData).some(
        (tier) => !isRecord(tier) || typeof tier.price !== "string" || typeof tier.description !== "string",
      ) ||
      Object.values(form.selectedAssets).some((selected) => typeof selected !== "boolean") ||
      Object.values(form.selectedTemplates).some((selected) => typeof selected !== "boolean")
    ) {
      throw new Error("Invalid draft fields");
    }

    return form as unknown as EventBuilderDraft;
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage can be unavailable or read-only; leave the current form usable.
    }
    return null;
  }
}

export default function EventBuilderPage() {
  const params = useParams();
  const clientId = parseInt(params.id || "0");
  const { user } = useAuth();
  const draftKey = `event-builder-draft-user-${user?.id}-client-${clientId}`;
  const [initialDraft] = useState(() => readEventBuilderDraft(draftKey));
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const [draftStatus, setDraftStatus] = useState<"saved" | "restored" | null>(
    initialDraft ? "restored" : null,
  );
  const [activeTab, setActiveTab] = useState(initialDraft?.activeTab ?? "details");

  const [eventType, setEventType] = useState<EventType>(initialDraft?.eventType ?? "webinar");
  const [eventName, setEventName] = useState(initialDraft?.eventName ?? "");
  const [startDate, setStartDate] = useState(initialDraft?.startDate ?? "");
  const [timezone, setTimezone] = useState(initialDraft?.timezone ?? "est");
  const [hook, setHook] = useState(initialDraft?.hook ?? "");

  const [tierData, setTierData] = useState<Record<string, TierData>>(
    initialDraft?.tierData ?? initializeTierData(initialDraft?.eventType ?? "webinar"),
  );
  const [backendOffer, setBackendOffer] = useState(
    initialDraft?.backendOffer ?? { price: "997", productName: "", description: "" },
  );

  const [targetAudience, setTargetAudience] = useState(initialDraft?.targetAudience ?? "");
  const [pains, setPains] = useState(initialDraft?.pains ?? "");
  const [outcomes, setOutcomes] = useState(initialDraft?.outcomes ?? "");
  const [bannedPhrases, setBannedPhrases] = useState(initialDraft?.bannedPhrases ?? "");

  const [selectedAssets, setSelectedAssets] = useState<Record<string, boolean>>(() => {
    if (initialDraft) return initialDraft.selectedAssets;
    const initial: Record<string, boolean> = {};
    Object.values(ASSET_CONFIG).forEach((config) => {
      [...config.preEvent, ...config.eventContent].forEach((asset) => {
        initial[asset.id] = asset.defaultChecked;
      });
    });
    return initial;
  });

  const [selectedTemplates, setSelectedTemplates] = useState<Record<number, boolean>>(
    initialDraft?.selectedTemplates ?? {},
  );

  const { data: templates = [], isError: templatesError } = useQuery<AssetTemplate[]>({
    queryKey: ["/api/asset-templates"],
    retry: false,
    staleTime: 60000,
  });

  const eventTemplates = useMemo(() => {
    const eventTypeMap: Record<string, string[]> = {
      webinar: ["webinar"],
      free_challenge: ["challenge"],
      paid_challenge: ["challenge"],
      summit: ["summit"],
    };
    return templates.filter(t => eventTypeMap[eventType]?.includes(t.eventType) && t.isActive);
  }, [templates, eventType]);

  const prevEventTemplatesRef = useRef<number[]>([]);
  
  useEffect(() => {
    const currentIds = eventTemplates.map(t => t.id).sort();
    const prevIds = prevEventTemplatesRef.current;
    
    if (currentIds.length === prevIds.length && currentIds.every((id, i) => id === prevIds[i])) {
      return;
    }
    
    prevEventTemplatesRef.current = currentIds;
    setSelectedTemplates((previous) => {
      const initial: Record<number, boolean> = {};
      eventTemplates.forEach(t => {
        initial[t.id] = previous[t.id] ?? initialDraft?.selectedTemplates[t.id] ?? true;
      });
      return initial;
    });
  }, [eventTemplates]);

  const handleTemplateToggle = (templateId: number, checked: boolean) => {
    setSelectedTemplates((prev) => ({ ...prev, [templateId]: checked }));
  };

  const [utmSource, setUtmSource] = useState(initialDraft?.utmSource ?? "facebook");
  const [utmMedium, setUtmMedium] = useState(initialDraft?.utmMedium ?? "cpc");
  const [utmCampaign, setUtmCampaign] = useState(initialDraft?.utmCampaign ?? "");

  const previousEventTypeRef = useRef(eventType);
  useEffect(() => {
    if (previousEventTypeRef.current === eventType) return;
    previousEventTypeRef.current = eventType;
    setTierData(initializeTierData(eventType));
  }, [eventType]);

  const currentBlueprint = OFFER_BLUEPRINTS[eventType];
  const currentAssets = ASSET_CONFIG[eventType];

  const handleTierChange = (tierId: string, field: "price" | "description", value: string) => {
    setTierData((prev) => ({
      ...prev,
      [tierId]: {
        ...prev[tierId],
        [field]: value,
      },
    }));
  };

  const handleAssetToggle = (assetId: string, checked: boolean) => {
    setSelectedAssets((prev) => ({ ...prev, [assetId]: checked }));
  };

  const [, setLocation] = useLocation();
  const [generationSuccess, setGenerationSuccess] = useState(false);

  const handleSaveDraft = () => {
    const draft: EventBuilderDraft = {
      version: 1,
      activeTab,
      eventType,
      eventName,
      startDate,
      timezone,
      hook,
      tierData,
      backendOffer,
      targetAudience,
      pains,
      outcomes,
      bannedPhrases,
      selectedAssets,
      selectedTemplates,
      utmSource,
      utmMedium,
      utmCampaign,
    };

    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ version: 1, form: draft }));
      setDraftStatus("saved");
      toast({
        title: "Draft saved",
        description: "This draft is saved in this browser for this client.",
      });
    } catch {
      toast({
        title: "Unable to save draft",
        description: "This browser could not store the draft. Check your browser storage settings and try again.",
        variant: "destructive",
      });
    }
  };

  const createEventMutation = useMutation({
    mutationFn: async (eventData: any) => {
      const response = await fetch(`/api/clients/${clientId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(eventData),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create event");
      }
      return response.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async ({ eventId, assetTypes }: { eventId: number; assetTypes: string[] }) => {
      const response = await fetch(`/api/events/${eventId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ selectedAssetTypes: assetTypes }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start generation");
      }
      return response.json();
    },
  });

  const generateFromTemplatesMutation = useMutation({
    mutationFn: async ({ eventId, templateIds }: { eventId: number; templateIds: number[] }) => {
      const response = await fetch(`/api/events/${eventId}/generate-from-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templateIds }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start template generation");
      }
      return response.json();
    },
  });

  const handleGenerate = async () => {
    if (!eventName.trim()) {
      toast({ title: "Error", description: "Please enter an event name", variant: "destructive" });
      return;
    }

    const selectedAssetList = [...currentAssets.preEvent, ...currentAssets.eventContent]
      .filter((asset) => selectedAssets[asset.id] ?? asset.defaultChecked)
      .map((asset) => asset.id);

    const selectedTemplateIds = Object.entries(selectedTemplates)
      .filter(([_, checked]) => checked)
      .map(([id]) => parseInt(id));

    if (selectedAssetList.length === 0 && selectedTemplateIds.length === 0) {
      toast({ title: "Error", description: "Please select at least one asset or template to generate", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const eventData = {
        name: eventName,
        type: eventType,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        timezone,
        hook,
        tierData,
        backendOfferPrice: parseInt(backendOffer.price) || 0,
        backendOfferName: backendOffer.productName,
        backendOfferDescription: backendOffer.description,
        targetAudience,
        audiencePains: pains,
        audienceOutcomes: outcomes,
        bannedPhrases,
        utmSource,
        utmMedium,
        utmCampaign,
        selectedAssets: selectedAssetList,
      };

      const event = await createEventMutation.mutateAsync(eventData);
      
      const generationPromises: Promise<any>[] = [];
      
      if (selectedAssetList.length > 0) {
        generationPromises.push(
          generateMutation.mutateAsync({ eventId: event.id, assetTypes: selectedAssetList })
        );
      }
      
      if (selectedTemplateIds.length > 0) {
        generationPromises.push(
          generateFromTemplatesMutation.mutateAsync({ eventId: event.id, templateIds: selectedTemplateIds })
        );
      }
      
      await Promise.all(generationPromises);

      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // Keep successful generation independent from browser storage availability.
      }
      setDraftStatus(null);
      setGenerationSuccess(true);
      toast({
        title: "Generation Started!",
        description: "Your assets are being generated. This may take a few minutes.",
      });

      setTimeout(() => {
        setLocation(`/client/${clientId}/assets`);
      }, 2000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const getEventTypeLabel = () => {
    switch (eventType) {
      case "free_challenge":
      case "paid_challenge":
        return "5-Day Challenge";
      case "summit":
        return "Virtual Summit";
      case "webinar":
        return "Masterclass";
      default:
        return "Event";
    }
  };

  return (
    <AppLayout title="Event Builder" mode="client">
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">New Event Project</h2>
            <p className="text-muted-foreground text-sm">Fill in the details to generate your marketing assets.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSaveDraft} data-testid="button-save-draft">Save Draft</Button>
          </div>
        </div>
        {draftStatus && (
          <p className="text-sm text-muted-foreground" role="status">
            {draftStatus === "saved"
              ? "Draft saved in this browser for this client."
              : "Draft restored from this browser for this client."}
          </p>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="details" data-testid="tab-details">1. Event Details</TabsTrigger>
            <TabsTrigger value="offer" data-testid="tab-offer">2. Offer & Pricing</TabsTrigger>
            <TabsTrigger value="audience" data-testid="tab-audience">3. Audience</TabsTrigger>
            <TabsTrigger value="assets" data-testid="tab-assets">4. Asset Selection</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <Card>
              <CardHeader>
                <CardTitle>Event Basics</CardTitle>
                <CardDescription>Core information about the event.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="type">Event Type</Label>
                    <Select value={eventType} onValueChange={(val) => setEventType(val as EventType)}>
                      <SelectTrigger id="type" data-testid="select-event-type">
                        <SelectValue placeholder="Select Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free_challenge">Free Challenge</SelectItem>
                        <SelectItem value="paid_challenge">Paid Challenge</SelectItem>
                        <SelectItem value="summit">Virtual Summit</SelectItem>
                        <SelectItem value="webinar">Masterclass</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="eventName">Event Name</Label>
                  <Input
                    id="eventName"
                    placeholder="e.g. The AI Marketing Summit 2025"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    data-testid="input-event-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="date">Start Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      data-testid="input-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="time">Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger id="time" data-testid="select-timezone">
                        <SelectValue placeholder="Timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="est">EST (New York)</SelectItem>
                        <SelectItem value="pst">PST (Los Angeles)</SelectItem>
                        <SelectItem value="gmt">GMT (London)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hook">Main Hook / Promise</Label>
                  <Textarea
                    id="hook"
                    placeholder="What is the one big promise of this event?"
                    className="h-20"
                    value={hook}
                    onChange={(e) => setHook(e.target.value)}
                    data-testid="input-hook"
                  />
                </div>

                <div className="flex justify-end pt-4">
                  <Button onClick={() => setActiveTab("offer")} data-testid="button-next-offer">
                    Next: Offer & Pricing <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="offer">
            <Card>
              <CardHeader>
                <CardTitle>Offer Ladder</CardTitle>
                <CardDescription>
                  Define the pricing tiers for your {currentBlueprint.displayName}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className={`grid gap-6 ${currentBlueprint.tiers.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {currentBlueprint.tiers.map((tier) => (
                    <div
                      key={tier.id}
                      className={`border p-4 rounded-md space-y-4 ${
                        tier.highlight
                          ? "bg-primary/5 border-primary/20"
                          : "bg-muted/20"
                      }`}
                      data-testid={`tier-card-${tier.id}`}
                    >
                      <h4 className={`font-semibold ${tier.highlight ? "text-primary" : ""}`}>
                        {tier.label}
                      </h4>
                      <div className="space-y-2">
                        <Label>Price ($)</Label>
                        <Input
                          value={tierData[tier.id]?.price ?? tier.defaultPrice.toString()}
                          onChange={(e) => handleTierChange(tier.id, "price", e.target.value)}
                          disabled={!tier.priceEditable}
                          data-testid={`input-price-${tier.id}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{tier.descriptionLabel}</Label>
                        <Textarea
                          placeholder={`What's included in ${tier.label}...`}
                          className="h-24"
                          value={tierData[tier.id]?.description ?? ""}
                          onChange={(e) => handleTierChange(tier.id, "description", e.target.value)}
                          data-testid={`input-description-${tier.id}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-6">
                  <div className="border p-4 rounded-md space-y-4 bg-muted/20">
                    <h4 className="font-semibold">Backend Offer</h4>
                    <p className="text-sm text-muted-foreground">The main product or course you'll pitch during or after the event.</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Price ($)</Label>
                        <Input
                          value={backendOffer.price}
                          onChange={(e) => setBackendOffer((prev) => ({ ...prev, price: e.target.value }))}
                          data-testid="input-backend-price"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Product Name</Label>
                        <Input
                          placeholder="Course Name"
                          value={backendOffer.productName}
                          onChange={(e) => setBackendOffer((prev) => ({ ...prev, productName: e.target.value }))}
                          data-testid="input-backend-name"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>What's Included</Label>
                      <Textarea
                        placeholder="List the main features, modules, or bonuses included in this offer..."
                        className="h-24"
                        value={backendOffer.description}
                        onChange={(e) => setBackendOffer((prev) => ({ ...prev, description: e.target.value }))}
                        data-testid="input-backend-description"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="ghost" onClick={() => setActiveTab("details")} data-testid="button-back-details">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={() => setActiveTab("audience")} data-testid="button-next-audience">
                    Next: Audience <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audience">
            <Card>
              <CardHeader>
                <CardTitle>Audience Persona</CardTitle>
                <CardDescription>Who are we targeting and what are their pains?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Who is this for?</Label>
                  <Input
                    placeholder="e.g. Agency owners doing $10k-$50k/mo"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    data-testid="input-target-audience"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Top 3 Pains / Frustrations</Label>
                    <Textarea
                      placeholder="1. Can't scale ads&#10;2. High churn&#10;3. Burnout"
                      className="h-32"
                      value={pains}
                      onChange={(e) => setPains(e.target.value)}
                      data-testid="input-pains"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Top 3 Desired Outcomes</Label>
                    <Textarea
                      placeholder="1. Automated leads&#10;2. 30% profit margins&#10;3. Freedom of time"
                      className="h-32"
                      value={outcomes}
                      onChange={(e) => setOutcomes(e.target.value)}
                      data-testid="input-outcomes"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Banned Words/Phrases</Label>
                  <Input
                    placeholder="e.g. 'Cheap', 'Easy money', 'Passive income'"
                    value={bannedPhrases}
                    onChange={(e) => setBannedPhrases(e.target.value)}
                    data-testid="input-banned-phrases"
                  />
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="ghost" onClick={() => setActiveTab("offer")} data-testid="button-back-offer">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button onClick={() => setActiveTab("assets")} data-testid="button-next-assets">
                    Next: Assets <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assets">
            <Card>
              <CardHeader>
                <CardTitle>Generate Assets</CardTitle>
                <CardDescription>
                  Select which assets you want the AI to create for your {getEventTypeLabel()}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h3 className="font-semibold border-b pb-2">Pre-Event Marketing</h3>
                    {currentAssets.preEvent.map((asset) => (
                      <div key={asset.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={asset.id}
                          checked={selectedAssets[asset.id] ?? asset.defaultChecked}
                          onCheckedChange={(checked) => handleAssetToggle(asset.id, checked as boolean)}
                          data-testid={`checkbox-${asset.id}`}
                        />
                        <Label htmlFor={asset.id}>{asset.label}</Label>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold border-b pb-2">
                      {eventType === "free_challenge" || eventType === "paid_challenge" ? "Challenge Content" : "Event Content & Ops"}
                    </h3>
                    {currentAssets.eventContent.map((asset) => (
                      <div key={asset.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={asset.id}
                          checked={selectedAssets[asset.id] ?? asset.defaultChecked}
                          onCheckedChange={(checked) => handleAssetToggle(asset.id, checked as boolean)}
                          data-testid={`checkbox-${asset.id}`}
                        />
                        <Label htmlFor={asset.id}>{asset.label}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                {eventTemplates.length > 0 && (
                  <div className="space-y-4 bg-gradient-to-r from-primary/5 to-transparent p-4 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">Custom Templates</h3>
                      <Badge variant="secondary" className="text-xs">Template-based AI</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Generate assets using your agency's custom templates with tailored prompts.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      {eventTemplates.map((template) => (
                        <div key={template.id} className="flex items-center space-x-2 p-2 bg-background rounded border">
                          <Checkbox
                            id={`template-${template.id}`}
                            checked={selectedTemplates[template.id] ?? true}
                            onCheckedChange={(checked) => handleTemplateToggle(template.id, checked as boolean)}
                            data-testid={`checkbox-template-${template.id}`}
                          />
                          <div className="flex-1">
                            <Label htmlFor={`template-${template.id}`} className="text-sm font-medium">
                              {template.name}
                            </Label>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[10px] h-4">{template.assetType}</Badge>
                              <span>• {template.itemCount} items</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-muted/30 p-4 rounded-lg border border-dashed border-primary/30">
                  <h4 className="font-semibold text-sm mb-2">Tracking Configuration</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">UTM Source</Label>
                      <Input
                        className="h-8"
                        value={utmSource}
                        onChange={(e) => setUtmSource(e.target.value)}
                        data-testid="input-utm-source"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">UTM Medium</Label>
                      <Input
                        className="h-8"
                        value={utmMedium}
                        onChange={(e) => setUtmMedium(e.target.value)}
                        data-testid="input-utm-medium"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">UTM Campaign</Label>
                      <Input
                        className="h-8"
                        value={utmCampaign}
                        onChange={(e) => setUtmCampaign(e.target.value)}
                        placeholder={eventName.toLowerCase().replace(/\s+/g, "_") || "campaign_name"}
                        data-testid="input-utm-campaign"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-6 border-t">
                  <Button variant="ghost" onClick={() => setActiveTab("audience")} data-testid="button-back-audience">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <div className="flex items-center gap-4">
                    <p className="text-xs text-muted-foreground">Estimated time: ~2 minutes</p>
                    <Button size="lg" onClick={handleGenerate} disabled={isGenerating || generationSuccess} className="min-w-[200px]" data-testid="button-generate">
                      {generationSuccess ? (
                        <>
                          <CheckCircle className="mr-2 h-4 w-4" /> Redirecting to Assets...
                        </>
                      ) : isGenerating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating & Generating...
                        </>
                      ) : (
                        <>
                          <Wand2 className="mr-2 h-4 w-4" /> Generate All Assets
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

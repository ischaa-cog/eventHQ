import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type IntakeAnswers = {
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  businessAddress: string;
  website: string;
  niche: string;
  primaryOffer: string;
  brandVoiceDos: string;
  brandVoiceDonts: string;
};

type ClientProfile = { id: number; name: string; onboardingComplete: boolean } &
  Partial<Record<keyof IntakeAnswers, string | null>>;

const emptyAnswers: IntakeAnswers = {
  fullName: "",
  email: "",
  phone: "",
  businessName: "",
  businessAddress: "",
  website: "",
  niche: "",
  primaryOffer: "",
  brandVoiceDos: "",
  brandVoiceDonts: "",
};

function answersFromClient(client: ClientProfile): IntakeAnswers {
  return Object.fromEntries(
    (Object.keys(emptyAnswers) as (keyof IntakeAnswers)[]).map((key) => [key, client[key] ?? ""]),
  ) as IntakeAnswers;
}

export default function ClientOnboardingPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const queryKey = [`/api/clients/${clientId}`];
  const [answers, setAnswers] = useState<IntakeAnswers>(emptyAnswers);
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState("");

  const { data: client, isLoading, isError } = useQuery<ClientProfile>({
    queryKey,
    enabled: !!clientId,
    queryFn: async () => {
      const response = await fetch(`/api/clients/${clientId}`);
      if (!response.ok) throw new Error("Unable to load this workspace");
      return response.json();
    },
  });

  useEffect(() => {
    if (client) setAnswers(answersFromClient(client));
  }, [client]);

  const save = useMutation({
    mutationFn: async (values: IntakeAnswers): Promise<ClientProfile> => {
      const response = await fetch(`/api/clients/${clientId}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Unable to save your details. Please try again.");
      }
      return response.json();
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setSaveError("");
      setEditing(false);
    },
    onError: (error: Error) => setSaveError(error.message),
  });

  const setField = (key: keyof IntakeAnswers, value: string) => {
    setAnswers((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError("");
    save.mutate(answers);
  };

  const completed = Boolean(client?.onboardingComplete && !editing);
  const summaryFields: [string, string | null | undefined][] = client ? ([
    ["Full name", client.fullName],
    ["Email", client.email],
    ["Phone", client.phone],
    ["Business name", client.businessName],
    ["Website", client.website],
    ["Industry or niche", client.niche],
    ["Primary offer", client.primaryOffer],
    ["Business address", client.businessAddress],
    ["How your brand should sound", client.brandVoiceDos],
    ["What your brand should avoid", client.brandVoiceDonts],
  ] as [string, string | null | undefined][]).filter(([, value]) => value?.trim()) : [];

  return (
    <AppLayout title={completed ? "Your Setup" : "Onboarding"} mode="client">
      <div className="mx-auto max-w-3xl space-y-6 pb-8" data-testid="onboarding-container">
        {isLoading ? (
          <p className="py-16 text-center text-muted-foreground" role="status">Loading your workspace…</p>
        ) : isError || !client ? (
          <Card><CardContent className="py-8 text-center text-destructive" role="alert">
            We couldn't load this workspace. Please refresh the page or contact your team.
          </CardContent></Card>
        ) : completed ? (
          <>
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="space-y-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                </div>
                <CardTitle className="text-2xl">Your onboarding is complete</CardTitle>
                <CardDescription>
                  Your workspace is ready. You can review the details saved for your team below.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button asChild><Link href={`/client/${clientId}/dashboard`}>Go to dashboard</Link></Button>
                <Button variant="outline" asChild><Link href={`/client/${clientId}/training`}>Visit Training Lab</Link></Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Your details</CardTitle>
                  <CardDescription>Need to correct something? You can update these details.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit details</Button>
              </CardHeader>
              <CardContent>
                {summaryFields.length ? (
                  <dl className="grid gap-5 sm:grid-cols-2">
                    {summaryFields.map(([label, value]) => (
                      <div key={label} className="min-w-0 border-b border-border/60 pb-3">
                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
                        <dd className="mt-1 break-words text-sm whitespace-pre-wrap">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No intake details have been saved yet. Select “Edit details” to add them.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <ClipboardList className="h-5 w-5" aria-hidden="true" />
                <span className="text-xs font-bold uppercase tracking-widest">Getting started</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {editing ? "Update your details" : `Welcome to ${client.name}`}
              </h1>
              <p className="text-sm text-muted-foreground">
                Tell us about you and your business so we can set up your workspace. Fields marked * are required.
              </p>
            </div>
            <form onSubmit={submit} className="space-y-5">
              <Card>
                <CardHeader><CardTitle>About you</CardTitle><CardDescription>How should we contact you?</CardDescription></CardHeader>
                <CardContent className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="intake-name">Full name *</Label>
                    <Input id="intake-name" required maxLength={200} autoComplete="name" value={answers.fullName} onChange={(e) => setField("fullName", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-email">Email *</Label>
                    <Input id="intake-email" type="email" required maxLength={320} autoComplete="email" value={answers.email} onChange={(e) => setField("email", e.target.value)} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="intake-phone">Phone</Label>
                    <Input id="intake-phone" type="tel" maxLength={100} autoComplete="tel" value={answers.phone} onChange={(e) => setField("phone", e.target.value)} />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Your business</CardTitle><CardDescription>What are you building and who is it for?</CardDescription></CardHeader>
                <CardContent className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="intake-business">Business name *</Label>
                    <Input id="intake-business" required maxLength={200} autoComplete="organization" value={answers.businessName} onChange={(e) => setField("businessName", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-website">Website</Label>
                    <Input id="intake-website" type="url" maxLength={500} placeholder="https://example.com" value={answers.website} onChange={(e) => setField("website", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-niche">Industry or niche</Label>
                    <Input id="intake-niche" maxLength={200} placeholder="e.g. Coaching, education, events" value={answers.niche} onChange={(e) => setField("niche", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-address">Business address</Label>
                    <Input id="intake-address" maxLength={500} autoComplete="street-address" value={answers.businessAddress} onChange={(e) => setField("businessAddress", e.target.value)} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="intake-offer">Your main offer *</Label>
                    <Textarea id="intake-offer" required maxLength={2000} rows={3} placeholder="What product or service do you want to promote?" value={answers.primaryOffer} onChange={(e) => setField("primaryOffer", e.target.value)} />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Your brand voice</CardTitle><CardDescription>Optional guidance for content created in your workspace.</CardDescription></CardHeader>
                <CardContent className="grid gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="intake-dos">How should your brand sound?</Label>
                    <Textarea id="intake-dos" maxLength={2000} rows={3} placeholder="Tone, phrases or examples you like" value={answers.brandVoiceDos} onChange={(e) => setField("brandVoiceDos", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="intake-donts">What should your brand avoid?</Label>
                    <Textarea id="intake-donts" maxLength={2000} rows={3} placeholder="Words, claims or styles you don't use" value={answers.brandVoiceDonts} onChange={(e) => setField("brandVoiceDonts", e.target.value)} />
                  </div>
                </CardContent>
              </Card>
              {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : editing ? "Save changes" : "Complete onboarding"}</Button>
                {editing && <Button type="button" variant="ghost" onClick={() => { setAnswers(answersFromClient(client)); setEditing(false); setSaveError(""); }}>Cancel</Button>}
              </div>
            </form>
          </>
        )}
      </div>
    </AppLayout>
  );
}
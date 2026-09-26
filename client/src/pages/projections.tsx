import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useState, useMemo, useCallback } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Target, DollarSign, AlertTriangle, ArrowDown, Users, ShoppingCart, Gem, Star, Download, Trash2, Pencil } from "lucide-react";
import { jsPDF } from "jspdf";

function SafeChart({ data }: { data: Array<{ name: string; revenue: number; spend: number; profit: number }> }) {
  return (
    <div className="h-[250px] sm:h-[300px] w-full overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" fontSize={12} />
          <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} fontSize={12} />
          <Tooltip formatter={(v) => `$${typeof v === 'number' ? v.toLocaleString() : v}`} />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" radius={[4, 4, 0, 0]} />
          <Bar dataKey="spend" fill="#64748b" name="Ad Spend" radius={[4, 4, 0, 0]} />
          <Bar dataKey="profit" fill="#22c55e" name="Profit" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface Client {
  id: number;
  name: string;
  businessName: string | null;
}

export default function ClientProjectionsPage() {
  const [, params] = useRoute("/client/:id/projections");
  const clientId = params?.id;
  const queryClient = useQueryClient();
  type Projection = { id: number; title: string; adSpend: number; expectedRegistrations: number; showUpRate: number; conversionRate: number; averageSaleValue: number; createdAt: string };
  const [projection, setProjection] = useState({ title: "", adSpend: 0, expectedRegistrations: 0, showUpRate: 0, conversionRate: 0, averageSaleValue: 0 });
  const [editingProjectionId, setEditingProjectionId] = useState<number | null>(null);
  const projectionsQuery = useQuery<Projection[]>({
    queryKey: [`/api/clients/${clientId}/projections`],
    queryFn: async () => { const res = await fetch(`/api/clients/${clientId}/projections`); if (!res.ok) throw new Error("Failed to load projections"); return res.json(); },
    enabled: !!clientId,
  });
  const saveProjection = useMutation({
    mutationFn: async () => { const url = editingProjectionId ? `/api/projections/${editingProjectionId}` : `/api/clients/${clientId}/projections`; const res = await fetch(url, { method: editingProjectionId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(projection) }); if (!res.ok) throw new Error("Failed to save projection"); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/projections`] }); setEditingProjectionId(null); setProjection({ title: "", adSpend: 0, expectedRegistrations: 0, showUpRate: 0, conversionRate: 0, averageSaleValue: 0 }); },
  });
  const deleteProjection = useMutation({
    mutationFn: async (id: number) => { const res = await fetch(`/api/projections/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error("Failed to delete projection"); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/projections`] }),
  });
  const simpleProjection = useMemo(() => {
    const attendees = projection.expectedRegistrations * projection.showUpRate / 100;
    const sales = attendees * projection.conversionRate / 100;
    const revenue = sales * projection.averageSaleValue;
    return { attendees, sales, revenue, roas: projection.adSpend > 0 ? revenue / projection.adSpend : null };
  }, [projection]);
  const updateProjection = (field: keyof typeof projection, value: string) =>
    setProjection(p => ({ ...p, [field]: field === "title" ? value : Number(value) || 0 }));

  const { data: client } = useQuery<Client>({
    queryKey: [`/api/clients/${clientId}`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}`);
      if (!res.ok) throw new Error("Failed to fetch client");
      return res.json();
    },
    enabled: !!clientId,
  });

  const [revenueGoal, setRevenueGoal] = useState(50000);
  const [cpl, setCpl] = useState(8);
  const [showUpRate, setShowUpRate] = useState(25);

  const [lowTicketEnabled, setLowTicketEnabled] = useState(true);
  const [lowTicketAOV, setLowTicketAOV] = useState(47);
  const [lowTicketCloseRate, setLowTicketCloseRate] = useState(5);

  const [midTicketEnabled, setMidTicketEnabled] = useState(true);
  const [midTicketAOV, setMidTicketAOV] = useState(297);
  const [midTicketCloseRate, setMidTicketCloseRate] = useState(10);

  const [highTicketEnabled, setHighTicketEnabled] = useState(true);
  const [highTicketAOV, setHighTicketAOV] = useState(997);
  const [highTicketCloseRate, setHighTicketCloseRate] = useState(30);

  const formatNumberWithCommas = (value: number): string => {
    return value.toLocaleString('en-US');
  };

  const parseFormattedNumber = (value: string): number => {
    const cleaned = value.replace(/,/g, '');
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? 0 : parsed;
  };

  const handleRevenueGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFormattedNumber(e.target.value);
    setRevenueGoal(parsed);
  };

  const calculations = useMemo(() => {
    let revenuePerLead = 0;

    if (lowTicketEnabled) {
      revenuePerLead += (lowTicketCloseRate / 100) * lowTicketAOV;
    }
    if (midTicketEnabled) {
      revenuePerLead += (showUpRate / 100) * (midTicketCloseRate / 100) * midTicketAOV;
    }
    if (highTicketEnabled && midTicketEnabled) {
      revenuePerLead += (showUpRate / 100) * (midTicketCloseRate / 100) * (highTicketCloseRate / 100) * highTicketAOV;
    } else if (highTicketEnabled && !midTicketEnabled) {
      revenuePerLead += (showUpRate / 100) * (highTicketCloseRate / 100) * highTicketAOV;
    }

    if (revenuePerLead === 0) {
      return {
        isValid: false,
        requiredSpend: 0,
        leadsNeeded: 0,
        showUpsNeeded: 0,
        lowTicketSales: 0,
        midTicketSales: 0,
        highTicketSales: 0,
        lowTicketRevenue: 0,
        midTicketRevenue: 0,
        highTicketRevenue: 0,
        totalRevenue: 0,
        profit: 0,
        roas: 0,
      };
    }

    const leadsNeeded = Math.ceil(revenueGoal / revenuePerLead);
    const showUpsNeeded = Math.ceil(leadsNeeded * (showUpRate / 100));
    const requiredSpend = leadsNeeded * cpl;

    let lowTicketSales = 0;
    let midTicketSales = 0;
    let highTicketSales = 0;
    let lowTicketRevenue = 0;
    let midTicketRevenue = 0;
    let highTicketRevenue = 0;

    if (lowTicketEnabled) {
      lowTicketSales = Math.ceil(leadsNeeded * (lowTicketCloseRate / 100));
      lowTicketRevenue = lowTicketSales * lowTicketAOV;
    }

    if (midTicketEnabled) {
      midTicketSales = Math.ceil(showUpsNeeded * (midTicketCloseRate / 100));
      midTicketRevenue = midTicketSales * midTicketAOV;
    }

    if (highTicketEnabled) {
      if (midTicketEnabled) {
        highTicketSales = Math.ceil(midTicketSales * (highTicketCloseRate / 100));
      } else {
        highTicketSales = Math.ceil(showUpsNeeded * (highTicketCloseRate / 100));
      }
      highTicketRevenue = highTicketSales * highTicketAOV;
    }

    const totalRevenue = lowTicketRevenue + midTicketRevenue + highTicketRevenue;
    const profit = totalRevenue - requiredSpend;
    const roas = requiredSpend > 0 ? (totalRevenue / requiredSpend).toFixed(2) : 0;

    return {
      isValid: true,
      requiredSpend,
      leadsNeeded,
      showUpsNeeded,
      lowTicketSales,
      midTicketSales,
      highTicketSales,
      lowTicketRevenue,
      midTicketRevenue,
      highTicketRevenue,
      totalRevenue,
      profit,
      roas,
    };
  }, [revenueGoal, cpl, showUpRate, lowTicketEnabled, lowTicketAOV, lowTicketCloseRate, midTicketEnabled, midTicketAOV, midTicketCloseRate, highTicketEnabled, highTicketAOV, highTicketCloseRate]);

  const scenarioData = useMemo(() => {
    if (!calculations.isValid) return [];
    return [
      {
        name: 'Conservative',
        spend: Math.floor(calculations.requiredSpend * 1.3),
        revenue: Math.floor(calculations.totalRevenue * 0.8),
        profit: Math.floor(calculations.totalRevenue * 0.8) - Math.floor(calculations.requiredSpend * 1.3),
      },
      {
        name: 'Target',
        spend: calculations.requiredSpend,
        revenue: calculations.totalRevenue,
        profit: calculations.profit,
      },
      {
        name: 'Optimistic',
        spend: Math.floor(calculations.requiredSpend * 0.85),
        revenue: Math.floor(calculations.totalRevenue * 1.15),
        profit: Math.floor(calculations.totalRevenue * 1.15) - Math.floor(calculations.requiredSpend * 0.85),
      },
    ];
  }, [calculations]);

  const noOffersEnabled = !lowTicketEnabled && !midTicketEnabled && !highTicketEnabled;

  const exportToPDF = useCallback(() => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let y = 20;

    const checkPageBreak = (neededSpace: number) => {
      if (y + neededSpace > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
    };

    doc.setFontSize(24);
    doc.setTextColor(56, 182, 255);
    doc.text("Revenue Projection Report", margin, y);
    y += 15;

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, margin, y);
    y += 20;

    if (client?.name || client?.businessName) {
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text("Client:", margin, y);
      y += 8;
      doc.setFontSize(12);
      if (client?.name) {
        doc.text(client.name, margin, y);
        y += 6;
      }
      if (client?.businessName) {
        doc.text(client.businessName, margin, y);
        y += 6;
      }
      y += 10;
    }

    doc.setFillColor(56, 182, 255);
    doc.rect(margin, y, pageWidth - 2 * margin, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text("REVENUE GOAL", margin + 5, y + 8);
    doc.setFontSize(18);
    doc.text(`$${revenueGoal.toLocaleString()}`, margin + 5, y + 20);
    y += 35;

    doc.setFillColor(34, 197, 94);
    doc.rect(margin, y, pageWidth - 2 * margin, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text("REQUIRED AD SPEND", margin + 5, y + 8);
    doc.setFontSize(18);
    doc.text(`$${calculations.requiredSpend.toLocaleString()}`, margin + 5, y + 20);
    y += 35;

    checkPageBreak(80);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text("Conversion Funnel", margin, y);
    y += 10;

    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    
    const funnelItems = [
      { label: "Leads Required", value: calculations.leadsNeeded.toLocaleString() },
      { label: "Expected Show-Ups", value: `${calculations.showUpsNeeded.toLocaleString()} (${showUpRate}% rate)` },
    ];
    
    if (lowTicketEnabled) {
      funnelItems.push({ label: "Low Ticket Sales (from leads)", value: `${calculations.lowTicketSales.toLocaleString()} (${lowTicketCloseRate}% close rate)` });
    }
    if (midTicketEnabled) {
      funnelItems.push({ label: "Mid Ticket Sales (from show-ups)", value: `${calculations.midTicketSales.toLocaleString()} (${midTicketCloseRate}% close rate)` });
    }
    if (highTicketEnabled) {
      const highTicketContext = midTicketEnabled ? "from mid-ticket buyers" : "from show-ups";
      funnelItems.push({ label: `High Ticket Sales (${highTicketContext})`, value: `${calculations.highTicketSales.toLocaleString()} (${highTicketCloseRate}% close rate)` });
    }

    funnelItems.forEach((item, idx) => {
      doc.setFillColor(idx % 2 === 0 ? 245 : 255, idx % 2 === 0 ? 245 : 255, idx % 2 === 0 ? 245 : 255);
      doc.rect(margin, y, pageWidth - 2 * margin, 10, 'F');
      doc.text(item.label, margin + 5, y + 7);
      doc.text(item.value, pageWidth - margin - 5, y + 7, { align: 'right' });
      y += 10;
    });
    y += 15;

    checkPageBreak(80);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text("Revenue Breakdown", margin, y);
    y += 10;

    doc.setFontSize(11);
    const revenueItems = [];
    if (lowTicketEnabled) {
      revenueItems.push({ label: `Low Ticket Revenue (${calculations.lowTicketSales} × $${lowTicketAOV})`, value: `$${calculations.lowTicketRevenue.toLocaleString()}` });
    }
    if (midTicketEnabled) {
      revenueItems.push({ label: `Mid Ticket Revenue (${calculations.midTicketSales} × $${midTicketAOV})`, value: `$${calculations.midTicketRevenue.toLocaleString()}` });
    }
    if (highTicketEnabled) {
      revenueItems.push({ label: `High Ticket Revenue (${calculations.highTicketSales} × $${highTicketAOV})`, value: `$${calculations.highTicketRevenue.toLocaleString()}` });
    }
    revenueItems.push({ label: "Total Revenue", value: `$${calculations.totalRevenue.toLocaleString()}` });
    revenueItems.push({ label: "Estimated Profit", value: `$${calculations.profit.toLocaleString()}` });
    revenueItems.push({ label: "ROAS", value: `${calculations.roas}x` });

    revenueItems.forEach((item, idx) => {
      doc.setFillColor(idx % 2 === 0 ? 245 : 255, idx % 2 === 0 ? 245 : 255, idx % 2 === 0 ? 245 : 255);
      doc.rect(margin, y, pageWidth - 2 * margin, 10, 'F');
      doc.text(item.label, margin + 5, y + 7);
      doc.text(item.value, pageWidth - margin - 5, y + 7, { align: 'right' });
      y += 10;
    });
    y += 15;

    checkPageBreak(50);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text("Scenario Analysis", margin, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFillColor(56, 182, 255);
    doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text("Scenario", margin + 5, y + 6);
    doc.text("Ad Spend", margin + 55, y + 6);
    doc.text("Revenue", margin + 95, y + 6);
    doc.text("Profit", margin + 135, y + 6);
    y += 8;

    doc.setTextColor(60, 60, 60);
    scenarioData.forEach((scenario, idx) => {
      doc.setFillColor(idx % 2 === 0 ? 245 : 255, idx % 2 === 0 ? 245 : 255, idx % 2 === 0 ? 245 : 255);
      doc.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
      doc.text(scenario.name, margin + 5, y + 6);
      doc.text(`$${scenario.spend.toLocaleString()}`, margin + 55, y + 6);
      doc.text(`$${scenario.revenue.toLocaleString()}`, margin + 95, y + 6);
      doc.text(`$${scenario.profit.toLocaleString()}`, margin + 135, y + 6);
      y += 8;
    });

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("This projection is an estimate based on the assumptions provided.", margin, doc.internal.pageSize.getHeight() - 10);

    const filename = client?.name 
      ? `${client.name.replace(/[^a-z0-9]/gi, '_')}_projection.pdf`
      : 'client_projection.pdf';
    doc.save(filename);
  }, [revenueGoal, calculations, scenarioData, client, showUpRate, lowTicketEnabled, lowTicketCloseRate, lowTicketAOV, midTicketEnabled, midTicketCloseRate, midTicketAOV, highTicketEnabled, highTicketCloseRate, highTicketAOV]);

  return (
    <AppLayout title="Event Projections" mode="client">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Set a revenue goal for this client's event and calculate the required investment.
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={exportToPDF} data-testid="button-export-projection">
              <Download className="mr-2 h-4 w-4" /> Export PDF
            </Button>
            <span className="text-xs text-muted-foreground">Legacy calculator — estimates only</span>
          </div>
        </div>

        <Card className="border-blue-500/40 bg-blue-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Save className="h-5 w-5 text-blue-500" /> Saved Projection</CardTitle>
            <CardDescription>Persist a transparent scenario. These figures are estimates, not actual event results.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {([["title", "Title", "text"], ["adSpend", "Ad spend", "number"], ["expectedRegistrations", "Expected registrations", "number"], ["showUpRate", "Show-up rate (%)", "number"], ["conversionRate", "Conversion rate (%)", "number"], ["averageSaleValue", "Average sale value", "number"]] as const).map(([field, label, type]) => (
                <div className="space-y-1" key={field}>
                  <Label>{label}</Label>
                  <Input type={type} min={type === "number" ? 0 : undefined} value={projection[field]} onChange={e => updateProjection(field, e.target.value)} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><p className="text-xs text-muted-foreground">Expected attendees</p><p className="font-semibold">{simpleProjection.attendees.toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground">Expected sales</p><p className="font-semibold">{simpleProjection.sales.toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground">Expected revenue</p><p className="font-semibold">${simpleProjection.revenue.toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground">ROAS</p><p className="font-semibold">{simpleProjection.roas === null ? "N/A" : `${simpleProjection.roas.toFixed(2)}x`}</p></div>
            </div>
            <Button onClick={() => saveProjection.mutate()} disabled={saveProjection.isPending || !projection.title.trim()}><Save className="mr-2 h-4 w-4" />{saveProjection.isPending ? "Saving…" : editingProjectionId ? "Update projection" : "Save projection"}</Button>
            {projectionsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading saved projections…</p>}
            {projectionsQuery.isError && <p className="text-sm text-destructive">Could not load saved projections.</p>}
            {!projectionsQuery.isLoading && !projectionsQuery.isError && (projectionsQuery.data?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">No saved projections yet.</p>}
            <div className="space-y-2">
              {projectionsQuery.data?.map(saved => <div key={saved.id} className="flex items-center justify-between rounded border p-3">
                <div><p className="font-medium">{saved.title}</p><p className="text-xs text-muted-foreground">{saved.expectedRegistrations.toLocaleString()} registrations · {saved.showUpRate}% show-up · ${saved.averageSaleValue.toLocaleString()} average sale</p></div>
                <div className="flex items-center gap-3"><span className="text-sm">${(Number(saved.adSpend) || 0).toLocaleString()} spend · {Number(saved.adSpend) > 0 ? ((Number(saved.expectedRegistrations) * Number(saved.showUpRate) / 100 * Number(saved.conversionRate) / 100 * Number(saved.averageSaleValue)) / Number(saved.adSpend)).toFixed(2) + "x ROAS" : "N/A ROAS"}</span><Button variant="ghost" size="icon" onClick={() => { setEditingProjectionId(saved.id); setProjection({ title: saved.title, adSpend: Number(saved.adSpend), expectedRegistrations: Number(saved.expectedRegistrations), showUpRate: Number(saved.showUpRate), conversionRate: Number(saved.conversionRate), averageSaleValue: Number(saved.averageSaleValue) }); }} aria-label="Edit projection"><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => deleteProjection.mutate(saved.id)} aria-label="Delete projection"><Trash2 className="h-4 w-4" /></Button></div>
              </div>)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Revenue Goal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-2xl text-muted-foreground">$</div>
              <Input
                type="text"
                inputMode="numeric"
                value={formatNumberWithCommas(revenueGoal)}
                onChange={handleRevenueGoalChange}
                className="text-3xl font-bold h-14 w-full max-w-xs"
                data-testid="input-revenue-goal"
              />
              <p className="text-muted-foreground text-sm">target revenue for this event</p>
            </div>
          </CardContent>
        </Card>

        {noOffersEnabled && (
          <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-700">
            <AlertTriangle className="h-5 w-5" />
            <p>Enable at least one offer type to calculate projections.</p>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Traffic Assumptions</CardTitle>
                <CardDescription>Adjust your expected traffic metrics.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Cost Per Lead (CPL)</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[cpl]}
                      onValueChange={(v) => setCpl(v[0])}
                      max={30}
                      min={1}
                      step={1}
                      className="flex-1"
                      data-testid="slider-cpl"
                    />
                    <span className="w-14 text-right font-mono">${cpl}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Show-Up Rate</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[showUpRate]}
                      onValueChange={(v) => setShowUpRate(v[0])}
                      max={60}
                      min={10}
                      step={1}
                      className="flex-1"
                      data-testid="slider-showup"
                    />
                    <span className="w-14 text-right font-mono">{showUpRate}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Low Ticket Offer</CardTitle>
                    <CardDescription>Closes from all leads</CardDescription>
                  </div>
                  <Switch
                    checked={lowTicketEnabled}
                    onCheckedChange={setLowTicketEnabled}
                    data-testid="switch-lowticket"
                  />
                </div>
              </CardHeader>
              {lowTicketEnabled && (
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Average Order Value (AOV)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">$</span>
                      <Input
                        type="number"
                        value={lowTicketAOV}
                        onChange={(e) => setLowTicketAOV(Number(e.target.value))}
                        className="max-w-32"
                        data-testid="input-lowticket-aov"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Close Rate (of all leads)</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[lowTicketCloseRate]}
                        onValueChange={(v) => setLowTicketCloseRate(v[0])}
                        max={20}
                        min={1}
                        step={1}
                        className="flex-1"
                        data-testid="slider-lowticket-close"
                      />
                      <span className="w-14 text-right font-mono">{lowTicketCloseRate}%</span>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Mid Ticket Offer</CardTitle>
                    <CardDescription>Closes from show-ups</CardDescription>
                  </div>
                  <Switch
                    checked={midTicketEnabled}
                    onCheckedChange={setMidTicketEnabled}
                    data-testid="switch-midticket"
                  />
                </div>
              </CardHeader>
              {midTicketEnabled && (
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Average Order Value (AOV)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">$</span>
                      <Input
                        type="number"
                        value={midTicketAOV}
                        onChange={(e) => setMidTicketAOV(Number(e.target.value))}
                        className="max-w-32"
                        data-testid="input-midticket-aov"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Close Rate (of show-ups)</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[midTicketCloseRate]}
                        onValueChange={(v) => setMidTicketCloseRate(v[0])}
                        max={30}
                        min={1}
                        step={1}
                        className="flex-1"
                        data-testid="slider-midticket-close"
                      />
                      <span className="w-14 text-right font-mono">{midTicketCloseRate}%</span>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">High Ticket Offer</CardTitle>
                    <CardDescription>
                      {midTicketEnabled 
                        ? "Upsell to mid-ticket buyers" 
                        : "Closes from show-ups"}
                    </CardDescription>
                  </div>
                  <Switch
                    checked={highTicketEnabled}
                    onCheckedChange={setHighTicketEnabled}
                    data-testid="switch-highticket"
                  />
                </div>
              </CardHeader>
              {highTicketEnabled && (
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Average Order Value (AOV)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">$</span>
                      <Input
                        type="number"
                        value={highTicketAOV}
                        onChange={(e) => setHighTicketAOV(Number(e.target.value))}
                        className="max-w-32"
                        data-testid="input-highticket-aov"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {midTicketEnabled 
                        ? "Close Rate (of mid-ticket buyers)" 
                        : "Close Rate (of show-ups)"}
                    </Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[highTicketCloseRate]}
                        onValueChange={(v) => setHighTicketCloseRate(v[0])}
                        max={midTicketEnabled ? 60 : 15}
                        min={5}
                        step={5}
                        className="flex-1"
                        data-testid="slider-highticket-close"
                      />
                      <span className="w-14 text-right font-mono">{highTicketCloseRate}%</span>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-primary text-primary-foreground border-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Required Ad Spend to Hit Goal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold" data-testid="text-required-spend">
                  ${calculations.requiredSpend.toLocaleString()}
                </div>
                <p className="text-primary-foreground/70 mt-1">
                  to generate ${revenueGoal.toLocaleString()} in revenue
                </p>
              </CardContent>
            </Card>

            {calculations.isValid && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Conversion Funnel</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-around flex-wrap gap-4">
                    <div className="text-center">
                      <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-2">
                        <Users className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="text-2xl font-bold">{calculations.leadsNeeded.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Leads</div>
                    </div>
                    
                    {lowTicketEnabled && (
                      <>
                        <ArrowDown className="h-5 w-5 text-muted-foreground rotate-[-90deg]" />
                        
                        <div className="text-center">
                          <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-2">
                            <ShoppingCart className="h-6 w-6 text-emerald-600" />
                          </div>
                          <div className="text-2xl font-bold">{calculations.lowTicketSales.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">Low Ticket</div>
                          <div className="text-xs text-emerald-600">{lowTicketCloseRate}%</div>
                        </div>
                      </>
                    )}
                    
                    <ArrowDown className="h-5 w-5 text-muted-foreground rotate-[-90deg]" />
                    
                    <div className="text-center">
                      <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-2">
                        <Users className="h-6 w-6 text-green-600" />
                      </div>
                      <div className="text-2xl font-bold">{calculations.showUpsNeeded.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Show-Ups</div>
                      <div className="text-xs text-green-600">{showUpRate}%</div>
                    </div>
                    
                    {midTicketEnabled && (
                      <>
                        <ArrowDown className="h-5 w-5 text-muted-foreground rotate-[-90deg]" />
                        
                        <div className="text-center">
                          <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-2">
                            <Star className="h-6 w-6 text-purple-600" />
                          </div>
                          <div className="text-2xl font-bold">{calculations.midTicketSales.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">Mid Ticket</div>
                          <div className="text-xs text-purple-600">{midTicketCloseRate}%</div>
                        </div>
                      </>
                    )}
                    
                    {highTicketEnabled && (
                      <>
                        <ArrowDown className="h-5 w-5 text-muted-foreground rotate-[-90deg]" />
                        
                        <div className="text-center">
                          <div className="h-12 w-12 rounded-full bg-orange-500/20 flex items-center justify-center mx-auto mb-2">
                            <Gem className="h-6 w-6 text-orange-600" />
                          </div>
                          <div className="text-2xl font-bold">{calculations.highTicketSales.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">High Ticket</div>
                          <div className="text-xs text-orange-600">{highTicketCloseRate}%</div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-green-500/10 border-none shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-green-600">Est. Profit</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-profit">
                    ${calculations.profit.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-blue-500/10 border-none shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-blue-600">ROAS</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600" data-testid="text-roas">
                    {calculations.roas}x
                  </div>
                </CardContent>
              </Card>
            </div>

            {(lowTicketEnabled || midTicketEnabled || highTicketEnabled) && (
              <div className="grid grid-cols-3 gap-4">
                {lowTicketEnabled && (
                  <Card className="bg-emerald-500/10 border-none shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-emerald-600">Low Ticket Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold text-emerald-600" data-testid="text-lowticket-revenue">
                        ${calculations.lowTicketRevenue.toLocaleString()}
                      </div>
                      <p className="text-xs text-muted-foreground">{calculations.lowTicketSales} sales × ${lowTicketAOV}</p>
                    </CardContent>
                  </Card>
                )}
                {midTicketEnabled && (
                  <Card className="bg-purple-500/10 border-none shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-purple-600">Mid Ticket Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold text-purple-600" data-testid="text-midticket-revenue">
                        ${calculations.midTicketRevenue.toLocaleString()}
                      </div>
                      <p className="text-xs text-muted-foreground">{calculations.midTicketSales} sales × ${midTicketAOV}</p>
                    </CardContent>
                  </Card>
                )}
                {highTicketEnabled && (
                  <Card className="bg-orange-500/10 border-none shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-orange-600">High Ticket Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl font-bold text-orange-600" data-testid="text-highticket-revenue">
                        ${calculations.highTicketRevenue.toLocaleString()}
                      </div>
                      <p className="text-xs text-muted-foreground">{calculations.highTicketSales} sales × ${highTicketAOV}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Scenario Analysis</CardTitle>
                <CardDescription>Compare conservative, target, and optimistic outcomes</CardDescription>
              </CardHeader>
              <CardContent>
                {calculations.isValid ? (
                  <SafeChart data={scenarioData} />
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Enable at least one offer to see scenario analysis
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

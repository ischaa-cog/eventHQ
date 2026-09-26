import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, TrendingUp, Users, DollarSign, Target, Video, Settings2, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface Webinar {
  id: number;
  clientId: number;
  title: string;
  date: string;
  webinarType: string;
  totalRegistrants: number;
  totalAttendees: number;
  peopleAtPitch: number;
  masterclassUpsells: number;
  masterclassDownsells: number;
  masterclassUpsellPrice: string;
  masterclassDownsellPrice: string;
  challengeTicketsGa: number;
  challengeTicketsVip: number;
  challengeTicketsPlatinum: number;
  challengeTicketsDiamond: number;
  ticketPriceGa: string;
  ticketPriceVip: string;
  ticketPricePlatinum: string;
  ticketPriceDiamond: string;
  adSpend: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WebinarFormData {
  title: string;
  date: string;
  webinarType: string;
  totalRegistrants: number;
  totalAttendees: number;
  peopleAtPitch: number;
  masterclassUpsells: number;
  masterclassDownsells: number;
  masterclassUpsellPrice: string;
  masterclassDownsellPrice: string;
  challengeTicketsGa: number;
  challengeTicketsVip: number;
  challengeTicketsPlatinum: number;
  challengeTicketsDiamond: number;
  ticketPriceGa: string;
  ticketPriceVip: string;
  ticketPricePlatinum: string;
  ticketPriceDiamond: string;
  adSpend: string;
  notes: string;
}

const initialFormData: WebinarFormData = {
  title: "",
  date: new Date().toISOString().split("T")[0],
  webinarType: "live",
  totalRegistrants: 0,
  totalAttendees: 0,
  peopleAtPitch: 0,
  masterclassUpsells: 0,
  masterclassDownsells: 0,
  masterclassUpsellPrice: "47",
  masterclassDownsellPrice: "27",
  challengeTicketsGa: 0,
  challengeTicketsVip: 0,
  challengeTicketsPlatinum: 0,
  challengeTicketsDiamond: 0,
  ticketPriceGa: "97",
  ticketPriceVip: "297",
  ticketPricePlatinum: "997",
  ticketPriceDiamond: "2997",
  adSpend: "0",
  notes: "",
};

interface WebinarGoal {
  id: number;
  clientId: number;
  name: string;
  periodType: string;
  targetRevenue: string;
  targetRegistrants: number;
  targetAttendeeRate: string;
  targetClosingRate: string;
  targetRoas: string;
  targetWebinars: number;
  isActive: boolean;
}

interface GoalsFormData {
  targetRevenue: string;
  targetRegistrants: string;
  targetAttendeeRate: string;
  targetClosingRate: string;
  targetRoas: string;
  targetWebinars: string;
}

function calculateMetrics(webinar: Webinar | WebinarFormData) {
  const attendees = Number(webinar.totalAttendees) || 0;
  const registrants = Number(webinar.totalRegistrants) || 0;
  const adSpend = parseFloat(webinar.adSpend) || 0;
  
  const ticketPriceGa = parseFloat(webinar.ticketPriceGa) || 97;
  const ticketPriceVip = parseFloat(webinar.ticketPriceVip) || 297;
  const ticketPricePlatinum = parseFloat(webinar.ticketPricePlatinum) || 997;
  const ticketPriceDiamond = parseFloat(webinar.ticketPriceDiamond) || 2997;
  const upsellPrice = parseFloat(webinar.masterclassUpsellPrice) || 47;
  const downsellPrice = parseFloat(webinar.masterclassDownsellPrice) || 27;
  
  const totalTickets = 
    (Number(webinar.challengeTicketsGa) || 0) +
    (Number(webinar.challengeTicketsVip) || 0) +
    (Number(webinar.challengeTicketsPlatinum) || 0) +
    (Number(webinar.challengeTicketsDiamond) || 0);
  
  const attendeePercentage = registrants > 0 ? (attendees / registrants) * 100 : 0;
  const closingRate = attendees > 0 ? (totalTickets / attendees) * 100 : 0;
  
  const estimatedRevenue = 
    (Number(webinar.challengeTicketsGa) || 0) * ticketPriceGa +
    (Number(webinar.challengeTicketsVip) || 0) * ticketPriceVip +
    (Number(webinar.challengeTicketsPlatinum) || 0) * ticketPricePlatinum +
    (Number(webinar.challengeTicketsDiamond) || 0) * ticketPriceDiamond +
    (Number(webinar.masterclassUpsells) || 0) * upsellPrice +
    (Number(webinar.masterclassDownsells) || 0) * downsellPrice;
  
  const roas = adSpend > 0 ? estimatedRevenue / adSpend : 0;
  const costPerAttendee = attendees > 0 ? adSpend / attendees : 0;
  const costPerTicket = totalTickets > 0 ? adSpend / totalTickets : 0;
  
  return {
    totalTickets,
    attendeePercentage,
    closingRate,
    estimatedRevenue,
    roas,
    costPerAttendee,
    costPerTicket,
  };
}

export default function WebinarTrackerPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWebinar, setEditingWebinar] = useState<Webinar | null>(null);
  const [deleteWebinar, setDeleteWebinar] = useState<Webinar | null>(null);
  const [formData, setFormData] = useState<WebinarFormData>(initialFormData);
  const [isGoalsOpen, setIsGoalsOpen] = useState(false);
  const [goalsFormData, setGoalsFormData] = useState<GoalsFormData>({
    targetRevenue: "50000",
    targetRegistrants: "500",
    targetAttendeeRate: "40",
    targetClosingRate: "5",
    targetRoas: "3",
    targetWebinars: "4",
  });

  const { data: goals } = useQuery<WebinarGoal | null>({
    queryKey: [`/api/clients/${clientId}/webinar-goals`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/webinar-goals`);
      if (!res.ok) throw new Error("Failed to fetch goals");
      const data = await res.json();
      if (data) {
        setGoalsFormData({
          targetRevenue: data.targetRevenue || "50000",
          targetRegistrants: String(data.targetRegistrants || 500),
          targetAttendeeRate: data.targetAttendeeRate || "40",
          targetClosingRate: data.targetClosingRate || "5",
          targetRoas: data.targetRoas || "3",
          targetWebinars: String(data.targetWebinars || 4),
        });
      }
      return data;
    },
    enabled: !!clientId,
  });

  const saveGoalsMutation = useMutation({
    mutationFn: async (data: GoalsFormData) => {
      const res = await fetch(`/api/clients/${clientId}/webinar-goals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRevenue: data.targetRevenue,
          targetRegistrants: parseInt(data.targetRegistrants) || 0,
          targetAttendeeRate: data.targetAttendeeRate,
          targetClosingRate: data.targetClosingRate,
          targetRoas: data.targetRoas,
          targetWebinars: parseInt(data.targetWebinars) || 0,
        }),
      });
      if (!res.ok) throw new Error("Failed to save goals");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/webinar-goals`] });
      toast({ title: "Goals saved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: webinars = [], isLoading } = useQuery<Webinar[]>({
    queryKey: [`/api/clients/${clientId}/webinars`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/webinars`);
      if (!res.ok) throw new Error("Failed to fetch masterclasses");
      return res.json();
    },
    enabled: !!clientId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: WebinarFormData) => {
      const res = await fetch(`/api/clients/${clientId}/webinars`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          date: new Date(data.date).toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Failed to create masterclass");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/webinars`] });
      setIsFormOpen(false);
      setFormData(initialFormData);
      toast({ title: "Masterclass added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: WebinarFormData }) => {
      const res = await fetch(`/api/webinars/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          date: new Date(data.date).toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Failed to update masterclass");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/webinars`] });
      setIsFormOpen(false);
      setEditingWebinar(null);
      setFormData(initialFormData);
      toast({ title: "Masterclass updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/webinars/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete masterclass");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/webinars`] });
      setDeleteWebinar(null);
      toast({ title: "Masterclass deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingWebinar) {
      updateMutation.mutate({ id: editingWebinar.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (webinar: Webinar) => {
    setEditingWebinar(webinar);
    setFormData({
      title: webinar.title,
      date: new Date(webinar.date).toISOString().split("T")[0],
      webinarType: webinar.webinarType || "live",
      totalRegistrants: webinar.totalRegistrants,
      totalAttendees: webinar.totalAttendees,
      peopleAtPitch: webinar.peopleAtPitch,
      masterclassUpsells: webinar.masterclassUpsells,
      masterclassDownsells: webinar.masterclassDownsells,
      masterclassUpsellPrice: webinar.masterclassUpsellPrice || "47",
      masterclassDownsellPrice: webinar.masterclassDownsellPrice || "27",
      challengeTicketsGa: webinar.challengeTicketsGa,
      challengeTicketsVip: webinar.challengeTicketsVip,
      challengeTicketsPlatinum: webinar.challengeTicketsPlatinum,
      challengeTicketsDiamond: webinar.challengeTicketsDiamond,
      ticketPriceGa: webinar.ticketPriceGa || "97",
      ticketPriceVip: webinar.ticketPriceVip || "297",
      ticketPricePlatinum: webinar.ticketPricePlatinum || "997",
      ticketPriceDiamond: webinar.ticketPriceDiamond || "2997",
      adSpend: webinar.adSpend,
      notes: webinar.notes || "",
    });
    setIsFormOpen(true);
  };

  const handleOpenNew = () => {
    setEditingWebinar(null);
    setFormData(initialFormData);
    setIsFormOpen(true);
  };

  const previewMetrics = calculateMetrics(formData);

  const aggregatedMetrics = webinars.reduce(
    (acc, w) => {
      const metrics = calculateMetrics(w);
      return {
        totalWebinars: acc.totalWebinars + 1,
        totalRegistrants: acc.totalRegistrants + (w.totalRegistrants || 0),
        totalAttendees: acc.totalAttendees + (w.totalAttendees || 0),
        totalTickets: acc.totalTickets + metrics.totalTickets,
        totalRevenue: acc.totalRevenue + metrics.estimatedRevenue,
        totalAdSpend: acc.totalAdSpend + parseFloat(w.adSpend || "0"),
        sumAttendeeRates: acc.sumAttendeeRates + metrics.attendeePercentage,
        sumClosingRates: acc.sumClosingRates + metrics.closingRate,
      };
    },
    { totalWebinars: 0, totalRegistrants: 0, totalAttendees: 0, totalTickets: 0, totalRevenue: 0, totalAdSpend: 0, sumAttendeeRates: 0, sumClosingRates: 0 }
  );

  const avgAttendeeRate = aggregatedMetrics.totalWebinars > 0 
    ? aggregatedMetrics.sumAttendeeRates / aggregatedMetrics.totalWebinars 
    : 0;
  const avgClosingRate = aggregatedMetrics.totalWebinars > 0 
    ? aggregatedMetrics.sumClosingRates / aggregatedMetrics.totalWebinars 
    : 0;
  const overallRoas = aggregatedMetrics.totalAdSpend > 0 
    ? aggregatedMetrics.totalRevenue / aggregatedMetrics.totalAdSpend 
    : 0;

  const chartData = [...webinars]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((w) => {
      const metrics = calculateMetrics(w);
      return {
        date: format(new Date(w.date), "MMM d"),
        attendeeRate: metrics.attendeePercentage,
        closingRate: metrics.closingRate,
        roas: metrics.roas,
        revenue: metrics.estimatedRevenue,
      };
    });

  return (
    <AppLayout title="Masterclass Tracker" mode="client">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white">Masterclass Tracker</h1>
              <p className="text-gray-400 mt-1">Track and analyze your masterclass performance over time</p>
            </div>
            <Button onClick={handleOpenNew} data-testid="button-add-webinar">
              <Plus className="h-4 w-4 mr-2" />
              Add Masterclass
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">Total Masterclasses</CardTitle>
                <Video className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white" data-testid="text-total-webinars">
                  {aggregatedMetrics.totalWebinars}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white" data-testid="text-total-revenue">
                  ${aggregatedMetrics.totalRevenue.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">Total Ad Spend</CardTitle>
                <DollarSign className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white" data-testid="text-total-adspend">
                  ${aggregatedMetrics.totalAdSpend.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">Avg Attendee Rate</CardTitle>
                <Users className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white" data-testid="text-avg-attendee-rate">
                  {avgAttendeeRate.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">Avg Closing Rate</CardTitle>
                <Target className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white" data-testid="text-avg-closing-rate">
                  {avgClosingRate.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-400">Overall ROAS</CardTitle>
                <TrendingUp className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white" data-testid="text-overall-roas">
                  {overallRoas.toFixed(2)}x
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Goals Progress Panel */}
          <Card className="bg-gray-900 border-gray-800 mb-8">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-500" />
                  Goals Progress
                </CardTitle>
                <Collapsible open={isGoalsOpen} onOpenChange={setIsGoalsOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white" data-testid="button-toggle-goals">
                      <Settings2 className="h-4 w-4 mr-2" />
                      {isGoalsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      Set Goals
                    </Button>
                  </CollapsibleTrigger>
                </Collapsible>
              </div>
            </CardHeader>
            <CardContent>
              {/* Progress Bars */}
              {(() => {
                const hasGoals = goals !== null && goals !== undefined;
                const targetRevenue = hasGoals ? parseFloat(goalsFormData.targetRevenue) : 0;
                const targetWebinars = hasGoals ? parseInt(goalsFormData.targetWebinars) : 0;
                const targetAttendeeRate = hasGoals ? parseFloat(goalsFormData.targetAttendeeRate) : 0;
                const targetClosingRate = hasGoals ? parseFloat(goalsFormData.targetClosingRate) : 0;
                const targetRoas = hasGoals ? parseFloat(goalsFormData.targetRoas) : 0;

                if (!hasGoals) {
                  return (
                    <div className="text-center py-4">
                      <p className="text-gray-400 mb-4">No goals set yet. Click "Set Goals" to define your targets.</p>
                      <Button 
                        variant="outline" 
                        onClick={() => setIsGoalsOpen(true)}
                        data-testid="button-set-goals-prompt"
                      >
                        <Settings2 className="h-4 w-4 mr-2" />
                        Set Goals
                      </Button>
                    </div>
                  );
                }

                const revenueProgress = targetRevenue > 0 ? Math.min((aggregatedMetrics.totalRevenue / targetRevenue) * 100, 100) : 0;
                const webinarsProgress = targetWebinars > 0 ? Math.min((aggregatedMetrics.totalWebinars / targetWebinars) * 100, 100) : 0;
                const attendeeVariance = targetAttendeeRate > 0 ? avgAttendeeRate - targetAttendeeRate : 0;
                const closingVariance = targetClosingRate > 0 ? avgClosingRate - targetClosingRate : 0;
                const roasVariance = targetRoas > 0 ? overallRoas - targetRoas : 0;

                const getVarianceColor = (variance: number) => {
                  if (variance >= 0) return "text-green-400";
                  if (variance >= -5) return "text-yellow-400";
                  return "text-red-400";
                };

                const getVarianceIcon = (variance: number) => {
                  if (variance >= 0) return <CheckCircle2 className="h-4 w-4 text-green-400" />;
                  return null;
                };

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Revenue Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Revenue</span>
                        <span className="text-white">
                          ${aggregatedMetrics.totalRevenue.toLocaleString()} / ${targetRevenue.toLocaleString()}
                        </span>
                      </div>
                      <Progress value={revenueProgress} className="h-2" />
                      <div className="text-xs text-gray-500">{revenueProgress.toFixed(0)}% of goal</div>
                    </div>

                    {/* Webinars Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Masterclasses</span>
                        <span className="text-white">
                          {aggregatedMetrics.totalWebinars} / {targetWebinars}
                        </span>
                      </div>
                      <Progress value={webinarsProgress} className="h-2" />
                      <div className="text-xs text-gray-500">{webinarsProgress.toFixed(0)}% of goal</div>
                    </div>

                    {/* Attendee Rate */}
                    {targetAttendeeRate > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Attendee Rate</span>
                          <div className="flex items-center gap-1">
                            {getVarianceIcon(attendeeVariance)}
                            <span className={getVarianceColor(attendeeVariance)}>
                              {avgAttendeeRate.toFixed(1)}% ({attendeeVariance >= 0 ? "+" : ""}{attendeeVariance.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${attendeeVariance >= 0 ? "bg-green-500" : attendeeVariance >= -5 ? "bg-yellow-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min((avgAttendeeRate / targetAttendeeRate) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-500">Target: {targetAttendeeRate}%</div>
                      </div>
                    )}

                    {/* Closing Rate */}
                    {targetClosingRate > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Closing Rate</span>
                          <div className="flex items-center gap-1">
                            {getVarianceIcon(closingVariance)}
                            <span className={getVarianceColor(closingVariance)}>
                              {avgClosingRate.toFixed(1)}% ({closingVariance >= 0 ? "+" : ""}{closingVariance.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${closingVariance >= 0 ? "bg-green-500" : closingVariance >= -2 ? "bg-yellow-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min((avgClosingRate / targetClosingRate) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-500">Target: {targetClosingRate}%</div>
                      </div>
                    )}

                    {/* ROAS */}
                    {targetRoas > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">ROAS</span>
                          <div className="flex items-center gap-1">
                            {getVarianceIcon(roasVariance)}
                            <span className={getVarianceColor(roasVariance)}>
                              {overallRoas.toFixed(2)}x ({roasVariance >= 0 ? "+" : ""}{roasVariance.toFixed(2)}x)
                            </span>
                          </div>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${roasVariance >= 0 ? "bg-green-500" : roasVariance >= -1 ? "bg-yellow-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min((overallRoas / targetRoas) * 100, 100)}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-500">Target: {targetRoas}x</div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Collapsible Goals Settings */}
              <Collapsible open={isGoalsOpen} onOpenChange={setIsGoalsOpen}>
                <CollapsibleContent className="mt-6 pt-6 border-t border-gray-800">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div>
                      <Label htmlFor="targetRevenue" className="text-gray-400 text-sm">Target Revenue ($)</Label>
                      <Input
                        id="targetRevenue"
                        type="number"
                        value={goalsFormData.targetRevenue}
                        onChange={(e) => setGoalsFormData({ ...goalsFormData, targetRevenue: e.target.value })}
                        className="mt-1"
                        data-testid="input-target-revenue"
                      />
                    </div>
                    <div>
                      <Label htmlFor="targetWebinars" className="text-gray-400 text-sm">Target Masterclasses</Label>
                      <Input
                        id="targetWebinars"
                        type="number"
                        value={goalsFormData.targetWebinars}
                        onChange={(e) => setGoalsFormData({ ...goalsFormData, targetWebinars: e.target.value })}
                        className="mt-1"
                        data-testid="input-target-webinars"
                      />
                    </div>
                    <div>
                      <Label htmlFor="targetAttendeeRate" className="text-gray-400 text-sm">Attendee Rate (%)</Label>
                      <Input
                        id="targetAttendeeRate"
                        type="number"
                        step="0.1"
                        value={goalsFormData.targetAttendeeRate}
                        onChange={(e) => setGoalsFormData({ ...goalsFormData, targetAttendeeRate: e.target.value })}
                        className="mt-1"
                        data-testid="input-target-attendee-rate"
                      />
                    </div>
                    <div>
                      <Label htmlFor="targetClosingRate" className="text-gray-400 text-sm">Closing Rate (%)</Label>
                      <Input
                        id="targetClosingRate"
                        type="number"
                        step="0.1"
                        value={goalsFormData.targetClosingRate}
                        onChange={(e) => setGoalsFormData({ ...goalsFormData, targetClosingRate: e.target.value })}
                        className="mt-1"
                        data-testid="input-target-closing-rate"
                      />
                    </div>
                    <div>
                      <Label htmlFor="targetRoas" className="text-gray-400 text-sm">Target ROAS</Label>
                      <Input
                        id="targetRoas"
                        type="number"
                        step="0.1"
                        value={goalsFormData.targetRoas}
                        onChange={(e) => setGoalsFormData({ ...goalsFormData, targetRoas: e.target.value })}
                        className="mt-1"
                        data-testid="input-target-roas"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button 
                        onClick={() => saveGoalsMutation.mutate(goalsFormData)}
                        disabled={saveGoalsMutation.isPending}
                        className="w-full"
                        data-testid="button-save-goals"
                      >
                        Save Goals
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Masterclass History</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-gray-400 text-center py-8">Loading masterclasses...</div>
              ) : webinars.length === 0 ? (
                <div className="text-gray-400 text-center py-8">
                  No masterclasses tracked yet. Click "Add Masterclass" to get started.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-800">
                        <TableHead className="text-gray-400">Date</TableHead>
                        <TableHead className="text-gray-400">Title</TableHead>
                        <TableHead className="text-gray-400">Type</TableHead>
                        <TableHead className="text-gray-400 text-right">Registrants</TableHead>
                        <TableHead className="text-gray-400 text-right">Attendees</TableHead>
                        <TableHead className="text-gray-400 text-right">Attendee %</TableHead>
                        <TableHead className="text-gray-400 text-right">Total Tickets</TableHead>
                        <TableHead className="text-gray-400 text-right">Closing Rate</TableHead>
                        <TableHead className="text-gray-400 text-right">Revenue</TableHead>
                        <TableHead className="text-gray-400 text-right">Ad Spend</TableHead>
                        <TableHead className="text-gray-400 text-right">ROAS</TableHead>
                        <TableHead className="text-gray-400"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {webinars.map((webinar) => {
                        const metrics = calculateMetrics(webinar);
                        return (
                          <TableRow key={webinar.id} className="border-gray-800" data-testid={`row-webinar-${webinar.id}`}>
                            <TableCell className="text-white">
                              {format(new Date(webinar.date), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell className="text-white font-medium">{webinar.title}</TableCell>
                            <TableCell className="text-white">
                              <span className={`px-2 py-1 rounded text-xs ${webinar.webinarType === "evergreen" ? "bg-purple-900 text-purple-300" : "bg-blue-900 text-blue-300"}`}>
                                {webinar.webinarType === "evergreen" ? "Evergreen" : "Live"}
                              </span>
                            </TableCell>
                            <TableCell className="text-white text-right">{webinar.totalRegistrants}</TableCell>
                            <TableCell className="text-white text-right">{webinar.totalAttendees}</TableCell>
                            <TableCell className="text-white text-right">{metrics.attendeePercentage.toFixed(1)}%</TableCell>
                            <TableCell className="text-white text-right">{metrics.totalTickets}</TableCell>
                            <TableCell className="text-white text-right">{metrics.closingRate.toFixed(1)}%</TableCell>
                            <TableCell className="text-white text-right text-green-400">${metrics.estimatedRevenue.toLocaleString()}</TableCell>
                            <TableCell className="text-white text-right">${parseFloat(webinar.adSpend).toLocaleString()}</TableCell>
                            <TableCell className="text-white text-right">{metrics.roas.toFixed(2)}x</TableCell>
                            <TableCell>
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(webinar)}
                                  data-testid={`button-edit-webinar-${webinar.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteWebinar(webinar)}
                                  data-testid={`button-delete-webinar-${webinar.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingWebinar ? "Edit Masterclass" : "Add Masterclass"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2">
                <Label htmlFor="title">Masterclass Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  data-testid="input-webinar-title"
                />
              </div>
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                  data-testid="input-webinar-date"
                />
              </div>
              <div>
                <Label htmlFor="webinarType">Masterclass Type</Label>
                <Select 
                  value={formData.webinarType} 
                  onValueChange={(value) => setFormData({ ...formData, webinarType: value })}
                >
                  <SelectTrigger data-testid="select-webinar-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="evergreen">Evergreen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="adSpend">Ad Spend ($)</Label>
                <Input
                  id="adSpend"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.adSpend}
                  onChange={(e) => setFormData({ ...formData, adSpend: e.target.value })}
                  data-testid="input-ad-spend"
                />
              </div>
              <div>
                <Label htmlFor="totalRegistrants">Total Registrants</Label>
                <Input
                  id="totalRegistrants"
                  type="number"
                  min="0"
                  value={formData.totalRegistrants}
                  onChange={(e) => setFormData({ ...formData, totalRegistrants: parseInt(e.target.value) || 0 })}
                  data-testid="input-total-registrants"
                />
              </div>
              <div>
                <Label htmlFor="totalAttendees">Total Attendees</Label>
                <Input
                  id="totalAttendees"
                  type="number"
                  min="0"
                  value={formData.totalAttendees}
                  onChange={(e) => setFormData({ ...formData, totalAttendees: parseInt(e.target.value) || 0 })}
                  data-testid="input-total-attendees"
                />
              </div>
              <div>
                <Label htmlFor="peopleAtPitch">People at Pitch</Label>
                <Input
                  id="peopleAtPitch"
                  type="number"
                  min="0"
                  value={formData.peopleAtPitch}
                  onChange={(e) => setFormData({ ...formData, peopleAtPitch: parseInt(e.target.value) || 0 })}
                  data-testid="input-people-at-pitch"
                />
              </div>

              <div className="col-span-2 mt-4">
                <h4 className="font-medium mb-2">Masterclass Sales</h4>
              </div>
              <div>
                <Label htmlFor="masterclassUpsells">Upsells Qty</Label>
                <Input
                  id="masterclassUpsells"
                  type="number"
                  min="0"
                  value={formData.masterclassUpsells}
                  onChange={(e) => setFormData({ ...formData, masterclassUpsells: parseInt(e.target.value) || 0 })}
                  data-testid="input-masterclass-upsells"
                />
              </div>
              <div>
                <Label htmlFor="masterclassUpsellPrice">Upsell Price ($)</Label>
                <Input
                  id="masterclassUpsellPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.masterclassUpsellPrice}
                  onChange={(e) => setFormData({ ...formData, masterclassUpsellPrice: e.target.value })}
                  data-testid="input-masterclass-upsell-price"
                />
              </div>
              <div>
                <Label htmlFor="masterclassDownsells">Downsells Qty</Label>
                <Input
                  id="masterclassDownsells"
                  type="number"
                  min="0"
                  value={formData.masterclassDownsells}
                  onChange={(e) => setFormData({ ...formData, masterclassDownsells: parseInt(e.target.value) || 0 })}
                  data-testid="input-masterclass-downsells"
                />
              </div>
              <div>
                <Label htmlFor="masterclassDownsellPrice">Downsell Price ($)</Label>
                <Input
                  id="masterclassDownsellPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.masterclassDownsellPrice}
                  onChange={(e) => setFormData({ ...formData, masterclassDownsellPrice: e.target.value })}
                  data-testid="input-masterclass-downsell-price"
                />
              </div>
              
              <div className="col-span-2 mt-4">
                <h4 className="font-medium mb-2">Challenge Tickets Sold</h4>
              </div>
              <div>
                <Label htmlFor="challengeTicketsGa">GA Qty</Label>
                <Input
                  id="challengeTicketsGa"
                  type="number"
                  min="0"
                  value={formData.challengeTicketsGa}
                  onChange={(e) => setFormData({ ...formData, challengeTicketsGa: parseInt(e.target.value) || 0 })}
                  data-testid="input-tickets-ga"
                />
              </div>
              <div>
                <Label htmlFor="ticketPriceGa">GA Price ($)</Label>
                <Input
                  id="ticketPriceGa"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.ticketPriceGa}
                  onChange={(e) => setFormData({ ...formData, ticketPriceGa: e.target.value })}
                  data-testid="input-ticket-price-ga"
                />
              </div>
              <div>
                <Label htmlFor="challengeTicketsVip">VIP Qty</Label>
                <Input
                  id="challengeTicketsVip"
                  type="number"
                  min="0"
                  value={formData.challengeTicketsVip}
                  onChange={(e) => setFormData({ ...formData, challengeTicketsVip: parseInt(e.target.value) || 0 })}
                  data-testid="input-tickets-vip"
                />
              </div>
              <div>
                <Label htmlFor="ticketPriceVip">VIP Price ($)</Label>
                <Input
                  id="ticketPriceVip"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.ticketPriceVip}
                  onChange={(e) => setFormData({ ...formData, ticketPriceVip: e.target.value })}
                  data-testid="input-ticket-price-vip"
                />
              </div>
              <div>
                <Label htmlFor="challengeTicketsPlatinum">Platinum Qty</Label>
                <Input
                  id="challengeTicketsPlatinum"
                  type="number"
                  min="0"
                  value={formData.challengeTicketsPlatinum}
                  onChange={(e) => setFormData({ ...formData, challengeTicketsPlatinum: parseInt(e.target.value) || 0 })}
                  data-testid="input-tickets-platinum"
                />
              </div>
              <div>
                <Label htmlFor="ticketPricePlatinum">Platinum Price ($)</Label>
                <Input
                  id="ticketPricePlatinum"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.ticketPricePlatinum}
                  onChange={(e) => setFormData({ ...formData, ticketPricePlatinum: e.target.value })}
                  data-testid="input-ticket-price-platinum"
                />
              </div>
              <div>
                <Label htmlFor="challengeTicketsDiamond">Diamond Qty</Label>
                <Input
                  id="challengeTicketsDiamond"
                  type="number"
                  min="0"
                  value={formData.challengeTicketsDiamond}
                  onChange={(e) => setFormData({ ...formData, challengeTicketsDiamond: parseInt(e.target.value) || 0 })}
                  data-testid="input-tickets-diamond"
                />
              </div>
              <div>
                <Label htmlFor="ticketPriceDiamond">Diamond Price ($)</Label>
                <Input
                  id="ticketPriceDiamond"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.ticketPriceDiamond}
                  onChange={(e) => setFormData({ ...formData, ticketPriceDiamond: e.target.value })}
                  data-testid="input-ticket-price-diamond"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any additional notes about this masterclass..."
                  data-testid="input-notes"
                />
              </div>

              <div className="col-span-2 mt-4 p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-3">Auto-Calculated Metrics</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Attendee %</p>
                    <p className="font-semibold" data-testid="text-preview-attendee-rate">
                      {previewMetrics.attendeePercentage.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Closing Rate</p>
                    <p className="font-semibold" data-testid="text-preview-closing-rate">
                      {previewMetrics.closingRate.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Tickets</p>
                    <p className="font-semibold" data-testid="text-preview-total-tickets">
                      {previewMetrics.totalTickets}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Est. Revenue</p>
                    <p className="font-semibold" data-testid="text-preview-revenue">
                      ${previewMetrics.estimatedRevenue.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ROAS</p>
                    <p className="font-semibold" data-testid="text-preview-roas">
                      {previewMetrics.roas.toFixed(2)}x
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cost/Ticket</p>
                    <p className="font-semibold" data-testid="text-preview-cost-per-ticket">
                      ${previewMetrics.costPerTicket.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit-webinar"
              >
                {editingWebinar ? "Update" : "Add"} Masterclass
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteWebinar} onOpenChange={() => setDeleteWebinar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Masterclass</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteWebinar?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteWebinar && deleteMutation.mutate(deleteWebinar.id)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

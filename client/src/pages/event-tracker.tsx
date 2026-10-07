import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Pencil, Trash2, TrendingUp, Users, DollarSign, Target, Video, Calendar, Zap, Eye, BarChart3, X, Minus } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, isAfter, isBefore, parseISO, startOfDay, endOfDay } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { MasterclassGoalsCard, type MasterclassActuals } from "@/components/MasterclassGoalsCard";

interface ProductItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface EventPerformance {
  id: number;
  clientId: number;
  title: string;
  eventType: string;
  startDate: string;
  endDate: string | null;
  numberOfDays: number;
  totalRegistrants: number;
  totalAttendees: number;
  peopleAtPitch?: number;
  adSpend: string;
  offerType: string;
  salesData: ProductItem[] | null;
  upsellData: ProductItem[] | null;
  totalRevenue: string;
  profit: string;
  roas: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  dataSource?: string;
  dayStats?: DayStat[];
}

interface HistoricalWebinar {
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
}

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

interface DayStat {
  id?: number;
  eventPerformanceId: number;
  dayNumber: number;
  dayDate: string | null;
  dayTitle: string | null;
  registrantsForDay: number;
  attendeesForDay: number;
  notes: string | null;
}

interface EventFormData {
  title: string;
  eventType: string;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  totalRegistrants: number;
  totalAttendees: number;
  peopleAtPitch: number;
  adSpend: string;
  offerType: string;
  salesData: ProductItem[];
  upsellData: ProductItem[];
  notes: string;
  dayStats: DayStat[];
}

const createProduct = (name: string = "", price: number = 0): ProductItem => ({
  id: crypto.randomUUID(),
  name,
  price,
  quantity: 0,
});

const initialFormData: EventFormData = {
  title: "",
  eventType: "webinar",
  startDate: new Date().toISOString().split("T")[0],
  endDate: "",
  numberOfDays: 1,
  totalRegistrants: 0,
  totalAttendees: 0,
  peopleAtPitch: 0,
  adSpend: "0",
  offerType: "tickets",
  salesData: [],
  upsellData: [],
  notes: "",
  dayStats: [],
};

const eventTypeLabels: Record<string, string> = {
  webinar: "Masterclass",
  challenge: "Challenge",
  summit: "Summit",
};

const eventTypeColors: Record<string, string> = {
  webinar: "bg-blue-500",
  challenge: "bg-purple-500",
  summit: "bg-orange-500",
};

function normalizeProductData(data: ProductItem[] | Record<string, any> | null | undefined): ProductItem[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Object.values(data).map((item: any, index: number) => ({
    id: item.id || `legacy-${index}`,
    name: item.name || "",
    price: Number(item.price) || 0,
    quantity: Number(item.quantity) || 0,
  }));
}

function calculateMetrics(event: EventPerformance | EventFormData) {
  const registrants = Number(event.totalRegistrants) || 0;
  const attendees = Number(event.totalAttendees) || 0;
  const adSpend = parseFloat(event.adSpend) || 0;
  
  const attendeeRate = registrants > 0 ? (attendees / registrants) * 100 : null;
  
  const salesProducts = normalizeProductData(event.salesData);
  const upsellProducts = normalizeProductData(event.upsellData);
  
  let totalRevenue = 0;
  salesProducts.forEach((product) => {
    totalRevenue += (product.price || 0) * (product.quantity || 0);
  });
  upsellProducts.forEach((product) => {
    totalRevenue += (product.price || 0) * (product.quantity || 0);
  });
  
  const totalSales = salesProducts.reduce((sum, product) => sum + (product.quantity || 0), 0);
  
  const closingRate = attendees > 0 ? (totalSales / attendees) * 100 : null;
  const profit = totalRevenue - adSpend;
  const roas = adSpend > 0 ? totalRevenue / adSpend : null;
  const costPerRegistrant = registrants > 0 ? adSpend / registrants : null;
  
  return {
    attendeeRate,
    closingRate,
    totalRevenue,
    profit,
    roas,
    totalSales,
    costPerRegistrant,
  };
}

function calculateHistoricalWebinarMetrics(webinar: HistoricalWebinar) {
  const registrants = Number(webinar.totalRegistrants) || 0;
  const attendees = Number(webinar.totalAttendees) || 0;
  const adSpend = parseFloat(webinar.adSpend) || 0;
  const tickets = [
    { count: webinar.challengeTicketsGa, price: webinar.ticketPriceGa, defaultPrice: 97 },
    { count: webinar.challengeTicketsVip, price: webinar.ticketPriceVip, defaultPrice: 297 },
    { count: webinar.challengeTicketsPlatinum, price: webinar.ticketPricePlatinum, defaultPrice: 997 },
    { count: webinar.challengeTicketsDiamond, price: webinar.ticketPriceDiamond, defaultPrice: 2997 },
  ];
  const totalTickets = tickets.reduce((sum, ticket) => sum + (Number(ticket.count) || 0), 0);
  const ticketRevenue = tickets.reduce((sum, ticket) => {
    const price = parseFloat(ticket.price) || ticket.defaultPrice;
    return sum + (Number(ticket.count) || 0) * price;
  }, 0);
  const upsellRevenue = (Number(webinar.masterclassUpsells) || 0) * (parseFloat(webinar.masterclassUpsellPrice) || 47);
  const downsellRevenue = (Number(webinar.masterclassDownsells) || 0) * (parseFloat(webinar.masterclassDownsellPrice) || 27);
  const revenue = ticketRevenue + upsellRevenue + downsellRevenue;
  return {
    totalTickets,
    revenue,
    adSpend,
    attendeeRate: registrants > 0 ? (attendees / registrants) * 100 : null,
    closingRate: attendees > 0 ? (totalTickets / attendees) * 100 : 0,
    roas: adSpend > 0 ? revenue / adSpend : null,
    costPerAttendee: attendees > 0 ? adSpend / attendees : null,
    costPerTicket: totalTickets > 0 ? adSpend / totalTickets : null,
    ticketRevenue,
    upsellRevenue,
    downsellRevenue,
  };
}

export default function EventTrackerPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const canManageActuals = user?.role === "owner" || user?.role === "admin" || user?.role === "agency_admin";
  // Event and masterclass notes are internal; the server also withholds them from clients.
  const showInternalNotes = user?.role !== "agency_client";
  
  const [activeTab, setActiveTab] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventPerformance | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventPerformance | null>(null);
  const [deleteEvent, setDeleteEvent] = useState<EventPerformance | null>(null);
  const [formData, setFormData] = useState<EventFormData>(initialFormData);
  
  // Date filter state
  const [dateFilterType, setDateFilterType] = useState<"all" | "7days" | "30days" | "thisMonth" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  
  // Chart toggle state
  const [showRevenue, setShowRevenue] = useState(true);
  const [showProfit, setShowProfit] = useState(true);
  const [showRoas, setShowRoas] = useState(false);
  const [showShowUpRate, setShowShowUpRate] = useState(false);
  const [showCloseRate, setShowCloseRate] = useState(false);

  const { data: events = [], isLoading, isError } = useQuery<EventPerformance[]>({
    queryKey: [`/api/clients/${clientId}/event-performance`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/event-performance`);
      if (!res.ok) throw new Error("Failed to fetch events");
      return res.json();
    },
    enabled: !!clientId,
  });

  const {
    data: historicalWebinars = [],
    isLoading: isLoadingHistoricalWebinars,
    isError: isHistoricalWebinarsError,
  } = useQuery<HistoricalWebinar[]>({
    queryKey: [`/api/clients/${clientId}/webinars`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/webinars`);
      if (!res.ok) throw new Error("Failed to fetch historical masterclasses");
      return res.json();
    },
    enabled: !!clientId,
  });

  const { data: webinarGoal } = useQuery<WebinarGoal | null>({
    queryKey: [`/api/clients/${clientId}/webinar-goals`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/webinar-goals`);
      if (!res.ok) throw new Error("Failed to fetch masterclass goals");
      return res.json();
    },
    enabled: !!clientId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      const res = await fetch(`/api/clients/${clientId}/event-performance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          startDate: new Date(data.startDate).toISOString(),
          endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to create event");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/event-performance`] });
      setIsFormOpen(false);
      setFormData(initialFormData);
      toast({ title: "Event added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: EventFormData }) => {
      const res = await fetch(`/api/event-performance/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          startDate: new Date(data.startDate).toISOString(),
          endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to update event");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/event-performance`] });
      setIsFormOpen(false);
      setEditingEvent(null);
      setFormData(initialFormData);
      toast({ title: "Event updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/event-performance/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete event");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/event-performance`] });
      setDeleteEvent(null);
      toast({ title: "Event deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const metrics = calculateMetrics(formData);
    const submissionData = {
      ...formData,
      totalRevenue: String(metrics.totalRevenue),
      profit: String(metrics.profit),
      roas: metrics.roas === null ? "0" : String(metrics.roas.toFixed(2)),
    };
    
    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data: submissionData });
    } else {
      createMutation.mutate(submissionData);
    }
  };

  const handleEdit = async (event: EventPerformance) => {
    try {
      // Fetch full event details including dayStats
      const res = await fetch(`/api/event-performance/${event.id}`);
      if (!res.ok) throw new Error("Failed to fetch event details");
      const fullEvent = await res.json();
      
      setEditingEvent(fullEvent);
      const normalizedSales = normalizeProductData(fullEvent.salesData);
      const normalizedUpsells = normalizeProductData(fullEvent.upsellData);
      setFormData({
        title: fullEvent.title,
        eventType: fullEvent.eventType,
        startDate: new Date(fullEvent.startDate).toISOString().split("T")[0],
        endDate: fullEvent.endDate ? new Date(fullEvent.endDate).toISOString().split("T")[0] : "",
        numberOfDays: fullEvent.numberOfDays || 1,
        totalRegistrants: fullEvent.totalRegistrants,
        totalAttendees: fullEvent.totalAttendees,
        peopleAtPitch: fullEvent.peopleAtPitch ?? 0,
        adSpend: fullEvent.adSpend,
        offerType: fullEvent.offerType || "tickets",
         salesData: normalizedSales,
        upsellData: normalizedUpsells,
        notes: fullEvent.notes || "",
        dayStats: fullEvent.dayStats || [],
      });
      setIsFormOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load event for editing", variant: "destructive" });
    }
  };

  const handleOpenNew = () => {
    setEditingEvent(null);
    setFormData(initialFormData);
    setIsFormOpen(true);
  };

  const handleViewDetails = async (event: EventPerformance) => {
    try {
      const res = await fetch(`/api/event-performance/${event.id}`);
      if (!res.ok) throw new Error("Failed to fetch event details");
      const eventWithStats = await res.json();
      setSelectedEvent(eventWithStats);
      setIsDetailOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load event details", variant: "destructive" });
    }
  };

  const handleEventTypeChange = (type: string) => {
    let days = 1;
    if (type === "challenge") days = 5;
    else if (type === "summit") days = 3;
    
    const dayStats: DayStat[] = [];
    if (days > 1) {
      for (let i = 1; i <= days; i++) {
        dayStats.push({
          eventPerformanceId: 0,
          dayNumber: i,
          dayDate: null,
          dayTitle: `Day ${i}`,
          registrantsForDay: 0,
          attendeesForDay: 0,
          notes: null,
        });
      }
    }
    
    setFormData(prev => ({
      ...prev,
      eventType: type,
      numberOfDays: days,
      dayStats,
    }));
  };

  const updateDayStat = (dayNumber: number, field: keyof DayStat, value: any) => {
    setFormData(prev => ({
      ...prev,
      dayStats: prev.dayStats.map(ds => 
        ds.dayNumber === dayNumber ? { ...ds, [field]: value } : ds
      ),
    }));
  };

  const addDay = () => {
    setFormData(prev => {
      const newDayNumber = prev.numberOfDays + 1;
      return {
        ...prev,
        numberOfDays: newDayNumber,
        dayStats: [
          ...prev.dayStats,
          {
            eventPerformanceId: 0,
            dayNumber: newDayNumber,
            dayDate: null,
            dayTitle: `Day ${newDayNumber}`,
            registrantsForDay: 0,
            attendeesForDay: 0,
            notes: null,
          },
        ],
      };
    });
  };

  const removeDay = () => {
    setFormData(prev => {
      if (prev.numberOfDays <= 1) return prev;
      const newDayCount = prev.numberOfDays - 1;
      return {
        ...prev,
        numberOfDays: newDayCount,
        dayStats: prev.dayStats.slice(0, newDayCount),
      };
    });
  };

  const updateProduct = (type: 'sales' | 'upsell', productId: string, field: keyof ProductItem, value: any) => {
    const dataKey = type === 'sales' ? 'salesData' : 'upsellData';
    setFormData(prev => ({
      ...prev,
      [dataKey]: prev[dataKey].map(p => 
        p.id === productId 
          ? { ...p, [field]: field === 'price' || field === 'quantity' ? Number(value) : value }
          : p
      ),
    }));
  };

  const addProduct = (type: 'sales' | 'upsell') => {
    const dataKey = type === 'sales' ? 'salesData' : 'upsellData';
    setFormData(prev => ({
      ...prev,
      [dataKey]: [...prev[dataKey], createProduct()],
    }));
  };

  const removeProduct = (type: 'sales' | 'upsell', productId: string) => {
    const dataKey = type === 'sales' ? 'salesData' : 'upsellData';
    setFormData(prev => {
      const currentProducts = prev[dataKey];
      if (type === 'sales' && currentProducts.length <= 1) {
        return prev;
      }
      return {
        ...prev,
        [dataKey]: currentProducts.filter(p => p.id !== productId),
      };
    });
  };

  // Date filtering helper
  const getDateFilterRange = (): { start: Date | null; end: Date | null } => {
    const now = new Date();
    switch (dateFilterType) {
      case "7days":
        return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
      case "30days":
        return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
      case "thisMonth":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "custom":
        return { 
          start: customStartDate ? startOfDay(customStartDate) : null, 
          end: customEndDate ? endOfDay(customEndDate) : null 
        };
      default:
        return { start: null, end: null };
    }
  };

  const isEventInDateRange = (event: EventPerformance): boolean => {
    const { start, end } = getDateFilterRange();
    if (!start && !end) return true;
    
    const eventDate = parseISO(event.startDate);
    
    if (start && end) {
      return !isBefore(eventDate, start) && !isAfter(eventDate, end);
    }
    if (start) {
      return !isBefore(eventDate, start);
    }
    if (end) {
      return !isAfter(eventDate, end);
    }
    return true;
  };

  // Filter by event type AND date range
  const filteredEvents = events
    .filter(e => activeTab === "all" || e.eventType === activeTab)
    .filter(isEventInDateRange);

  // Calculate metrics based on filtered events
  const aggregatedMetrics = filteredEvents.reduce(
    (acc, e) => {
      const metrics = calculateMetrics(e);
      return {
        totalEvents: acc.totalEvents + 1,
        totalRegistrants: acc.totalRegistrants + (e.totalRegistrants || 0),
        totalAttendees: acc.totalAttendees + (e.totalAttendees || 0),
        totalRevenue: acc.totalRevenue + metrics.totalRevenue,
         totalAdSpend: acc.totalAdSpend + parseFloat(e.adSpend || "0"),
         totalSales: acc.totalSales + metrics.totalSales,
         sumAttendeeRates: acc.sumAttendeeRates + (metrics.attendeeRate || 0),
         sumClosingRates: acc.sumClosingRates + (metrics.closingRate || 0),
      };
    },
     { totalEvents: 0, totalRegistrants: 0, totalAttendees: 0, totalRevenue: 0, totalAdSpend: 0, totalSales: 0, sumAttendeeRates: 0, sumClosingRates: 0 }
  );

  const avgAttendeeRate = aggregatedMetrics.totalRegistrants > 0
    ? (aggregatedMetrics.totalAttendees / aggregatedMetrics.totalRegistrants) * 100 : null;
  const avgClosingRate = aggregatedMetrics.totalAttendees > 0
    ? (aggregatedMetrics.totalSales / aggregatedMetrics.totalAttendees) * 100 : null;
  const overallRoas = aggregatedMetrics.totalAdSpend > 0
    ? aggregatedMetrics.totalRevenue / aggregatedMetrics.totalAdSpend : null;
  const totalProfit = aggregatedMetrics.totalRevenue - aggregatedMetrics.totalAdSpend;

  const historicalWebinarMetrics = historicalWebinars.reduce((acc, webinar) => {
    const metrics = calculateHistoricalWebinarMetrics(webinar);
    return {
      totalWebinars: acc.totalWebinars + 1,
      totalRegistrants: acc.totalRegistrants + (Number(webinar.totalRegistrants) || 0),
      totalAttendees: acc.totalAttendees + (Number(webinar.totalAttendees) || 0),
      totalTickets: acc.totalTickets + metrics.totalTickets,
      totalRevenue: acc.totalRevenue + metrics.revenue,
      totalAdSpend: acc.totalAdSpend + metrics.adSpend,
      attendeeRateSum: acc.attendeeRateSum + (metrics.attendeeRate || 0),
      closingRateSum: acc.closingRateSum + metrics.closingRate,
    };
  }, {
    totalWebinars: 0,
    totalRegistrants: 0,
    totalAttendees: 0,
    totalTickets: 0,
    totalRevenue: 0,
    totalAdSpend: 0,
    attendeeRateSum: 0,
    closingRateSum: 0,
  });
  const historicalAvgAttendeeRate = historicalWebinarMetrics.totalWebinars
    ? historicalWebinarMetrics.attendeeRateSum / historicalWebinarMetrics.totalWebinars
    : 0;
  const historicalAvgClosingRate = historicalWebinarMetrics.totalWebinars
    ? historicalWebinarMetrics.closingRateSum / historicalWebinarMetrics.totalWebinars
    : 0;
  const historicalRoas = historicalWebinarMetrics.totalAdSpend > 0
    ? historicalWebinarMetrics.totalRevenue / historicalWebinarMetrics.totalAdSpend
    : 0;

  const masterclassEvents = events.filter(e => e.eventType === "webinar").filter(isEventInDateRange);
  const masterclassTotals = masterclassEvents.reduce((acc, e) => {
    const metrics = calculateMetrics(e);
    return {
      registrants: acc.registrants + (e.totalRegistrants || 0),
      attendees: acc.attendees + (e.totalAttendees || 0),
      sales: acc.sales + metrics.totalSales,
      revenue: acc.revenue + metrics.totalRevenue,
      adSpend: acc.adSpend + (parseFloat(e.adSpend || "0") || 0),
    };
  }, { registrants: 0, attendees: 0, sales: 0, revenue: 0, adSpend: 0 });
  const masterclassActuals: MasterclassActuals = {
    masterclasses: masterclassEvents.length,
    revenue: masterclassTotals.revenue,
    registrants: masterclassTotals.registrants,
    attendeeRate: masterclassTotals.registrants > 0 ? (masterclassTotals.attendees / masterclassTotals.registrants) * 100 : null,
    closingRate: masterclassTotals.attendees > 0 ? (masterclassTotals.sales / masterclassTotals.attendees) * 100 : null,
    roas: masterclassTotals.adSpend > 0 ? masterclassTotals.revenue / masterclassTotals.adSpend : null,
  };
  const periodLabel = {
    all: "All time",
    "7days": "Last 7 days",
    "30days": "Last 30 days",
    thisMonth: "This month",
    custom: "Custom dates",
  }[dateFilterType];

  const previewMetrics = calculateMetrics(formData);

  // Prepare chart data from filtered events (sorted by date)
  const chartData = [...filteredEvents]
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .map((event) => {
      const metrics = calculateMetrics(event);
      return {
        name: format(new Date(event.startDate), "MMM d"),
        title: event.title,
        revenue: metrics.totalRevenue,
        profit: metrics.profit,
        roas: metrics.roas,
        showUpRate: metrics.attendeeRate,
        closeRate: metrics.closingRate,
      };
    });

  return (
    <AppLayout title="Event Tracker" mode="client">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">Event Tracker</h1>
              <p className="text-gray-400 mt-1 text-sm md:text-base">Track performance for masterclasses, challenges, and summits</p>
            </div>
             {canManageActuals && <Button onClick={handleOpenNew} data-testid="button-add-event" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Event
             </Button>}
          </div>

          {/* Combined Filter Row: Event Type (left) + Date Filter (right) */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-gray-900 border border-gray-800">
                <TabsTrigger value="all" className="data-[state=active]:bg-gray-800" data-testid="tab-all">
                  All Events
                  <Badge variant="secondary" className="ml-2 bg-gray-700">{events.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="webinar" className="data-[state=active]:bg-gray-800" data-testid="tab-webinar">
                  <Video className="h-4 w-4 mr-1" />
                  Masterclasses
                  <Badge variant="secondary" className="ml-2 bg-blue-600">{events.filter(e => e.eventType === 'webinar').length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="challenge" className="data-[state=active]:bg-gray-800" data-testid="tab-challenge">
                  <Zap className="h-4 w-4 mr-1" />
                  Challenges
                  <Badge variant="secondary" className="ml-2 bg-purple-600">{events.filter(e => e.eventType === 'challenge').length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="summit" className="data-[state=active]:bg-gray-800" data-testid="tab-summit">
                  <Calendar className="h-4 w-4 mr-1" />
                  Summits
                  <Badge variant="secondary" className="ml-2 bg-orange-600">{events.filter(e => e.eventType === 'summit').length}</Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Date Filter - Right Side */}
            <div className="flex items-center gap-2">
              <Button
                variant={dateFilterType === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setDateFilterType("all")}
                data-testid="button-filter-all-time"
              >
                All Time
              </Button>
              <Button
                variant={dateFilterType === "7days" ? "default" : "outline"}
                size="sm"
                onClick={() => setDateFilterType("7days")}
                data-testid="button-filter-7days"
              >
                7 Days
              </Button>
              <Button
                variant={dateFilterType === "30days" ? "default" : "outline"}
                size="sm"
                onClick={() => setDateFilterType("30days")}
                data-testid="button-filter-30days"
              >
                30 Days
              </Button>
              <Button
                variant={dateFilterType === "thisMonth" ? "default" : "outline"}
                size="sm"
                onClick={() => setDateFilterType("thisMonth")}
                data-testid="button-filter-this-month"
              >
                This Month
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={dateFilterType === "custom" ? "default" : "outline"}
                    size="sm"
                    data-testid="button-filter-custom"
                  >
                    Custom
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4 bg-gray-900 border-gray-800" align="end">
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="space-y-2">
                        <Label className="text-gray-300 text-sm font-medium">Start Date</Label>
                        <div className="text-xs text-gray-500 mb-1">
                          {customStartDate ? format(customStartDate, "MMM d, yyyy") : "Not selected"}
                        </div>
                        <CalendarComponent
                          mode="single"
                          selected={customStartDate}
                          onSelect={(date) => {
                            setCustomStartDate(date);
                            if (date) setDateFilterType("custom");
                          }}
                          className="rounded-md border border-gray-700"
                          data-testid="calendar-start-date"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-gray-300 text-sm font-medium">End Date</Label>
                        <div className="text-xs text-gray-500 mb-1">
                          {customEndDate ? format(customEndDate, "MMM d, yyyy") : "Not selected"}
                        </div>
                        <CalendarComponent
                          mode="single"
                          selected={customEndDate}
                          onSelect={(date) => {
                            setCustomEndDate(date);
                            if (date) setDateFilterType("custom");
                          }}
                          className="rounded-md border border-gray-700"
                          data-testid="calendar-end-date"
                        />
                      </div>
                    </div>
                    {(customStartDate || customEndDate) && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full text-gray-400"
                        onClick={() => {
                          setCustomStartDate(undefined);
                          setCustomEndDate(undefined);
                          setDateFilterType("all");
                        }}
                        data-testid="button-clear-custom-dates"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Clear Custom Dates
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              {dateFilterType !== "all" && (
                <Badge variant="secondary" data-testid="badge-filter-active">
                  {filteredEvents.length}/{events.length}
                </Badge>
              )}
            </div>
          </div>

          {/* Performance Trend Chart */}
          {chartData.length > 0 && (
            <Card className="bg-gray-900 border-gray-800 mb-6">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <CardTitle className="text-lg font-medium text-white">Performance Trends</CardTitle>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="show-revenue" 
                        checked={showRevenue} 
                        onCheckedChange={(checked) => setShowRevenue(checked === true)}
                        data-testid="toggle-revenue"
                      />
                      <label htmlFor="show-revenue" className="text-sm text-green-400 cursor-pointer">Revenue</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="show-profit" 
                        checked={showProfit} 
                        onCheckedChange={(checked) => setShowProfit(checked === true)}
                        data-testid="toggle-profit"
                      />
                      <label htmlFor="show-profit" className="text-sm text-emerald-400 cursor-pointer">Profit</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="show-roas" 
                        checked={showRoas} 
                        onCheckedChange={(checked) => setShowRoas(checked === true)}
                        data-testid="toggle-roas"
                      />
                      <label htmlFor="show-roas" className="text-sm text-yellow-400 cursor-pointer">ROAS</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="show-showup" 
                        checked={showShowUpRate} 
                        onCheckedChange={(checked) => setShowShowUpRate(checked === true)}
                        data-testid="toggle-showup"
                      />
                      <label htmlFor="show-showup" className="text-sm text-purple-400 cursor-pointer">Show-Up %</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="show-close" 
                        checked={showCloseRate} 
                        onCheckedChange={(checked) => setShowCloseRate(checked === true)}
                        data-testid="toggle-close"
                      />
                      <label htmlFor="show-close" className="text-sm text-blue-400 cursor-pointer">Close %</label>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
                      <YAxis 
                        yAxisId="left" 
                        stroke="#9CA3AF" 
                        fontSize={12} 
                        tickFormatter={(value) => '$' + value.toLocaleString()}
                      />
                      <YAxis 
                        yAxisId="right" 
                        orientation="right" 
                        stroke="#9CA3AF" 
                        fontSize={12}
                        tickFormatter={(value) => typeof value === 'number' ? value.toFixed(2) : value}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                        labelStyle={{ color: '#F3F4F6' }}
                        formatter={(value: number, name: string) => {
                          if (name === 'Revenue ($)' || name === 'Profit ($)') {
                            return ['$' + value.toLocaleString(), name];
                          }
                          if (name === 'ROAS (x)') {
                            return [value.toFixed(2) + 'x', name];
                          }
                          if (name === 'Show-Up Rate (%)' || name === 'Close Rate (%)') {
                            return [value.toFixed(1) + '%', name];
                          }
                          return [value, name];
                        }}
                      />
                      {showRevenue && (
                        <Line 
                          yAxisId="left"
                          type="monotone" 
                          dataKey="revenue" 
                          stroke="#22C55E" 
                          strokeWidth={2}
                          dot={{ fill: '#22C55E', strokeWidth: 2 }}
                          name="Revenue ($)"
                        />
                      )}
                      {showProfit && (
                        <Line 
                          yAxisId="left"
                          type="monotone" 
                          dataKey="profit" 
                          stroke="#10B981" 
                          strokeWidth={2}
                          dot={{ fill: '#10B981', strokeWidth: 2 }}
                          name="Profit ($)"
                        />
                      )}
                      {showRoas && (
                        <Line 
                          yAxisId="right"
                          type="monotone" 
                          dataKey="roas" 
                          stroke="#EAB308" 
                          strokeWidth={2}
                          dot={{ fill: '#EAB308', strokeWidth: 2 }}
                          name="ROAS (x)"
                        />
                      )}
                      {showShowUpRate && (
                        <Line 
                          yAxisId="right"
                          type="monotone" 
                          dataKey="showUpRate" 
                          stroke="#A855F7" 
                          strokeWidth={2}
                          dot={{ fill: '#A855F7', strokeWidth: 2 }}
                          name="Show-Up Rate (%)"
                        />
                      )}
                      {showCloseRate && (
                        <Line 
                          yAxisId="right"
                          type="monotone" 
                          dataKey="closeRate" 
                          stroke="#3B82F6" 
                          strokeWidth={2}
                          dot={{ fill: '#3B82F6', strokeWidth: 2 }}
                          name="Close Rate (%)"
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Compact Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Events</p>
                    <p className="text-lg font-bold text-white" data-testid="text-total-events">{aggregatedMetrics.totalEvents}</p>
                  </div>
                  <Calendar className="h-4 w-4 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Revenue</p>
                    <p className="text-lg font-bold text-white" data-testid="text-total-revenue">${aggregatedMetrics.totalRevenue.toLocaleString()}</p>
                  </div>
                  <DollarSign className="h-4 w-4 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Profit</p>
                    <p className={`text-lg font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`} data-testid="text-total-profit">${totalProfit.toLocaleString()}</p>
                  </div>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Show-Up</p>
                    <p className="text-lg font-bold text-white" data-testid="text-avg-attendee-rate">{avgAttendeeRate === null ? "N/A" : `${avgAttendeeRate.toFixed(1)}%`}</p>
                  </div>
                  <Users className="h-4 w-4 text-purple-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Close Rate</p>
                    <p className="text-lg font-bold text-white" data-testid="text-avg-closing-rate">{avgClosingRate === null ? "N/A" : `${avgClosingRate.toFixed(1)}%`}</p>
                  </div>
                  <Target className="h-4 w-4 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">ROAS</p>
                    <p className="text-lg font-bold text-white" data-testid="text-overall-roas">{overallRoas === null ? "N/A" : `${overallRoas.toFixed(2)}x`}</p>
                  </div>
                  <BarChart3 className="h-4 w-4 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="p-0">
               {isLoading ? (
                <div className="p-8 text-center text-gray-400">Loading events...</div>
               ) : isError ? (
                 <div className="p-8 text-center text-red-400">Unable to load event performance. Please try again.</div>
              ) : filteredEvents.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  No events found. Click "Add Event" to create your first event.
                </div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-800 hover:bg-gray-900">
                      <TableHead className="text-gray-400">Event</TableHead>
                      <TableHead className="text-gray-400">Type</TableHead>
                      <TableHead className="text-gray-400">Date</TableHead>
                      <TableHead className="text-gray-400 text-right">Registrants</TableHead>
                      <TableHead className="text-gray-400 text-right">Show-Up %</TableHead>
                      <TableHead className="text-gray-400 text-right">Revenue</TableHead>
                      <TableHead className="text-gray-400 text-right">P/L</TableHead>
                      <TableHead className="text-gray-400 text-right">ROAS</TableHead>
                      <TableHead className="text-gray-400 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map((event) => {
                      const metrics = calculateMetrics(event);
                      const profit = metrics.totalRevenue - parseFloat(event.adSpend || "0");
                      return (
                        <TableRow key={event.id} className="border-gray-800 hover:bg-gray-800/50" data-testid={`row-event-${event.id}`}>
                           <TableCell className="text-white font-medium">
                             <div>{event.title}</div>
                             <Badge variant="outline" className="mt-1 text-xs text-gray-400 border-gray-700">{(event.dataSource || "manual").toLowerCase() === "manual" ? "Manual" : event.dataSource}</Badge>
                           </TableCell>
                          <TableCell>
                            <Badge className={`${eventTypeColors[event.eventType]} text-white`}>
                              {eventTypeLabels[event.eventType] || event.eventType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-300">
                            {format(new Date(event.startDate), "MMM d, yyyy")}
                            {event.numberOfDays > 1 && ` (${event.numberOfDays} days)`}
                          </TableCell>
                          <TableCell className="text-right text-gray-300">{event.totalRegistrants}</TableCell>
                          <TableCell className="text-right text-gray-300">{metrics.attendeeRate === null ? "N/A" : `${metrics.attendeeRate.toFixed(1)}%`}</TableCell>
                          <TableCell className="text-right text-green-400">${metrics.totalRevenue.toLocaleString()}</TableCell>
                          <TableCell className={`text-right ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ${profit.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-yellow-400">{metrics.roas === null ? "N/A" : `${metrics.roas.toFixed(2)}x`}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                                <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleViewDetails(event)}
                                data-testid={`button-view-${event.id}`}
                              >
                                <Eye className="h-4 w-4 text-gray-400 hover:text-white" />
                                </Button>
                               {canManageActuals && <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleEdit(event)}
                                data-testid={`button-edit-${event.id}`}
                              >
                                <Pencil className="h-4 w-4 text-gray-400 hover:text-white" />
                               </Button>}
                              {canManageActuals && <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => setDeleteEvent(event)}
                                data-testid={`button-delete-${event.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                              </Button>}
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

          {/* Masterclass goals and legacy history only apply to the Masterclasses tab. */}
          {activeTab === "webinar" && (
            <div className="mt-8">
              <MasterclassGoalsCard
                clientId={clientId}
                goal={webinarGoal}
                actuals={masterclassActuals}
                periodLabel={periodLabel}
                canEdit={canManageActuals}
              />

              {/* Legacy masterclass records remain available here as read-only history. */}
              <section className="mb-8 space-y-4" aria-labelledby="historical-masterclasses-heading">
                <div>
                  <h2 id="historical-masterclasses-heading" className="text-xl font-semibold text-white">Historical Masterclass Reporting</h2>
                  <p className="mt-1 text-sm text-gray-400">
                    Legacy masterclass records and sales breakdowns from the old Masterclass Tracker. These are shown separately from Event Tracker actuals.
                  </p>
                </div>
                {isHistoricalWebinarsError ? (
                  <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="p-6 text-center text-red-400">
                      Unable to load historical masterclasses. Please try again.
                    </CardContent>
                  </Card>
                ) : isLoadingHistoricalWebinars ? (
                  <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="p-6 text-center text-gray-400">Loading historical masterclasses...</CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                      {[
                        { label: "Masterclasses", value: historicalWebinarMetrics.totalWebinars.toLocaleString() },
                        { label: "Registrants", value: historicalWebinarMetrics.totalRegistrants.toLocaleString() },
                        { label: "Attendees", value: historicalWebinarMetrics.totalAttendees.toLocaleString() },
                        { label: "Tickets Sold", value: historicalWebinarMetrics.totalTickets.toLocaleString() },
                        { label: "Legacy Revenue", value: `$${historicalWebinarMetrics.totalRevenue.toLocaleString()}` },
                        { label: "Ad Spend", value: `$${historicalWebinarMetrics.totalAdSpend.toLocaleString()}` },
                        { label: "Avg Attendee Rate", value: `${historicalAvgAttendeeRate.toFixed(1)}%` },
                        { label: "Avg Closing Rate", value: `${historicalAvgClosingRate.toFixed(1)}%` },
                        { label: "Overall ROAS", value: `${historicalRoas.toFixed(2)}x` },
                      ].map((metric) => (
                        <Card key={metric.label} className="bg-gray-900 border-gray-800">
                          <CardContent className="p-3">
                            <p className="text-xs text-gray-400">{metric.label}</p>
                            <p className="mt-1 text-lg font-semibold text-white">{metric.value}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <Card className="bg-gray-900 border-gray-800">
                      <CardHeader>
                        <CardTitle className="text-white">Historical Masterclass Records ({historicalWebinars.length})</CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        {historicalWebinars.length === 0 ? (
                          <div className="p-6 text-center text-gray-400">No historical masterclass records found.</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-gray-800">
                                  <TableHead className="text-gray-400">Date / Masterclass</TableHead>
                                  <TableHead className="text-gray-400">Format</TableHead>
                                  <TableHead className="text-gray-400 text-right">Registrants</TableHead>
                                  <TableHead className="text-gray-400 text-right">Attendees</TableHead>
                                  <TableHead className="text-gray-400 text-right">At Pitch</TableHead>
                                  <TableHead className="text-gray-400 text-right">Attendee %</TableHead>
                                  <TableHead className="text-gray-400 text-right">Ticket Tiers (quantity)</TableHead>
                                  <TableHead className="text-gray-400 text-right">Ticket / Upsell / Downsell Prices</TableHead>
                                  <TableHead className="text-gray-400 text-right">Tickets</TableHead>
                                  <TableHead className="text-gray-400 text-right">Upsells / Downsells</TableHead>
                                  <TableHead className="text-gray-400 text-right">Revenue (tickets / upsells / downsells)</TableHead>
                                  <TableHead className="text-gray-400 text-right">Ad Spend</TableHead>
                                  <TableHead className="text-gray-400 text-right">Closing Rate</TableHead>
                                  <TableHead className="text-gray-400 text-right">ROAS</TableHead>
                                  <TableHead className="text-gray-400 text-right">Cost / Attendee</TableHead>
                                  <TableHead className="text-gray-400 text-right">Cost / Ticket</TableHead>
                                  {showInternalNotes && <TableHead className="text-gray-400">Notes</TableHead>}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {[...historicalWebinars]
                                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                  .map((webinar) => {
                                    const metrics = calculateHistoricalWebinarMetrics(webinar);
                                    const currency = (value: number) => `$${value.toLocaleString()}`;
                                    return (
                                      <TableRow key={webinar.id} className="border-gray-800 align-top">
                                        <TableCell className="min-w-[190px] text-white">
                                          <div>{webinar.title || "Untitled masterclass"}</div>
                                          <div className="mt-1 text-xs text-gray-400">
                                            {format(new Date(webinar.date), "MMM d, yyyy")}
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-gray-300">{webinar.webinarType || "—"}</TableCell>
                                        <TableCell className="text-right text-gray-300">{Number(webinar.totalRegistrants) || 0}</TableCell>
                                        <TableCell className="text-right text-gray-300">{Number(webinar.totalAttendees) || 0}</TableCell>
                                        <TableCell className="text-right text-gray-300">{Number(webinar.peopleAtPitch) || 0}</TableCell>
                                        <TableCell className="text-right text-gray-300">{metrics.attendeeRate === null ? "N/A" : `${metrics.attendeeRate.toFixed(1)}%`}</TableCell>
                                        <TableCell className="text-right text-gray-300">
                                          GA {Number(webinar.challengeTicketsGa) || 0} / VIP {Number(webinar.challengeTicketsVip) || 0} / Platinum {Number(webinar.challengeTicketsPlatinum) || 0} / Diamond {Number(webinar.challengeTicketsDiamond) || 0}
                                        </TableCell>
                                        <TableCell className="min-w-[190px] text-right text-gray-300">
                                          {currency(parseFloat(webinar.ticketPriceGa) || 97)} / {currency(parseFloat(webinar.ticketPriceVip) || 297)} / {currency(parseFloat(webinar.ticketPricePlatinum) || 997)} / {currency(parseFloat(webinar.ticketPriceDiamond) || 2997)}
                                          <div className="text-xs text-gray-500">
                                            Upsell {currency(parseFloat(webinar.masterclassUpsellPrice) || 47)} / Downsell {currency(parseFloat(webinar.masterclassDownsellPrice) || 27)}
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-right text-gray-300">{metrics.totalTickets}</TableCell>
                                        <TableCell className="text-right text-gray-300">
                                          {Number(webinar.masterclassUpsells) || 0} / {Number(webinar.masterclassDownsells) || 0}
                                        </TableCell>
                                        <TableCell className="min-w-[190px] text-right text-green-400">
                                          {currency(metrics.revenue)}
                                          <div className="text-xs text-gray-500">
                                            {currency(metrics.ticketRevenue)} / {currency(metrics.upsellRevenue)} / {currency(metrics.downsellRevenue)}
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-right text-gray-300">{currency(metrics.adSpend)}</TableCell>
                                        <TableCell className="text-right text-gray-300">{metrics.closingRate.toFixed(1)}%</TableCell>
                                        <TableCell className="text-right text-yellow-400">{metrics.roas === null ? "N/A" : `${metrics.roas.toFixed(2)}x`}</TableCell>
                                        <TableCell className="text-right text-gray-300">{metrics.costPerAttendee === null ? "N/A" : currency(metrics.costPerAttendee)}</TableCell>
                                        <TableCell className="text-right text-gray-300">{metrics.costPerTicket === null ? "N/A" : currency(metrics.costPerTicket)}</TableCell>
                                        {showInternalNotes && <TableCell className="min-w-[180px] whitespace-pre-wrap text-gray-400">{webinar.notes || "—"}</TableCell>}
                                      </TableRow>
                                    );
                                  })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
              </section>
            </div>
          )}
        </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingEvent ? "Edit Event" : "Add New Event"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title" className="text-gray-300">Event Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white"
                  required
                  data-testid="input-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eventType" className="text-gray-300">Event Type</Label>
                <Select value={formData.eventType} onValueChange={handleEventTypeChange}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white" data-testid="select-event-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="webinar">Masterclass</SelectItem>
                    <SelectItem value="challenge">Challenge</SelectItem>
                    <SelectItem value="summit">Summit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-gray-300">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white"
                  required
                  data-testid="input-start-date"
                />
              </div>
              {formData.numberOfDays > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="endDate" className="text-gray-300">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                    className="bg-gray-800 border-gray-700 text-white"
                    data-testid="input-end-date"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="adSpend" className="text-gray-300">Ad Spend ($)</Label>
                <Input
                  id="adSpend"
                  type="number"
                  step="0.01"
                  value={formData.adSpend}
                  onChange={(e) => setFormData(prev => ({ ...prev, adSpend: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white"
                  data-testid="input-ad-spend"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="totalRegistrants" className="text-gray-300">Total Registrants</Label>
                <Input
                  id="totalRegistrants"
                  type="number"
                  value={formData.totalRegistrants}
                  onChange={(e) => setFormData(prev => ({ ...prev, totalRegistrants: parseInt(e.target.value) || 0 }))}
                  className="bg-gray-800 border-gray-700 text-white"
                  data-testid="input-registrants"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalAttendees" className="text-gray-300">Total Attendees (Show-ups)</Label>
                <Input
                  id="totalAttendees"
                  type="number"
                  value={formData.totalAttendees}
                  onChange={(e) => setFormData(prev => ({ ...prev, totalAttendees: parseInt(e.target.value) || 0 }))}
                  className="bg-gray-800 border-gray-700 text-white"
                  data-testid="input-attendees"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="peopleAtPitch" className="text-gray-300">People at Pitch</Label>
                <Input
                  id="peopleAtPitch"
                  type="number"
                  min="0"
                  value={formData.peopleAtPitch}
                  onChange={(e) => setFormData(prev => ({ ...prev, peopleAtPitch: parseInt(e.target.value) || 0 }))}
                  className="bg-gray-800 border-gray-700 text-white"
                  data-testid="input-people-at-pitch"
                />
                {formData.peopleAtPitch > formData.totalAttendees && (
                  <p className="text-xs text-red-400">Can't be more than attendees.</p>
                )}
              </div>
            </div>

            {(formData.eventType === 'challenge' || formData.eventType === 'summit') && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-gray-300 text-lg">Daily Attendance ({formData.numberOfDays} days)</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={removeDay}
                      disabled={formData.numberOfDays <= 1}
                      className="h-8 w-8 border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                      data-testid="button-remove-day"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-gray-400 text-sm min-w-[60px] text-center">
                      {formData.numberOfDays} {formData.numberOfDays === 1 ? 'day' : 'days'}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={addDay}
                      className="h-8 w-8 border-gray-600 text-gray-300 hover:bg-gray-800"
                      data-testid="button-add-day"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {formData.dayStats.map((ds) => (
                    <div key={ds.dayNumber} className="grid grid-cols-4 gap-3 p-3 bg-gray-800 rounded-lg">
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Day {ds.dayNumber} Title</Label>
                        <Input
                          value={ds.dayTitle || ""}
                          onChange={(e) => updateDayStat(ds.dayNumber, 'dayTitle', e.target.value)}
                          className="bg-gray-700 border-gray-600 text-white text-sm"
                          placeholder={`Day ${ds.dayNumber}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Registrants</Label>
                        <Input
                          type="number"
                          value={ds.registrantsForDay}
                          onChange={(e) => updateDayStat(ds.dayNumber, 'registrantsForDay', parseInt(e.target.value) || 0)}
                          className="bg-gray-700 border-gray-600 text-white text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Attendees</Label>
                        <Input
                          type="number"
                          value={ds.attendeesForDay}
                          onChange={(e) => updateDayStat(ds.dayNumber, 'attendeesForDay', parseInt(e.target.value) || 0)}
                          className="bg-gray-700 border-gray-600 text-white text-sm"
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="text-sm text-gray-400">
                          {ds.registrantsForDay > 0 
                            ? `${((ds.attendeesForDay / ds.registrantsForDay) * 100).toFixed(1)}% show-up`
                            : "0% show-up"
                          }
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Primary Sales Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-gray-300 text-lg">Primary Sales</Label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => addProduct('sales')}
                  className="border-gray-600 text-gray-300 hover:bg-gray-800"
                  data-testid="button-add-product"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Product
                </Button>
              </div>
              <div className="space-y-3">
                {formData.salesData.map((product, index) => (
                  <div key={product.id} className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg">
                    <div className="flex-1 grid grid-cols-4 gap-3">
                      <div className="col-span-2">
                        <Label className="text-gray-400 text-xs">Product Name</Label>
                        <Input
                          value={product.name}
                          onChange={(e) => updateProduct('sales', product.id, 'name', e.target.value)}
                          className="bg-gray-700 border-gray-600 text-white text-sm"
                          placeholder="e.g., Course, VIP Ticket"
                          data-testid={`input-product-name-${index}`}
                        />
                      </div>
                      <div>
                        <Label className="text-gray-400 text-xs">Price ($)</Label>
                        <Input
                          type="number"
                          value={product.price}
                          onChange={(e) => updateProduct('sales', product.id, 'price', e.target.value)}
                          className="bg-gray-700 border-gray-600 text-white text-sm"
                          data-testid={`input-product-price-${index}`}
                        />
                      </div>
                      <div>
                        <Label className="text-gray-400 text-xs">Qty Sold</Label>
                        <Input
                          type="number"
                          value={product.quantity}
                          onChange={(e) => updateProduct('sales', product.id, 'quantity', e.target.value)}
                          className="bg-gray-700 border-gray-600 text-white text-sm"
                          data-testid={`input-product-qty-${index}`}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col items-end pt-5">
                      <div className="text-sm text-green-400 font-medium mb-2">
                        ${(product.price * product.quantity).toLocaleString()}
                      </div>
                      {formData.salesData.length > 1 && (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeProduct('sales', product.id)}
                          className="h-8 w-8 text-gray-400 hover:text-red-400 hover:bg-gray-700"
                          data-testid={`button-remove-product-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end text-sm text-gray-400">
                Primary Sales Total: <span className="text-green-400 font-medium ml-2">
                  ${formData.salesData.reduce((sum, p) => sum + (p.price * p.quantity), 0).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Upsells Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-gray-300 text-lg">Upsells / Additional Products</Label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => addProduct('upsell')}
                  className="border-gray-600 text-gray-300 hover:bg-gray-800"
                  data-testid="button-add-upsell"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Upsell
                </Button>
              </div>
              {formData.upsellData.length === 0 ? (
                <div className="p-4 bg-gray-800 rounded-lg text-center text-gray-500 text-sm">
                  No upsells added yet. Click "Add Upsell" to track additional products.
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.upsellData.map((product, index) => (
                    <div key={product.id} className="flex items-start gap-3 p-3 bg-gray-800 rounded-lg">
                      <div className="flex-1 grid grid-cols-4 gap-3">
                        <div className="col-span-2">
                          <Label className="text-gray-400 text-xs">Product Name</Label>
                          <Input
                            value={product.name}
                            onChange={(e) => updateProduct('upsell', product.id, 'name', e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white text-sm"
                            placeholder="e.g., Premium Upgrade, Bundle"
                            data-testid={`input-upsell-name-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-gray-400 text-xs">Price ($)</Label>
                          <Input
                            type="number"
                            value={product.price}
                            onChange={(e) => updateProduct('upsell', product.id, 'price', e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white text-sm"
                            data-testid={`input-upsell-price-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-gray-400 text-xs">Qty Sold</Label>
                          <Input
                            type="number"
                            value={product.quantity}
                            onChange={(e) => updateProduct('upsell', product.id, 'quantity', e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white text-sm"
                            data-testid={`input-upsell-qty-${index}`}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col items-end pt-5">
                        <div className="text-sm text-purple-400 font-medium mb-2">
                          ${(product.price * product.quantity).toLocaleString()}
                        </div>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeProduct('upsell', product.id)}
                          className="h-8 w-8 text-gray-400 hover:text-red-400 hover:bg-gray-700"
                          data-testid={`button-remove-upsell-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {formData.upsellData.length > 0 && (
                <div className="flex justify-end text-sm text-gray-400">
                  Upsells Total: <span className="text-purple-400 font-medium ml-2">
                    ${formData.upsellData.reduce((sum, p) => sum + (p.price * p.quantity), 0).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="text-gray-300">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="bg-gray-800 border-gray-700 text-white"
                rows={3}
                data-testid="input-notes"
              />
            </div>

            <Card className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm">Preview Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-gray-400 text-xs">Show-Up Rate</div>
                    <div className="text-white text-lg font-bold">{previewMetrics.attendeeRate === null ? "N/A" : `${previewMetrics.attendeeRate.toFixed(1)}%`}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Revenue</div>
                    <div className="text-green-400 text-lg font-bold">${previewMetrics.totalRevenue.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Profit</div>
                    <div className={`text-lg font-bold ${previewMetrics.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${previewMetrics.profit.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">ROAS</div>
                    <div className="text-yellow-400 text-lg font-bold">{previewMetrics.roas === null ? "N/A" : `${previewMetrics.roas.toFixed(2)}x`}</div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-4">Show-up rate = attendees ÷ registrants. ROAS = event revenue ÷ ad spend. N/A means the denominator is zero.</p>
              </CardContent>
            </Card>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-event">
                {editingEvent ? "Update Event" : "Add Event"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {selectedEvent?.title}
              {selectedEvent && (
                <Badge className={`${eventTypeColors[selectedEvent.eventType]} text-white ml-2`}>
                  {eventTypeLabels[selectedEvent.eventType]}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-6">
              <div className="grid grid-cols-5 gap-4">
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="p-4 text-center">
                    <div className="text-gray-400 text-xs mb-1">Registrants</div>
                    <div className="text-white text-xl font-bold">{selectedEvent.totalRegistrants}</div>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="p-4 text-center">
                    <div className="text-gray-400 text-xs mb-1">Attendees</div>
                    <div className="text-white text-xl font-bold">{selectedEvent.totalAttendees}</div>
                    <div className="text-gray-500 text-xs">
                      {selectedEvent.totalRegistrants > 0 
                        ? `${((selectedEvent.totalAttendees / selectedEvent.totalRegistrants) * 100).toFixed(1)}%`
                        : "0%"
                      }
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700" data-testid="card-people-at-pitch">
                  <CardContent className="p-4 text-center">
                    <div className="text-gray-400 text-xs mb-1">At Pitch</div>
                    <div className="text-white text-xl font-bold">{selectedEvent.peopleAtPitch ?? 0}</div>
                    <div className="text-gray-500 text-xs">
                      {selectedEvent.totalAttendees > 0
                        ? `${(((selectedEvent.peopleAtPitch ?? 0) / selectedEvent.totalAttendees) * 100).toFixed(1)}% of attendees`
                        : "0%"
                      }
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="p-4 text-center">
                    <div className="text-gray-400 text-xs mb-1">Revenue</div>
                    <div className="text-green-400 text-xl font-bold">${parseFloat(selectedEvent.totalRevenue || "0").toLocaleString()}</div>
                  </CardContent>
                </Card>
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="p-4 text-center">
                    <div className="text-gray-400 text-xs mb-1">ROAS</div>
                    <div className="text-yellow-400 text-xl font-bold">{parseFloat(selectedEvent.roas || "0").toFixed(2)}x</div>
                  </CardContent>
                </Card>
              </div>

              {selectedEvent.dayStats && selectedEvent.dayStats.length > 0 && (
                <div>
                  <h3 className="text-white text-lg font-semibold mb-4">Daily Attendance</h3>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={selectedEvent.dayStats.map(ds => ({
                        name: ds.dayTitle || `Day ${ds.dayNumber}`,
                        registrants: ds.registrantsForDay,
                        attendees: ds.attendeesForDay,
                        rate: ds.registrantsForDay > 0 ? ((ds.attendeesForDay / ds.registrantsForDay) * 100).toFixed(1) : 0,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="name" stroke="#9CA3AF" />
                        <YAxis stroke="#9CA3AF" />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                          labelStyle={{ color: '#fff' }}
                        />
                        <Legend />
                        <Bar dataKey="registrants" fill="#3B82F6" name="Registrants" />
                        <Bar dataKey="attendees" fill="#10B981" name="Attendees" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 grid grid-cols-5 gap-2">
                    {selectedEvent.dayStats.map(ds => (
                      <div key={ds.dayNumber} className="p-2 bg-gray-800 rounded text-center">
                        <div className="text-gray-400 text-xs">{ds.dayTitle || `Day ${ds.dayNumber}`}</div>
                        <div className="text-white text-sm font-medium">
                          {ds.registrantsForDay > 0 
                            ? `${((ds.attendeesForDay / ds.registrantsForDay) * 100).toFixed(0)}%`
                            : "0%"
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showInternalNotes && selectedEvent.notes && (
                <div>
                  <h3 className="text-white text-lg font-semibold mb-2">Notes</h3>
                  <p className="text-gray-400">{selectedEvent.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteEvent} onOpenChange={() => setDeleteEvent(null)}>
        <AlertDialogContent className="bg-gray-900 border-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Event?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to delete "{deleteEvent?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 text-white border-gray-700 hover:bg-gray-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteEvent && deleteMutation.mutate(deleteEvent.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

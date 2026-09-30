import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, List, Plus, Clock, Link as LinkIcon, Pencil, Trash2, ExternalLink, ChevronLeft, ChevronRight, Copy, Users, RefreshCw, Settings } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, addWeeks, subWeeks, startOfDay, endOfDay, isAfter, isBefore, startOfWeek, endOfWeek, eachDayOfInterval as eachWeekDay } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { X, Filter } from "lucide-react";
import type { CalendarEntry } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
];

export default function MarketingCalendarPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [view, setView] = useState<"list" | "calendar" | "week" | "google">("list");
  const [viewChosen, setViewChosen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  
  // Date filter state
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(undefined);
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(undefined);
  
  const [formData, setFormData] = useState({
    title: "",
    eventDate: "",
    eventTime: "",
    endTime: "",
    timezone: "America/New_York",
    eventLink: "",
    description: "",
    attendeeEmails: "",
  });
  const [calendarId, setCalendarId] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [localSyncError, setLocalSyncError] = useState<string | null>(null);

  const canEdit = user?.role === "owner" || user?.role === "agency_admin";
  const canConfigure = canEdit;

  const { data: entries = [], isLoading } = useQuery<CalendarEntry[]>({
    queryKey: [`/api/clients/${clientId}/calendar`],
    enabled: !!clientId,
  });
  const connectionQuery = useQuery({
    queryKey: [`/api/clients/${clientId}/calendar/connection`],
    enabled: !!clientId,
  });
  const rawConnection = connectionQuery.data;
  const connection = rawConnection as { calendarId: string | null; lastSuccessfulSync: string | null; error: string | null; connected: boolean } | undefined;
  useEffect(() => { if (connection) setCalendarId(connection.calendarId || ""); }, [connection?.calendarId]);
  const googleCalendarId = connection?.calendarId || null;
  useEffect(() => {
    if (googleCalendarId && !viewChosen) setView("google");
    if (!googleCalendarId && view === "google") setView("list");
  }, [googleCalendarId]);
  const googleEmbedUrl = googleCalendarId
    ? `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(googleCalendarId)}&ctz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}&mode=MONTH&showPrint=0&showTitle=0`
    : null;
  const connectionMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/clients/${clientId}/calendar/connection`, { calendarId: calendarId || null }),
    onSuccess: async (res) => {
      const saved = await res.json();
      setConfigOpen(false);
      if (saved?.calendarId) { setView("google"); setViewChosen(true); }
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/calendar/connection`] });
    },
  });
  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/clients/${clientId}/calendar/sync`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/calendar/connection`] }); queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/calendar`] }); },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const dateTime = new Date(`${data.eventDate}T${data.eventTime || "00:00"}`);
      const endDateTime = data.endTime ? new Date(`${data.eventDate}T${data.endTime}`) : null;
      const emails = data.attendeeEmails
        .split(/[,;\s]+/)
        .map(e => e.trim())
        .filter(e => e.length > 0 && e.includes("@"));
      const res = await apiRequest("POST", `/api/clients/${clientId}/calendar`, {
        title: data.title,
        eventDate: dateTime.toISOString(),
        endDate: endDateTime ? endDateTime.toISOString() : null,
        timezone: data.timezone,
        eventLink: data.eventLink || null,
        description: data.description || null,
        attendeeEmails: emails,
      });
      return res.json();
    },
    onSuccess: (entry: { syncError?: string }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/calendar`] });
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/calendar/connection`] });
      setLocalSyncError(entry?.syncError || null);
      setIsAddDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      const dateTime = new Date(`${data.eventDate}T${data.eventTime || "00:00"}`);
      const endDateTime = data.endTime ? new Date(`${data.eventDate}T${data.endTime}`) : null;
      const emails = data.attendeeEmails
        .split(/[,;\s]+/)
        .map(e => e.trim())
        .filter(e => e.length > 0 && e.includes("@"));
      const res = await apiRequest("PATCH", `/api/calendar/${id}`, {
        title: data.title,
        eventDate: dateTime.toISOString(),
        endDate: endDateTime ? endDateTime.toISOString() : null,
        timezone: data.timezone,
        eventLink: data.eventLink || null,
        description: data.description || null,
        attendeeEmails: emails,
      });
      return res.json();
    },
    onSuccess: (entry: { syncError?: string }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/calendar`] });
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/calendar/connection`] });
      setLocalSyncError(entry?.syncError || null);
      setEditingEntry(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/calendar/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/calendar`] });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      eventDate: "",
      eventTime: "",
      endTime: "",
      timezone: "America/New_York",
      eventLink: "",
      description: "",
      attendeeEmails: "",
    });
  };

  const openEditDialog = (entry: CalendarEntry) => {
    const date = new Date(entry.eventDate);
    const endDate = entry.endDate ? new Date(entry.endDate) : null;
    setFormData({
      title: entry.title,
      eventDate: format(date, "yyyy-MM-dd"),
      eventTime: format(date, "HH:mm"),
      endTime: endDate ? format(endDate, "HH:mm") : "",
      timezone: entry.timezone,
      eventLink: entry.eventLink || "",
      description: entry.description || "",
      attendeeEmails: (entry.attendeeEmails || []).join(", "),
    });
    setEditingEntry(entry);
  };

  const duplicateEntry = (entry: CalendarEntry) => {
    const date = new Date(entry.eventDate);
    const endDate = entry.endDate ? new Date(entry.endDate) : null;
    setFormData({
      title: `${entry.title} (Copy)`,
      eventDate: format(date, "yyyy-MM-dd"),
      eventTime: format(date, "HH:mm"),
      endTime: endDate ? format(endDate, "HH:mm") : "",
      timezone: entry.timezone,
      eventLink: entry.eventLink || "",
      description: entry.description || "",
      attendeeEmails: (entry.attendeeEmails || []).join(", "),
    });
    setIsAddDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const startDayOfWeek = monthStart.getDay();
  const paddingDays = Array(startDayOfWeek).fill(null);

  // Date filtering logic
  const isEntryInDateRange = (entry: CalendarEntry): boolean => {
    if (!filterStartDate && !filterEndDate) return true;
    
    const entryDate = new Date(entry.eventDate);
    
    if (filterStartDate && filterEndDate) {
      return !isBefore(entryDate, startOfDay(filterStartDate)) && !isAfter(entryDate, endOfDay(filterEndDate));
    }
    if (filterStartDate) {
      return !isBefore(entryDate, startOfDay(filterStartDate));
    }
    if (filterEndDate) {
      return !isAfter(entryDate, endOfDay(filterEndDate));
    }
    return true;
  };

  const filteredEntries = entries.filter(isEntryInDateRange);
  const isFilterActive = filterStartDate || filterEndDate;

  // Use filteredEntries for calendar view to respect the date filter
  const getEntriesForDay = (day: Date) => {
    return filteredEntries.filter((entry) => isSameDay(new Date(entry.eventDate), day));
  };

  const sortedEntries = [...filteredEntries].sort(
    (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
  );

  const clearDateFilter = () => {
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
  };

  return (
    <AppLayout title="Marketing Calendar" mode="client">
      <div className="space-y-6" data-testid="marketing-calendar-container">
        {/* Date Filter */}
        {view !== "google" && <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/50 rounded-lg border">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground font-medium">Filter by date:</span>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="justify-start text-left font-normal"
                data-testid="button-filter-start-date"
              >
                <Calendar className="mr-2 h-4 w-4" />
                {filterStartDate ? format(filterStartDate, "MMM d, yyyy") : "Start date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarPicker
                mode="single"
                selected={filterStartDate}
                onSelect={setFilterStartDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground">to</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="justify-start text-left font-normal"
                data-testid="button-filter-end-date"
              >
                <Calendar className="mr-2 h-4 w-4" />
                {filterEndDate ? format(filterEndDate, "MMM d, yyyy") : "End date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarPicker
                mode="single"
                selected={filterEndDate}
                onSelect={setFilterEndDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {isFilterActive && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearDateFilter}
                className="text-muted-foreground"
                data-testid="button-clear-date-filter"
              >
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
              <Badge variant="secondary" className="ml-auto" data-testid="badge-filter-count">
                {filteredEntries.length} of {entries.length} events
              </Badge>
            </>
          )}
        </div>}

        <div className="flex items-center justify-end">
          <div className="flex items-center gap-4">
            <Tabs value={view} onValueChange={(v) => { setView(v as typeof view); setViewChosen(true); }}>
              <TabsList>
                {googleCalendarId && (
                  <TabsTrigger value="google" data-testid="view-google">
                    <Calendar className="h-4 w-4 mr-2" />
                    Google Calendar
                  </TabsTrigger>
                )}
                <TabsTrigger value="list" data-testid="view-list">
                  <List className="h-4 w-4 mr-2" />
                  List
                </TabsTrigger>
                <TabsTrigger value="calendar" data-testid="view-calendar">
                  <Calendar className="h-4 w-4 mr-2" />
                  Calendar
                </TabsTrigger>
                <TabsTrigger value="week" data-testid="view-week"><Calendar className="h-4 w-4 mr-2" />Week</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2 text-sm">
              <span className={googleCalendarId ? "text-green-600" : "text-muted-foreground"}>
                {connectionQuery.isError ? "Connection status unavailable" : googleCalendarId ? "Google Calendar linked" : "Google Calendar not linked"}
              </span>
              {connection?.lastSuccessfulSync && <span className="text-muted-foreground">Last sync {format(new Date(connection.lastSuccessfulSync), "MMM d, h:mm a")}</span>}
              {canConfigure && <><Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}><Settings className="h-4 w-4 mr-1" />Configure</Button>{connection?.connected && <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}><RefreshCw className="h-4 w-4 mr-1" />Sync</Button>}</>}
            </div>
            {(connectionQuery.isError || connection?.error || localSyncError || syncMutation.isError) && <p className="text-sm text-destructive">{localSyncError || connection?.error || (connectionQuery.isError ? "Could not check Google Calendar status." : "Google Calendar sync failed. Your local entries are still available.")}</p>}
            {canEdit && (
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-event">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Event
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Calendar Event</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Event Title *</Label>
                      <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="e.g., Masterclass Launch"
                        required
                        data-testid="input-title"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="eventDate">Date *</Label>
                        <Input
                          id="eventDate"
                          type="date"
                          value={formData.eventDate}
                          onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                          required
                          data-testid="input-date"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label htmlFor="eventTime">Start Time</Label>
                          <Input
                            id="eventTime"
                            type="time"
                            value={formData.eventTime}
                            onChange={(e) => setFormData({ ...formData, eventTime: e.target.value })}
                            data-testid="input-time"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="endTime">End Time</Label>
                          <Input
                            id="endTime"
                            type="time"
                            value={formData.endTime}
                            onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                            data-testid="input-end-time"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select
                        value={formData.timezone}
                        onValueChange={(value) => setFormData({ ...formData, timezone: value })}
                      >
                        <SelectTrigger data-testid="select-timezone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                              {tz.replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="eventLink">Event Link</Label>
                      <Input
                        id="eventLink"
                        type="url"
                        value={formData.eventLink}
                        onChange={(e) => setFormData({ ...formData, eventLink: e.target.value })}
                        placeholder="https://..."
                        data-testid="input-link"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description (Optional)</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Additional details about this event..."
                        rows={3}
                        data-testid="input-description"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="attendeeEmails">Invite Attendees (Optional)</Label>
                      <Textarea
                        id="attendeeEmails"
                        value={formData.attendeeEmails}
                        onChange={(e) => setFormData({ ...formData, attendeeEmails: e.target.value })}
                        placeholder="Enter email addresses separated by commas (e.g., john@example.com, jane@example.com)"
                        rows={2}
                        data-testid="input-attendees"
                      />
                      <p className="text-xs text-muted-foreground">
                        Attendees will receive Google Calendar invites and notifications for any changes.
                      </p>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit">
                        {createMutation.isPending ? "Adding..." : "Add Event"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {view === "google" && googleEmbedUrl ? (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <iframe
                src={googleEmbedUrl}
                title="Google Calendar"
                className="w-full h-[700px] rounded-lg border"
                frameBorder={0}
                scrolling="no"
                data-testid="google-calendar-embed"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>Don't see events? Make sure you're signed into the Google account this calendar is shared with.</span>
                <a
                  href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(googleCalendarId!)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  data-testid="link-open-google-calendar"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in Google Calendar
                </a>
              </div>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="text-center py-12">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-3/4 mx-auto"></div>
              <div className="h-4 bg-muted rounded w-1/2 mx-auto"></div>
            </div>
          </div>
        ) : view === "list" ? (
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Events</CardTitle>
            </CardHeader>
            <CardContent>
              {sortedEntries.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">No marketing events scheduled yet.</p>
                  {canEdit && (
                    <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Event
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedEntries.map((entry) => {
                    const eventDate = new Date(entry.eventDate);
                    const isPast = eventDate < new Date();
                    return (
                      <div
                        key={entry.id}
                        className={`flex items-start justify-between p-4 border rounded-lg ${
                          isPast ? "opacity-60" : ""
                        }`}
                        data-testid={`calendar-entry-${entry.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{entry.title}</h3>
                            {isPast && (
                              <span className="text-xs bg-muted px-2 py-0.5 rounded">Past</span>
                            )}
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 mt-2 gap-1 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4 flex-shrink-0" />
                              <span className="hidden sm:inline">{format(eventDate, "EEEE, MMMM d, yyyy")}</span>
                              <span className="sm:hidden">{format(eventDate, "MMM d, yyyy")}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4 flex-shrink-0" />
                              {format(eventDate, "h:mm a")}
                              <span className="hidden sm:inline">({entry.timezone.replace("_", " ")})</span>
                            </div>
                          </div>
                          {entry.eventLink && (
                            <a
                              href={entry.eventLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                              data-testid={`link-event-${entry.id}`}
                            >
                              <LinkIcon className="h-4 w-4" />
                              Event Link
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {entry.description && (
                            <p className="text-sm text-muted-foreground mt-2">{entry.description}</p>
                          )}
                          {entry.attendeeEmails && entry.attendeeEmails.length > 0 && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-2">
                              <Users className="h-4 w-4" />
                              <span>{entry.attendeeEmails.length} attendee{entry.attendeeEmails.length !== 1 ? 's' : ''} invited</span>
                               {connection?.connected && entry.googleEventId && (
                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded ml-2">
                                  Google Calendar
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => duplicateEntry(entry)}
                              title="Duplicate"
                              className="h-8 w-8"
                              data-testid={`button-duplicate-${entry.id}`}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(entry)}
                              title="Edit"
                              className="h-8 w-8"
                              data-testid={`button-edit-${entry.id}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(entry.id)}
                              disabled={deleteMutation.isPending}
                              title="Delete"
                              className="h-8 w-8"
                              data-testid={`button-delete-${entry.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ) : view === "calendar" ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{format(currentMonth, "MMMM yyyy")}</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                    data-testid="button-prev-month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentMonth(new Date())}
                    data-testid="button-today"
                  >
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    data-testid="button-next-month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div
                    key={day}
                    className="bg-background p-2 text-center text-sm font-medium text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
                {paddingDays.map((_, i) => (
                  <div key={`padding-${i}`} className="bg-background p-2 min-h-[100px]"></div>
                ))}
                {daysInMonth.map((day) => {
                  const dayEntries = getEntriesForDay(day);
                  const isToday = isSameDay(day, new Date());
                  return (
                    <div
                      key={day.toISOString()}
                      className={`bg-background p-2 min-h-[100px] ${
                        isToday ? "ring-2 ring-primary ring-inset" : ""
                      }`}
                    >
                      <div
                        className={`text-sm font-medium mb-1 ${
                          isToday ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {format(day, "d")}
                      </div>
                      <div className="space-y-1">
                        {dayEntries.slice(0, 3).map((entry) => (
                          <div
                            key={entry.id}
                            className="text-xs p-1 bg-primary/10 text-primary rounded truncate cursor-pointer hover:bg-primary/20"
                            onClick={() => canEdit && openEditDialog(entry)}
                            title={`${entry.title} - ${format(new Date(entry.eventDate), "h:mm a")}`}
                            data-testid={`cal-entry-${entry.id}`}
                          >
                            {entry.title}
                          </div>
                        ))}
                        {dayEntries.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            +{dayEntries.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>Week of {format(startOfWeek(currentMonth), "MMM d, yyyy")}</CardTitle><div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => setCurrentMonth(subWeeks(currentMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>Today</Button><Button variant="outline" size="icon" onClick={() => setCurrentMonth(addWeeks(currentMonth, 1))}><ChevronRight className="h-4 w-4" /></Button></div></div></CardHeader>
            <CardContent><div className="grid grid-cols-7 gap-2">{eachWeekDay({ start: startOfWeek(currentMonth), end: endOfWeek(currentMonth) }).map(day => <div key={day.toISOString()} className={`border rounded-lg p-3 min-h-[180px] ${isSameDay(day, new Date()) ? "ring-2 ring-primary" : ""}`}><div className="font-medium text-sm mb-3">{format(day, "EEE d")}</div>{getEntriesForDay(day).map(entry => <div key={entry.id} onClick={() => canEdit && openEditDialog(entry)} className="text-sm p-2 mb-2 rounded bg-primary/10 text-primary cursor-pointer"><div className="font-medium">{entry.title}</div><div className="text-xs">{format(new Date(entry.eventDate), "h:mm a")}</div></div>)}</div>)}</div></CardContent>
          </Card>
        )}

        <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Calendar Event</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Event Title *</Label>
                <Input
                  id="edit-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Masterclass Launch"
                  required
                  data-testid="input-edit-title"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-eventDate">Date *</Label>
                  <Input
                    id="edit-eventDate"
                    type="date"
                    value={formData.eventDate}
                    onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                    required
                    data-testid="input-edit-date"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-eventTime">Start Time</Label>
                    <Input
                      id="edit-eventTime"
                      type="time"
                      value={formData.eventTime}
                      onChange={(e) => setFormData({ ...formData, eventTime: e.target.value })}
                      data-testid="input-edit-time"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-endTime">End Time</Label>
                    <Input
                      id="edit-endTime"
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      data-testid="input-edit-end-time"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-timezone">Timezone</Label>
                <Select
                  value={formData.timezone}
                  onValueChange={(value) => setFormData({ ...formData, timezone: value })}
                >
                  <SelectTrigger data-testid="select-edit-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-eventLink">Event Link</Label>
                <Input
                  id="edit-eventLink"
                  type="url"
                  value={formData.eventLink}
                  onChange={(e) => setFormData({ ...formData, eventLink: e.target.value })}
                  placeholder="https://..."
                  data-testid="input-edit-link"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description (Optional)</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Additional details about this event..."
                  rows={3}
                  data-testid="input-edit-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-attendeeEmails">Invite Attendees (Optional)</Label>
                <Textarea
                  id="edit-attendeeEmails"
                  value={formData.attendeeEmails}
                  onChange={(e) => setFormData({ ...formData, attendeeEmails: e.target.value })}
                  placeholder="Enter email addresses separated by commas (e.g., john@example.com, jane@example.com)"
                  rows={2}
                  data-testid="input-edit-attendees"
                />
                <p className="text-xs text-muted-foreground">
                  Attendees will receive Google Calendar invites and notifications for any changes.
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingEntry(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-update">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={configOpen} onOpenChange={setConfigOpen}>
          <DialogContent><DialogHeader><DialogTitle>Calendar connection</DialogTitle></DialogHeader>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); connectionMutation.mutate(); }}>
              <div className="space-y-2"><Label htmlFor="calendar-id">Google Calendar ID or embed link</Label><Input id="calendar-id" value={calendarId} onChange={e => setCalendarId(e.target.value)} placeholder="abc123@group.calendar.google.com" data-testid="input-calendar-id" /><p className="text-xs text-muted-foreground">Leave blank to unlink this client's calendar.</p></div>
              <ol className="list-decimal pl-5 text-xs text-muted-foreground space-y-1">
                <li>In Google Calendar, open Settings, pick this client's calendar, then scroll to <span className="font-medium">Integrate calendar</span> and copy the Calendar ID (or the embed code).</li>
                <li>Under <span className="font-medium">Share with specific people</span>, add the client's Google email so they can see events.</li>
                <li>Paste the ID or embed code above and save.</li>
              </ol>
              {connection?.error && <p className="text-sm text-destructive">{connection.error}</p>}
              {connectionMutation.isError && <p className="text-sm text-destructive">Could not save the calendar connection.</p>}
              <DialogFooter><Button type="submit" disabled={connectionMutation.isPending}>{connectionMutation.isPending ? "Saving…" : "Save connection"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

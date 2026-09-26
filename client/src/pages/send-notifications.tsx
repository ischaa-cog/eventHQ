import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Users, Mail, AlertCircle, MessageSquare, Check, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Client {
  id: number;
  name: string;
  email: string | null;
}

interface SentNotification {
  id: number;
  agencyId: number;
  senderUserId: string | null;
  subject: string;
  body: string;
  category: string;
  metadata: any;
  createdAt: string;
}

const categoryOptions = [
  { value: "asset_ready", label: "Asset Ready", icon: AlertCircle },
  { value: "account_update", label: "Account Update", icon: MessageSquare },
  { value: "custom", label: "Custom Announcement", icon: Mail },
];

export default function SendNotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("custom");
  const [selectedClients, setSelectedClients] = useState<number[]>([]);
  const [sendEmail, setSendEmail] = useState(true);

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: sentNotifications = [] } = useQuery<SentNotification[]>({
    queryKey: ["/api/notifications/sent"],
  });

  const sendMutation = useMutation({
    mutationFn: async (data: { subject: string; body: string; category: string; clientIds: number[]; sendEmail: boolean }) => {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to send notification");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Notification Sent",
        description: `Your message was sent to ${data.recipientCount} client${data.recipientCount !== 1 ? "s" : ""}.`,
      });
      setSubject("");
      setBody("");
      setSelectedClients([]);
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/sent"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSelectAll = () => {
    if (selectedClients.length === clients.length) {
      setSelectedClients([]);
    } else {
      setSelectedClients(clients.map((c) => c.id));
    }
  };

  const handleClientToggle = (clientId: number) => {
    setSelectedClients((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    );
  };

  const handleSend = () => {
    if (!subject.trim() || !body.trim() || selectedClients.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please fill in subject, message, and select at least one client.",
        variant: "destructive",
      });
      return;
    }
    sendMutation.mutate({
      subject: subject.trim(),
      body: body.trim(),
      category,
      clientIds: selectedClients,
      sendEmail,
    });
  };

  const clientsWithEmail = clients.filter((c) => c.email);

  return (
    <AppLayout title="Send Notifications" mode="agency">
      <Tabs defaultValue="compose" className="max-w-4xl mx-auto">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="compose" className="flex items-center gap-2" data-testid="tab-compose">
                <Send className="h-4 w-4" />
                Compose
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2" data-testid="tab-history">
                <History className="h-4 w-4" />
                Sent History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="compose" className="space-y-6">
              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-primary" />
                        Message
                      </CardTitle>
                      <CardDescription>
                        Compose a notification to send to your clients
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="category">Category</Label>
                        <Select value={category} onValueChange={setCategory}>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categoryOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <div className="flex items-center gap-2">
                                  <opt.icon className="h-4 w-4" />
                                  {opt.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="subject">Subject</Label>
                        <Input
                          id="subject"
                          placeholder="Enter notification subject..."
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          data-testid="input-subject"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="body">Message</Label>
                        <Textarea
                          id="body"
                          placeholder="Type your message here..."
                          rows={6}
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          data-testid="input-body"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="send-email"
                            checked={sendEmail}
                            onCheckedChange={setSendEmail}
                            data-testid="switch-send-email"
                          />
                          <Label htmlFor="send-email" className="cursor-pointer">
                            Also send via email
                          </Label>
                        </div>
                        {sendEmail && (
                          <span className="text-xs text-muted-foreground">
                            {clientsWithEmail.filter((c) => selectedClients.includes(c.id)).length} recipient{clientsWithEmail.filter((c) => selectedClients.includes(c.id)).length !== 1 ? "s" : ""} with email
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        Recipients
                      </CardTitle>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {selectedClients.length} of {clients.length} selected
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleSelectAll}
                          className="text-xs"
                          data-testid="button-select-all"
                        >
                          {selectedClients.length === clients.length ? "Deselect all" : "Select all"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {clients.map((client) => (
                          <label
                            key={client.id}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                          >
                            <Checkbox
                              checked={selectedClients.includes(client.id)}
                              onCheckedChange={() => handleClientToggle(client.id)}
                              data-testid={`checkbox-client-${client.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{client.name}</p>
                              {client.email && (
                                <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                              )}
                            </div>
                            {!client.email && (
                              <Badge variant="outline" className="text-xs shrink-0">No email</Badge>
                            )}
                          </label>
                        ))}
                        {clients.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No clients found
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleSend}
                    disabled={sendMutation.isPending || selectedClients.length === 0 || !subject.trim() || !body.trim()}
                    data-testid="button-send-notification"
                  >
                    {sendMutation.isPending ? (
                      "Sending..."
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Notification
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5 text-primary" />
                    Sent Notifications
                  </CardTitle>
                  <CardDescription>
                    View all notifications you've sent to clients
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {sentNotifications.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="rounded-full bg-muted p-4 w-fit mx-auto mb-4">
                        <Mail className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground">No notifications sent yet</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {sentNotifications.map((notif) => {
                        const categoryOpt = categoryOptions.find((c) => c.value === notif.category);
                        const Icon = categoryOpt?.icon || Mail;
                        return (
                          <div
                            key={notif.id}
                            className="flex items-start gap-4 p-4 border rounded-lg"
                            data-testid={`sent-notification-${notif.id}`}
                          >
                            <div className="rounded-full bg-muted p-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{notif.subject}</h4>
                                <Badge variant="secondary">{categoryOpt?.label || notif.category}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {notif.body}
                              </p>
                              <p className="text-xs text-muted-foreground/60 mt-2">
                                Sent {format(new Date(notif.createdAt), "MMM d, yyyy 'at' h:mm a")}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
    </AppLayout>
  );
}

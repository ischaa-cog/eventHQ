import { Bell, Search, BellOff, Mail, AlertCircle, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Notification {
  id: number;
  notificationId: number;
  clientId: number | null;
  recipientUserId: string | null;
  recipientEmail: string | null;
  emailStatus: string | null;
  emailSentAt: string | null;
  readAt: string | null;
  createdAt: string;
  notification: {
    id: number;
    agencyId: number;
    senderUserId: string | null;
    subject: string;
    body: string;
    category: string;
    metadata: any;
    createdAt: string;
  };
}

interface HeaderProps {
  title: string;
  showSearch?: boolean;
}

const categoryIcons: Record<string, typeof Mail> = {
  asset_ready: AlertCircle,
  account_update: MessageSquare,
  custom: Mail,
};

export function Header({ title, showSearch = false }: HeaderProps) {
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();

  const clientIdMatch = location.match(/\/client\/(\d+)/);
  const currentClientId = clientIdMatch ? clientIdMatch[1] : null;

  const notificationsEndpoint = currentClientId
    ? `/api/clients/${currentClientId}/notifications`
    : "/api/notifications";

  const unreadCountEndpoint = currentClientId
    ? `/api/clients/${currentClientId}/notifications/unread-count`
    : "/api/notifications/unread-count";

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: [unreadCountEndpoint],
    refetchInterval: 30000,
    enabled: !!currentClientId,
  });

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: [notificationsEndpoint],
    enabled: !!currentClientId,
  });

  const markReadMutation = useMutation({
    mutationFn: async (recipientId: number) => {
      const res = await fetch(`/api/notifications/${recipientId}/read`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark as read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [notificationsEndpoint] });
      queryClient.invalidateQueries({ queryKey: [unreadCountEndpoint] });
    },
  });

  const unreadCount = unreadData?.count ?? 0;
  const recentNotifications = notifications.slice(0, 5);

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.readAt) {
      markReadMutation.mutate(notification.id);
    }
  };

  return (
    <header className="hidden md:flex h-[4.5rem] items-center justify-between border-b border-border/70 bg-background/85 backdrop-blur px-8">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">EventHQ workspace</p>
        <h1 className="text-2xl font-heading font-semibold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        {showSearch && (
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search clients..."
              className="pl-9 h-9 bg-muted/50 border-transparent focus:bg-background focus:border-input transition-all"
              data-testid="input-search-clients"
            />
          </div>
        )}
        {currentClientId && <Popover>
          <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}>
            <PopoverTrigger asChild>
             <Button
              variant="ghost"
              size="icon"
              className="relative"
              data-testid="button-notifications"
            >
              <Bell className="h-5 w-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center ring-2 ring-background">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
              </Button>
            </PopoverTrigger>
          </motion.div>
          <PopoverContent className="w-[calc(100vw-2rem)] sm:w-96 max-w-[400px]" align="end">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Notifications</h4>
                {unreadCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {unreadCount} unread
                  </span>
                )}
              </div>

              {recentNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="rounded-full bg-muted p-3 mb-3">
                    <BellOff className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">No notifications</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    You're all caught up! Check back later.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-80">
                  <div className="space-y-2">
                    {recentNotifications.map((notif) => {
                      const Icon = categoryIcons[notif.notification.category] || Mail;
                      const isUnread = !notif.readAt;
                      return (
                        <button
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif)}
                          className={`w-full text-left p-3 rounded-lg transition-colors hover:bg-muted/50 ${
                            isUnread ? "bg-primary/5" : ""
                          }`}
                          data-testid={`notification-item-${notif.id}`}
                        >
                          <div className="flex gap-3">
                            <div className={`rounded-full p-2 ${isUnread ? "bg-primary/10" : "bg-muted"}`}>
                              <Icon className={`h-4 w-4 ${isUnread ? "text-primary" : "text-muted-foreground"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={`text-sm truncate ${isUnread ? "font-semibold" : "font-medium"}`}>
                                  {notif.notification.subject}
                                </p>
                                {isUnread && (
                                  <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {notif.notification.body}
                              </p>
                              <p className="text-xs text-muted-foreground/60 mt-1">
                                {formatDistanceToNow(new Date(notif.notification.createdAt), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}

              <Button
                variant="ghost"
                className="w-full text-xs"
                onClick={() => {
                  navigate(`/client/${currentClientId}/notifications`);
                }}
                data-testid="button-view-all-notifications"
              >
                View all notifications
              </Button>
            </div>
          </PopoverContent>
        </Popover>}
      </div>
    </header>
  );
}

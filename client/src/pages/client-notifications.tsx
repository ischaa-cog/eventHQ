import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { Bell, Mail, AlertCircle, MessageSquare, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppLayout } from "@/components/layout/AppLayout";
import { useParams } from "wouter";

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

const categoryLabels: Record<string, string> = {
  asset_ready: "Asset Ready",
  account_update: "Account Update",
  custom: "Announcement",
};

const categoryColors: Record<string, string> = {
  asset_ready: "bg-green-500/10 text-green-500",
  account_update: "bg-blue-500/10 text-blue-500",
  custom: "bg-gray-500/10 text-gray-500",
};

const categoryIcons: Record<string, typeof Mail> = {
  asset_ready: AlertCircle,
  account_update: MessageSquare,
  custom: Mail,
};

export default function ClientNotificationsPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: [`/api/clients/${clientId}/notifications`],
    enabled: !!clientId,
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
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/notifications`] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const unreadNotifications = notifications.filter((n) => !n.readAt);
  const readNotifications = notifications.filter((n) => n.readAt);

  const markAllRead = async () => {
    for (const notif of unreadNotifications) {
      await markReadMutation.mutateAsync(notif.id);
    }
  };

  return (
    <AppLayout title="Notifications" mode="client">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">All Notifications</h2>
              <p className="text-sm text-muted-foreground">
                {unreadNotifications.length} unread notification{unreadNotifications.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          {unreadNotifications.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              disabled={markReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark all as read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Bell className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-muted-foreground">No notifications yet</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                When your agency sends you updates, they'll appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {unreadNotifications.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">New</h3>
                {unreadNotifications.map((notif) => (
                  <NotificationCard
                    key={notif.id}
                    notification={notif}
                    onMarkRead={() => markReadMutation.mutate(notif.id)}
                    isMarking={markReadMutation.isPending}
                  />
                ))}
              </div>
            )}

            {readNotifications.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Earlier</h3>
                {readNotifications.map((notif) => (
                  <NotificationCard
                    key={notif.id}
                    notification={notif}
                    isRead
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function NotificationCard({
  notification,
  onMarkRead,
  isMarking,
  isRead = false,
}: {
  notification: Notification;
  onMarkRead?: () => void;
  isMarking?: boolean;
  isRead?: boolean;
}) {
  const Icon = categoryIcons[notification.notification.category] || Mail;
  const categoryLabel = categoryLabels[notification.notification.category] || "Notification";
  const categoryColor = categoryColors[notification.notification.category] || categoryColors.custom;

  return (
    <Card className={!isRead ? "border-primary/30 bg-primary/5" : ""} data-testid={`notification-card-${notification.id}`}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div className={`rounded-full p-3 h-fit ${!isRead ? "bg-primary/10" : "bg-muted"}`}>
            <Icon className={`h-5 w-5 ${!isRead ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className={`text-base ${!isRead ? "font-semibold" : "font-medium"}`}>
                    {notification.notification.subject}
                  </h4>
                  <Badge variant="secondary" className={categoryColor}>
                    {categoryLabel}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                  {notification.notification.body}
                </p>
                <div className="flex items-center gap-4 mt-3">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(notification.notification.createdAt), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    ({formatDistanceToNow(new Date(notification.notification.createdAt), { addSuffix: true })})
                  </span>
                </div>
              </div>
              {!isRead && onMarkRead && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMarkRead}
                  disabled={isMarking}
                  className="flex-shrink-0"
                  data-testid={`button-mark-read-${notification.id}`}
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

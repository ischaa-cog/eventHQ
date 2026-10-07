import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Calendar,
  TrendingUp,
  LogOut,
  Briefcase,
  Video,
  GraduationCap,
  Bell,
  ClipboardList,
  Menu,
  DollarSign,
  Bot,
  Send,
  Settings,
  Image,
  WandSparkles,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { motion } from "framer-motion";
import { MotionConfig } from "framer-motion";

const logo = "/logo-app.png";

function UserInfo() {
  const { user, isLoading } = useAuth();
  
  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  if (isLoading) {
    return (
      <div className="flex items-center animate-pulse">
        <div className="h-8 w-8 rounded-full bg-sidebar-accent"></div>
        <div className="ml-3 flex-1">
          <div className="h-4 w-20 bg-sidebar-accent rounded mb-1"></div>
          <div className="h-3 w-12 bg-sidebar-accent/50 rounded"></div>
        </div>
      </div>
    );
  }

  const displayName = user?.firstName && user?.lastName 
    ? `${user.firstName} ${user.lastName}`
    : user?.email?.split("@")[0] || "User";
  
  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : displayName.slice(0, 2).toUpperCase();
  
  const roleDisplay = user?.role === "owner" || user?.role === "agency_admin" ? "Admin"
    : user?.role === "team_member" ? "Team Member"
    : user?.role === "agency_client" ? "Client"
    : "Disabled";

  return (
    <div className="flex items-center">
      <div className="flex-shrink-0">
        {user?.profileImageUrl ? (
          <img 
            src={user.profileImageUrl} 
            alt={displayName}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold text-sm">
            {initials}
          </div>
        )}
      </div>
      <div className="ml-3 min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{displayName}</p>
        <p className="text-xs text-sidebar-foreground/50">{roleDisplay}</p>
      </div>
      <button 
        onClick={handleLogout}
        className="ml-auto text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
        title="Log out"
        data-testid="button-logout"
      >
        <LogOut className="h-5 w-5" />
      </button>
    </div>
  );
}

interface Client {
  id: number;
  onboardingComplete: boolean;
}

const workspaceNavigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Client Workspaces", href: "/clients", icon: Users },
  { name: "Notifications", href: "/notifications", icon: Bell },
];

const clientNavigation = (clientId: string) => [
  { name: "Dashboard", href: `/client/${clientId}/dashboard`, icon: LayoutDashboard },
  { name: "Talk to Neo AI", href: `/client/${clientId}/neo`, icon: Bot, special: true },
  { name: "Client Workspaces", href: "/clients", icon: Users },
  { name: "Onboarding", href: `/client/${clientId}/onboarding`, icon: ClipboardList },
  { name: "Training Lab", href: `/client/${clientId}/training`, icon: GraduationCap },
  { name: "Marketing Calendar", href: `/client/${clientId}/calendar`, icon: Calendar },
  { name: "Live Sales Feed", href: `/client/${clientId}/sales`, icon: DollarSign },
  { name: "Event Tracker", href: `/client/${clientId}/events`, icon: Video },
  { name: "Assets", href: `/client/${clientId}/assets`, icon: Image },
  { name: "Projections", href: `/client/${clientId}/projections`, icon: TrendingUp },
  { name: "Notifications", href: `/client/${clientId}/notifications`, icon: Bell },
  { name: "Client Profile", href: `/client/${clientId}/workspace`, icon: Briefcase },
];

const clientPortalNavigation = (clientId: string) => [
  { name: "Dashboard", href: `/client/${clientId}/dashboard`, icon: LayoutDashboard },
  { name: "Talk to Neo AI", href: `/client/${clientId}/neo`, icon: Bot, special: true },
  { name: "Marketing Calendar", href: `/client/${clientId}/calendar`, icon: Calendar },
  { name: "Live Sales Feed", href: `/client/${clientId}/sales`, icon: DollarSign },
  { name: "Event Tracker", href: `/client/${clientId}/events`, icon: Video },
  { name: "Projections", href: `/client/${clientId}/projections`, icon: TrendingUp },
  { name: "Training Lab", href: `/client/${clientId}/training`, icon: GraduationCap },
  { name: "Notifications", href: `/client/${clientId}/notifications`, icon: Bell },
];

interface SidebarProps {
  mode?: "agency" | "client";
}

interface SidebarContentProps {
  navigation: { name: string; href: string; icon: any; special?: boolean }[];
  location: string;
  onNavClick?: () => void;
}

function SidebarContent({
  navigation, location, onNavClick,
}: SidebarContentProps) {
  const NavItem = ({ item }: { item: SidebarContentProps["navigation"][number] }) => {
    const isActive = location === item.href;
    return (
      <motion.div key={item.name} whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}>
        <Link
          href={item.href}
          onClick={onNavClick}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "group flex min-h-9 items-center rounded-md px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            item.special
              ? isActive
                ? "min-h-11 border border-sidebar-primary bg-sidebar-primary font-bold text-sidebar-primary-foreground shadow-md"
                : "min-h-11 border border-sidebar-primary/50 bg-sidebar-primary/15 font-bold text-sidebar-foreground shadow-sm hover:border-sidebar-primary hover:bg-sidebar-primary/25"
              : isActive
                ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
          data-testid={item.special ? "nav-talk-to-neo" : undefined}
        >
          <item.icon
            className={cn(
              "mr-3 h-[17px] w-[17px] flex-shrink-0",
              item.special
                ? isActive
                  ? "text-sidebar-primary-foreground"
                  : "text-sidebar-primary"
                : isActive
                ? "text-sidebar-primary-foreground"
                : "text-sidebar-foreground/45 group-hover:text-sidebar-accent-foreground",
            )}
            aria-hidden="true"
          />
          <span className="truncate">{item.name}</span>
          {item.special && <WandSparkles className={cn("ml-auto h-4 w-4", isActive ? "text-sidebar-primary-foreground" : "text-sidebar-primary")} aria-hidden="true" />}
        </Link>
      </motion.div>
    );
  };

  return (
    <MotionConfig reducedMotion="user">
    <>
      <div className="flex-1 min-h-0 overflow-y-auto py-4 px-3">
        <nav aria-label="Primary navigation" className="space-y-1">
          {navigation.map((item) => <NavItem key={item.name} item={item} />)}
        </nav>
      </div>

      <div className="border-t border-sidebar-border p-4">
        <UserInfo />
      </div>
    </>
    </MotionConfig>
  );
}

export function Sidebar({ mode = "agency" }: SidebarProps) {
  void mode;
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const userRoleIsClient = user?.role === "agency_client";
  
  const clientIdMatch = location.match(/\/client\/(\d+)/);
  const currentClientId = clientIdMatch ? clientIdMatch[1] : null;

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
  });

  const { data: currentClient } = useQuery<Client>({
    queryKey: [`/api/clients/${currentClientId}`],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${currentClientId}`);
      if (!res.ok) throw new Error("Failed to fetch client");
      return res.json();
    },
    enabled: !!currentClientId,
  });

  const getClientNav = (clientId: string) => {
    const baseNav = userRoleIsClient ? clientPortalNavigation(clientId) : clientNavigation(clientId);
    
    if (currentClient?.onboardingComplete) {
      return baseNav.map(item => item.name === "Onboarding" ? { ...item, name: "Your Setup" } : item);
    }
    return baseNav;
  };

  const globalNavigation = userRoleIsClient
    ? clients.length === 1
      ? [{ name: "Dashboard", href: `/client/${clients[0].id}/dashboard`, icon: LayoutDashboard }]
      : []
    : [
    ...workspaceNavigation,
    ...(user?.role === "owner" || user?.role === "agency_admin"
      ? [
          { name: "Send Notifications", href: "/send-notifications", icon: Send },
          { name: "Neo Knowledge", href: "/neo-knowledge", icon: BookOpen },
          { name: "Admin Settings", href: "/admin", icon: Settings },
        ]
      : []),
  ];

  const navigation = currentClientId ? getClientNav(currentClientId) : globalNavigation;

  const sidebarContentProps = {
    navigation,
    location,
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between px-4 bg-sidebar border-b border-sidebar-border">
        <img src={logo} alt="EventHQ" className="h-7 w-auto" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          className="text-sidebar-foreground"
          data-testid="button-mobile-menu"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </div>

      {/* Mobile Navigation Drawer */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground border-sidebar-border">
          <SheetHeader className="px-6 py-4 border-b border-sidebar-border">
            <SheetTitle className="flex items-center">
              <img src={logo} alt="EventHQ" className="h-7 w-auto" />
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col h-[calc(100%-60px)]">
            <SidebarContent 
              {...sidebarContentProps} 
              onNavClick={() => setMobileMenuOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
          <img src={logo} alt="EventHQ" className="h-8 w-auto" />
        </div>
        <SidebarContent {...sidebarContentProps} />
      </div>
    </>
  );
}

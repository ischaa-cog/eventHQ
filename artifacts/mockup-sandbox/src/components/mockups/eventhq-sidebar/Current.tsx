import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Calendar,
  TrendingUp,
  LogOut,
  ChevronsUpDown,
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
} from 'lucide-react';
import { motion, MotionConfig } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import './_group.css';

const logo = `${import.meta.env.BASE_URL}logo-app.png`;

interface User {
  firstName: string;
  lastName: string;
  email: string;
  role: 'owner';
  profileImageUrl?: string;
}

interface Client {
  id: number;
  name: string;
  niche: string | null;
  headshot: string | null;
  onboardingComplete: boolean;
}

const sampleUser: User = {
  firstName: 'Jordan',
  lastName: 'Lee',
  email: 'jordan.lee@eventhq.com',
  role: 'owner',
};

const sampleClients: Client[] = [
  {
    id: 1,
    name: 'Brightline Events',
    niche: 'Events',
    headshot: null,
    onboardingComplete: false,
  },
];

const workspaceNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Client Workspaces', href: '/clients', icon: Users },
  { name: 'Notifications', href: '/notifications', icon: Bell },
];

const clientNavigation = (clientId: string) => [
  { name: 'Dashboard', href: `/client/${clientId}/dashboard`, icon: LayoutDashboard },
  { name: 'Client Workspaces', href: '/clients', icon: Users },
  { name: 'Talk To Tuck AI', href: `/client/${clientId}/tuck`, icon: Bot, special: true },
  { name: 'Workspace Dashboard', href: `/client/${clientId}/dashboard`, icon: LayoutDashboard },
  { name: 'Onboarding', href: `/client/${clientId}/onboarding`, icon: ClipboardList },
  { name: 'Training Lab', href: `/client/${clientId}/training`, icon: GraduationCap },
  { name: 'Marketing Calendar', href: `/client/${clientId}/calendar`, icon: Calendar },
  { name: 'Live Sales Feed', href: `/client/${clientId}/sales`, icon: DollarSign },
  { name: 'Event Tracker', href: `/client/${clientId}/events`, icon: Video },
  { name: 'Webinar Tracker', href: `/client/${clientId}/webinars`, icon: Calendar },
  { name: 'Event Builder', href: `/client/${clientId}/event-builder`, icon: WandSparkles },
  { name: 'Assets', href: `/client/${clientId}/assets`, icon: Image },
  { name: 'Projections', href: `/client/${clientId}/projections`, icon: TrendingUp },
  { name: 'Notifications', href: `/client/${clientId}/notifications`, icon: Bell },
  { name: 'Client Profile', href: `/client/${clientId}/workspace`, icon: Briefcase },
];

const clientNavigationRestricted = (clientId: string) => [
  { name: 'Dashboard', href: `/client/${clientId}/dashboard`, icon: LayoutDashboard },
  { name: 'Client Workspaces', href: '/clients', icon: Users },
  { name: 'Talk To Tuck AI', href: `/client/${clientId}/tuck`, icon: Bot, special: true },
  { name: 'Workspace Dashboard', href: `/client/${clientId}/dashboard`, icon: LayoutDashboard },
  { name: 'Onboarding', href: `/client/${clientId}/onboarding`, icon: ClipboardList },
  { name: 'Training Lab', href: `/client/${clientId}/training`, icon: GraduationCap },
  { name: 'Marketing Calendar', href: `/client/${clientId}/calendar`, icon: Calendar },
  { name: 'Live Sales Feed', href: `/client/${clientId}/sales`, icon: DollarSign },
  { name: 'Event Tracker', href: `/client/${clientId}/events`, icon: Video },
  { name: 'Webinar Tracker', href: `/client/${clientId}/webinars`, icon: Calendar },
  { name: 'Event Builder', href: `/client/${clientId}/event-builder`, icon: WandSparkles },
  { name: 'Assets', href: `/client/${clientId}/assets`, icon: Image },
  { name: 'Projections', href: `/client/${clientId}/projections`, icon: TrendingUp },
  { name: 'Notifications', href: `/client/${clientId}/notifications`, icon: Bell },
];

const clientColors = [
  'bg-purple-600',
  'bg-pink-600',
  'bg-orange-600',
  'bg-green-600',
  'bg-blue-600',
  'bg-red-600',
  'bg-indigo-600',
  'bg-teal-600',
];

function getClientColor(index: number): string {
  return clientColors[index % clientColors.length];
}

function getInitials(name: string): string {
  return name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase();
}

function UserInfo() {
  const displayName = `${sampleUser.firstName} ${sampleUser.lastName}`;
  const initials = `${sampleUser.firstName[0]}${sampleUser.lastName[0]}`.toUpperCase();
  const roleDisplay = 'Owner';

  return (
    <div className="flex items-center">
      <div className="flex-shrink-0">
        {sampleUser.profileImageUrl ? (
          <img
            src={sampleUser.profileImageUrl}
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
        onClick={() => {}}
        className="ml-auto text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
        title="Log out"
        data-testid="button-logout"
      >
        <LogOut className="h-5 w-5" />
      </button>
    </div>
  );
}

interface SidebarContentProps {
  navigation: { name: string; href: string; icon: any; special?: boolean }[];
  location: string;
  setLocation: (path: string) => void;
  clients: Client[];
  currentClient?: Client;
  activeClientName: string;
  activeClientInitials: string;
  activeClientColor: string;
  onNavClick?: () => void;
}

function SidebarContent({
  navigation,
  location,
  setLocation,
  clients,
  currentClient,
  activeClientName,
  activeClientInitials,
  activeClientColor,
  onNavClick,
}: SidebarContentProps) {
  const navigate = (path: string) => {
    setLocation(path);
    onNavClick?.();
  };

  return (
    <MotionConfig reducedMotion="user">
      <>
        <div className="flex-1 overflow-y-auto py-6 px-3">
          <div className="px-3 mb-6">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between h-12 px-3 border-sidebar-border bg-sidebar-accent/30 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  data-testid="dropdown-context-switcher"
                >
                  <div className="flex items-center text-left">
                    {currentClient?.headshot ? (
                      <img
                        src={currentClient.headshot}
                        alt={currentClient.name}
                        className="mr-2 h-8 w-8 rounded-md object-cover"
                      />
                    ) : (
                      <div className={cn(
                        'mr-2 h-8 w-8 rounded-md flex items-center justify-center text-xs font-bold text-white',
                        activeClientColor,
                      )}>
                        {activeClientInitials}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold leading-none text-sidebar-foreground">
                        {activeClientName}
                      </span>
                      <span className="text-[10px] text-sidebar-foreground/60 leading-none mt-1">
                        {currentClient ? 'Client workspace' : 'Choose a workspace'}
                      </span>
                    </div>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Client workspaces</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => navigate('/clients')}
                  className="cursor-pointer"
                  data-testid="dropdown-item-all-clients"
                >
                  <Users className="mr-2 h-4 w-4" />
                  <span>All clients</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Open a workspace</DropdownMenuLabel>
                {clients.length === 0 ? (
                  <DropdownMenuItem disabled className="text-muted-foreground text-sm">
                    No client workspaces yet
                  </DropdownMenuItem>
                ) : (
                  clients.map((client, index) => (
                    <DropdownMenuItem
                      key={client.id}
                      onClick={() => navigate(`/client/${client.id}/dashboard`)}
                      className="cursor-pointer"
                      data-testid={`dropdown-item-client-${client.id}`}
                    >
                      {client.headshot ? (
                        <img
                          src={client.headshot}
                          alt={client.name}
                          className="mr-2 h-6 w-6 rounded object-cover"
                        />
                      ) : (
                        <div className={cn(
                          'mr-2 h-6 w-6 rounded flex items-center justify-center text-[10px] text-white font-bold',
                          getClientColor(index),
                        )}>
                          {getInitials(client.name)}
                        </div>
                      )}
                      <span>{client.name}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <nav className="space-y-1">
            {navigation.map((item) => {
              const isActive = location === item.href;
              if (item.special) {
                return (
                  <motion.div key={item.name} whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}>
                    <a
                      href={item.href}
                      onClick={(event) => { event.preventDefault(); navigate(item.href); }}
                      className={cn(
                        'group flex items-center px-3 py-2 text-sm font-semibold rounded-md transition-colors mb-2',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                          : 'bg-sidebar-primary/15 text-sidebar-primary hover:bg-sidebar-primary/25',
                      )}
                      data-testid="nav-talk-to-tuck"
                    >
                      <item.icon className="mr-3 h-5 w-5 flex-shrink-0 text-sidebar-primary" aria-hidden="true" />
                      {item.name}
                    </a>
                  </motion.div>
                );
              }
              return (
                <motion.div key={item.name} whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}>
                  <a
                    href={item.href}
                    onClick={(event) => { event.preventDefault(); navigate(item.href); }}
                    className={cn(
                      'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                      isActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    )}
                  >
                    <item.icon
                      className={cn(
                        'mr-3 h-5 w-5 flex-shrink-0',
                        isActive ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground',
                      )}
                      aria-hidden="true"
                    />
                    {item.name}
                  </a>
                </motion.div>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-sidebar-border p-4">
          <UserInfo />
        </div>
      </>
    </MotionConfig>
  );
}

export function Current() {
  const [location, setLocation] = useState('/client/1/dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const clientIdMatch = location.match(/\/client\/(\d+)/);
  const currentClientId = clientIdMatch ? clientIdMatch[1] : null;
  const clients = sampleClients;
  const currentClient = currentClientId
    ? clients.find((client) => client.id === Number(currentClientId))
    : undefined;

  const activeClientName = currentClient?.name || 'Client Workspaces';
  const activeClientInitials = currentClient ? getInitials(currentClient.name) : '??';
  const currentClientIndex = currentClientId
    ? clients.findIndex((client) => client.id === Number(currentClientId))
    : -1;
  const activeClientColor = currentClientIndex >= 0 ? getClientColor(currentClientIndex) : 'bg-purple-600';

  const getClientNav = (clientId: string) => {
    const baseNav = sampleUser.role === 'owner'
      ? clientNavigation(clientId)
      : clientNavigationRestricted(clientId);

    if (currentClient?.onboardingComplete) {
      return baseNav.filter((item) => item.name !== 'Onboarding');
    }
    return baseNav;
  };

  const globalNavigation = [
    ...workspaceNavigation,
    ...(sampleUser.role === 'owner'
      ? [
          { name: 'Send Notifications', href: '/send-notifications', icon: Send },
          { name: 'Admin Settings', href: '/admin', icon: Settings },
        ]
      : []),
  ];
  const navigation = currentClientId ? getClientNav(currentClientId) : globalNavigation;
  const sidebarContentProps = {
    navigation,
    location,
    setLocation,
    clients,
    currentClient,
    activeClientName,
    activeClientInitials,
    activeClientColor,
  };

  return (
    <div className="min-h-screen">
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

      <div className="hidden md:flex min-h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
          <img src={logo} alt="EventHQ" className="h-8 w-auto" />
        </div>
        <SidebarContent {...sidebarContentProps} />
      </div>
    </div>
  );
}
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
  ChevronDown,
  Sparkles,
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

interface NavigationItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  special?: boolean;
}

const sampleUser: User = {
  firstName: 'Jordan',
  lastName: 'Lee',
  email: 'jordan.lee@eventhq.com',
  role: 'owner',
};

const sampleClients: Client[] = [{
  id: 1,
  name: 'Brightline Events',
  niche: 'Events',
  headshot: null,
  onboardingComplete: false,
}];

const workspaceNavigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Client Workspaces', href: '/clients', icon: Users },
  { name: 'Notifications', href: '/notifications', icon: Bell },
];

const clientNavigation = (clientId: string): NavigationItem[] => [
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

const clientNavigationRestricted = (clientId: string): NavigationItem[] =>
  clientNavigation(clientId).filter((item) => item.name !== 'Client Profile');

const clientColors = ['bg-purple-600', 'bg-pink-600', 'bg-orange-600', 'bg-green-600', 'bg-blue-600'];

function getClientColor(index: number) {
  return clientColors[index % clientColors.length];
}

function getInitials(name: string) {
  return name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase();
}

function UserInfo() {
  const displayName = `${sampleUser.firstName} ${sampleUser.lastName}`;
  const initials = `${sampleUser.firstName[0]}${sampleUser.lastName[0]}`.toUpperCase();

  return (
    <div className="flex items-center">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
        {sampleUser.profileImageUrl ? <img src={sampleUser.profileImageUrl} alt={displayName} className="h-full w-full rounded-full object-cover" /> : initials}
      </div>
      <div className="ml-3 min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{displayName}</p>
        <p className="text-xs text-sidebar-foreground/50">Owner</p>
      </div>
      <button
        onClick={() => {}}
        className="ml-2 rounded-md p-1.5 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        title="Log out"
        aria-label="Log out"
        data-testid="button-logout"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

interface SidebarContentProps {
  navigation: NavigationItem[];
  location: string;
  setLocation: (path: string) => void;
  clients: Client[];
  currentClient?: Client;
  activeClientName: string;
  activeClientInitials: string;
  activeClientColor: string;
  onNavClick?: () => void;
}

function NavLink({ item, active, navigate }: { item: NavigationItem; active: boolean; navigate: (path: string) => void }) {
  const Icon = item.icon;
  return (
    <motion.a
      href={item.href}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      onClick={(event) => { event.preventDefault(); navigate(item.href); }}
      className={cn(
        'group flex min-h-9 items-center rounded-md px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        item.special
          ? active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'bg-sidebar-primary/15 font-semibold text-sidebar-primary hover:bg-sidebar-primary/25'
          : active ? 'bg-sidebar-primary font-semibold text-sidebar-primary-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      )}
      aria-current={active ? 'page' : undefined}
      data-testid={item.special ? 'nav-talk-to-tuck' : undefined}
    >
      <Icon className={cn('mr-3 h-[17px] w-[17px] shrink-0', item.special || active ? 'text-sidebar-primary' : 'text-sidebar-foreground/45 group-hover:text-sidebar-accent-foreground')} aria-hidden="true" />
      <span className="truncate">{item.name}</span>
      {item.special && <Sparkles className="ml-auto h-3.5 w-3.5" aria-hidden="true" />}
    </motion.a>
  );
}

function SidebarContent({
  navigation, location, setLocation, clients, currentClient, activeClientName, activeClientInitials, activeClientColor, onNavClick,
}: SidebarContentProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ plan: true, measure: false, setup: false });
  const navigate = (path: string) => { setLocation(path); onNavClick?.(); };
  const isActive = (href: string) => location === href;
  const toggle = (group: string) => setOpenGroups((current) => ({ ...current, [group]: !current[group] }));
  const special = navigation.find((item) => item.special);
  const dashboard = navigation.find((item) => item.name === 'Workspace Dashboard');
  const workspaces = navigation.find((item) => item.name === 'Client Workspaces');
  const groups = [
    { key: 'plan', label: 'Plan & build', items: navigation.filter((item) => ['Onboarding', 'Marketing Calendar', 'Event Builder'].includes(item.name)) },
    { key: 'measure', label: 'Track performance', items: navigation.filter((item) => ['Live Sales Feed', 'Event Tracker', 'Webinar Tracker', 'Projections'].includes(item.name)) },
    { key: 'setup', label: 'Workspace', items: navigation.filter((item) => ['Training Lab', 'Assets', 'Notifications', 'Client Profile'].includes(item.name)) },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="mb-4 h-12 w-full justify-between border-sidebar-border bg-sidebar-accent/30 px-3 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" data-testid="dropdown-context-switcher">
                <div className="flex min-w-0 items-center text-left">
                  <div className={cn('mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white', activeClientColor)}>{activeClientInitials}</div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-semibold leading-none">{activeClientName}</span>
                    <span className="mt-1 text-[10px] leading-none text-sidebar-foreground/55">{currentClient ? 'Client workspace' : 'Choose a workspace'}</span>
                  </div>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Client workspaces</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigate('/clients')} className="cursor-pointer" data-testid="dropdown-item-all-clients"><Users className="mr-2 h-4 w-4" />All clients</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Open a workspace</DropdownMenuLabel>
              {clients.length === 0 ? <DropdownMenuItem disabled>No client workspaces yet</DropdownMenuItem> : clients.map((client, index) => (
                <DropdownMenuItem key={client.id} onClick={() => navigate(`/client/${client.id}/dashboard`)} className="cursor-pointer" data-testid={`dropdown-item-client-${client.id}`}>
                  <div className={cn('mr-2 flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white', getClientColor(index))}>{getInitials(client.name)}</div>{client.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <nav aria-label="Primary navigation" className="space-y-1">
            {dashboard && <NavLink item={dashboard} active={isActive(dashboard.href)} navigate={navigate} />}
            {!currentClient && navigation.filter((item) => item.name !== 'Dashboard').map((item) => <NavLink key={item.name} item={item} active={isActive(item.href)} navigate={navigate} />)}
            {currentClient && workspaces && <NavLink item={workspaces} active={isActive(workspaces.href)} navigate={navigate} />}
            {currentClient && special && <div className="my-3"><NavLink item={special} active={isActive(special.href)} navigate={navigate} /></div>}
            {currentClient && groups.map((group) => group.items.length > 0 && (
              <div key={group.key} className="pt-3">
                <button type="button" onClick={() => toggle(group.key)} className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/40 hover:text-sidebar-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring" aria-expanded={openGroups[group.key]}>
                  {group.label}<ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !openGroups[group.key] && '-rotate-90')} />
                </button>
                {openGroups[group.key] && <div className="mt-1 space-y-1">{group.items.map((item) => <NavLink key={item.name} item={item} active={isActive(item.href)} navigate={navigate} />)}</div>}
              </div>
            ))}
          </nav>
        </div>
        <div className="border-t border-sidebar-border p-4"><UserInfo /></div>
      </>
    </MotionConfig>
  );
}

export function Refined() {
  const [location, setLocation] = useState('/client/1/dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentClientId = location.match(/\/client\/(\d+)/)?.[1] ?? null;
  const clients = sampleClients;
  const currentClient = currentClientId ? clients.find((client) => client.id === Number(currentClientId)) : undefined;
  const activeClientName = currentClient?.name || 'Client Workspaces';
  const activeClientInitials = currentClient ? getInitials(currentClient.name) : '??';
  const clientIndex = currentClientId ? clients.findIndex((client) => client.id === Number(currentClientId)) : -1;
  const activeClientColor = clientIndex >= 0 ? getClientColor(clientIndex) : 'bg-purple-600';
  const navigation = currentClientId
    ? (sampleUser.role === 'owner' ? clientNavigation(currentClientId) : clientNavigationRestricted(currentClientId)).filter((item) => !currentClient?.onboardingComplete || item.name !== 'Onboarding')
    : [
        ...workspaceNavigation,
        { name: 'Send Notifications', href: '/send-notifications', icon: Send },
        { name: 'Admin Settings', href: '/admin', icon: Settings },
      ];
  const sidebarProps = { navigation, location, setLocation, clients, currentClient, activeClientName, activeClientInitials, activeClientColor };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 md:hidden">
        <img src={logo} alt="EventHQ" className="h-7 w-auto" />
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} className="text-sidebar-foreground" data-testid="button-mobile-menu" aria-label="Open navigation"><Menu className="h-6 w-6" /></Button>
      </div>
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader className="border-b border-sidebar-border px-6 py-4"><SheetTitle><img src={logo} alt="EventHQ" className="h-7 w-auto" /></SheetTitle></SheetHeader>
          <div className="flex h-[calc(100%-60px)] flex-col"><SidebarContent {...sidebarProps} onNavClick={() => setMobileMenuOpen(false)} /></div>
        </SheetContent>
      </Sheet>
      <aside className="hidden min-h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-16 items-center border-b border-sidebar-border px-6"><img src={logo} alt="EventHQ" className="h-8 w-auto" /></div>
        <SidebarContent {...sidebarProps} />
      </aside>
    </div>
  );
}
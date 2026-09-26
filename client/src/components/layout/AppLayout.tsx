import { ReactNode } from "react";
import { useParams, useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { TuckBubble } from "@/components/TuckBubble";
import { PageMotion } from "@/components/PageMotion";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  mode?: "agency" | "client";
  showSearch?: boolean;
  pageContext?: string;
}

export function AppLayout({ children, title = "EventHQ", mode = "client", showSearch = false, pageContext }: AppLayoutProps) {
  const params = useParams<{ id?: string }>();
  const [location] = useLocation();

  const clientId = params.id;
  const isOnTuckPage = location.includes("/tuck");

  return (
    <div className="flex min-h-screen md:h-screen overflow-hidden bg-background pt-14 md:pt-0">
      <Sidebar mode={mode} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} showSearch={showSearch} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <PageMotion key={location}>{children}</PageMotion>
        </main>
      </div>
      {mode === "client" && clientId && !isOnTuckPage && (
        <TuckBubble clientId={clientId} pageContext={pageContext || title} />
      )}
    </div>
  );
}

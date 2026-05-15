import "../../styles/dashboard.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import Sidebar from "@/components/Sidebar";
import SaaSAgent from "@/components/SaaSAgent";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="db-shell">
        <Sidebar />
        <div className="db-main-wrapper flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          <MobileTopBar />
          <main className="db-main flex-1 overflow-y-auto pb-[120px] md:pb-0">
            {children}
          </main>
          <MobileTabBar />
        </div>
        <SaaSAgent />
      </div>
    </ThemeProvider>
  );
}

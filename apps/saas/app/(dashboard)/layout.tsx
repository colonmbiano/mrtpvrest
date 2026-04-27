import "../../styles/dashboard.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import Sidebar from "@/components/Sidebar";
import SaaSAgent from "@/components/SaaSAgent";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="db-shell">
        <Sidebar />
        <main className="db-main">{children}</main>
        <SaaSAgent />
      </div>
    </ThemeProvider>
  );
}

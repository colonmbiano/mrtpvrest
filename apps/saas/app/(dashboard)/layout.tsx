import "../../styles/dashboard.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="db-shell">
        <Sidebar />
        <main className="db-main">{children}</main>
      </div>
    </ThemeProvider>
  );
}

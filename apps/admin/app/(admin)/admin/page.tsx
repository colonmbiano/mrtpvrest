import WarmtechDashboard from "@/components/mobile/WarmtechDashboard";
import ReportesIAPage from "./reportes/ia/page";

export default function AdminPage() {
  return (
    <>
      <div className="md:hidden"><WarmtechDashboard /></div>
      <div className="hidden md:block"><ReportesIAPage /></div>
    </>
  );
}

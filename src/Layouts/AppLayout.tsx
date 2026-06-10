import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";

const AppLayout = () => {
  return (
    <div className="min-h-screen bg-slate-50 lg:flex lg:items-start">
      <AppSidebar />
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;

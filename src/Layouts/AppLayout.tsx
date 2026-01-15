import { Outlet } from "react-router-dom";
import GlobalHeader from "@/components/GlobalHeader";

const AppLayout = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <GlobalHeader />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;

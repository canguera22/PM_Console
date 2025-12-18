import { createBrowserRouter } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import MeetingIntelligence from "./pages/MeetingIntelligence";
import ProductDocumentation from "./pages/ProductDocumentation";
import ReleaseCommunications from "./pages/ReleaseCommunications";
import Prioritization from "./pages/Prioritization";
import ProjectDashboard from "./pages/ProjectDashboard";
import NotFound from "./pages/NotFound";

const routes = [
  {
    path: "/",
    children: [
      {
        index: true,
        element: <Dashboard />,
      },
      {
        path: "dashboard",
        element: <ProjectDashboard />,
      },
      {
        path: "meetings",
        element: <MeetingIntelligence />,
      },
      {
        path: "documentation",
        element: <ProductDocumentation />,
      },
      {
        path: "releases",
        element: <ReleaseCommunications />,
      },
      {
        path: "prioritization",
        element: <Prioritization />,
      },
      {
        path: "*",
        element: <NotFound />,
      },
    ],
  },
];

const basename = (window as any).__APP_BASENAME__ || "/";
export const router = createBrowserRouter(routes, { basename });
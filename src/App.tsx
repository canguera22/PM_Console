import { RouterProvider } from "react-router-dom";
import "./index.css";
import { router } from "./routes";
import { ActiveProjectProvider } from "./contexts/ActiveProjectContext";

const App = () => {
  return (
    <ActiveProjectProvider>
      <div className="min-h-screen">
        <RouterProvider router={router} />
      </div>
    </ActiveProjectProvider>
  );
};

export default App;
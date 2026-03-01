import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import "./index.css";
import { router } from "./routes";
import { ActiveProjectProvider } from "./contexts/ActiveProjectContext";
import { AuthProvider } from "./contexts/AuthContext";

const App = () => {
  return (
    <AuthProvider>
      <ActiveProjectProvider>
        <div className="min-h-screen">
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors />
        </div>
      </ActiveProjectProvider>
    </AuthProvider>
  );
};

export default App;

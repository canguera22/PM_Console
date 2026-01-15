import { useNavigate } from 'react-router-dom';
import { Home, LayoutDashboard } from 'lucide-react';
import { ActiveProjectSelector } from '@/components/ActiveProjectSelector';
import Logo from '@/assets/branding/product_workbench_logo.png';

const GlobalHeader = () => {
  const navigate = useNavigate();

  return (
    <header className="bg-white border-b border-[#E5E7EB]">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        
        {/* LEFT: Logo */}
        <div
          className="flex items-center cursor-pointer"
          onClick={() => navigate('/')}
        >
          <img
            src={Logo}
            alt="Product Workbench"
            className="h-14 w-auto"
          />
        </div>

        {/* RIGHT: global navigation + project context */}
        <div className="flex items-center gap-3">
          
          {/* Home */}
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-md hover:bg-[#F3F4F6] transition-colors"
            aria-label="Home"
          >
            <Home className="h-5 w-5 text-muted-foreground hover:text-foreground" />
          </button>

          {/* Project Dashboard */}
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-md hover:bg-[#F3F4F6] transition-colors"
            aria-label="Project Dashboard"
          >
            <LayoutDashboard className="h-5 w-5 text-[#3B82F6]" />
          </button>

          {/* Active Project */}
          <ActiveProjectSelector />
        </div>
      </div>
    </header>
  );
};

export default GlobalHeader;

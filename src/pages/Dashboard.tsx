import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, FileCheck, Megaphone, ListOrdered, ArrowRight } from 'lucide-react';
import { ActiveProjectSelector } from '@/components/ActiveProjectSelector';

export default function Dashboard() {
  const navigate = useNavigate();

  const modules = [
    {
      id: 'project-dashboard',
      title: 'Project Dashboard',
      description: 'View all artifacts and outputs from all modules in a centralized dashboard',
      icon: FileCheck,
      status: 'active',
      available: true,
      path: '/dashboard',
      hasPMAdvisor: false,
    },
    {
      id: 'meetings',
      title: 'Meeting Intelligence',
      description: 'Process meeting transcripts into structured outputs with AI-powered analysis',
      icon: FileText,
      status: 'active',
      available: true,
      path: '/meetings',
      hasPMAdvisor: false,
    },
    {
      id: 'documentation',
      title: 'Product Documentation',
      description: 'Generate comprehensive product documentation from requirements and specs',
      icon: FileCheck,
      status: 'active',
      available: true,
      path: '/documentation',
      hasPMAdvisor: true,
    },
    {
      id: 'releases',
      title: 'Release Communications',
      description: 'Create customer-facing release notes and communication materials',
      icon: Megaphone,
      status: 'active',
      available: true,
      path: '/releases',
      hasPMAdvisor: true,
    },
    {
      id: 'prioritization',
      title: 'Backlog Prioritization',
      description: 'Calculate WSJF scores and rank your backlog using SAFe methodology',
      icon: ListOrdered,
      status: 'active',
      available: true,
      path: '/prioritization',
      hasPMAdvisor: false,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Hero Section */}
      <div className="border-b border-[#E5E7EB] bg-white">
        <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-8">
            <div className="max-w-3xl">
              <h1 className="text-[36px] font-bold tracking-tight text-[#111827]">
                PM Agent Operations Suite
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-[#6B7280]">
                AI-powered tools for product managers. Automate documentation, analyze meetings,
                and streamline your product operations workflow.
              </p>
            </div>
            <ActiveProjectSelector />
          </div>
        </div>
      </div>

      {/* Modules Grid */}
      <div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-[24px] font-semibold text-[#1F2937] mb-2">Available Modules</h2>
          <p className="text-sm text-[#6B7280]">
            Select a module to get started
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Card
                key={module.id}
                className={`group relative overflow-hidden transition-all duration-200 ${
                  module.available
                    ? 'cursor-pointer hover:border-[#3B82F6] hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] hover:-translate-y-0.5'
                    : 'cursor-not-allowed opacity-60'
                }`}
                onClick={() => module.available && navigate(module.path)}
              >
                <CardHeader className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#DBEAFE]">
                      <Icon className="h-7 w-7 text-[#3B82F6]" />
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge
                        variant={module.status === 'active' ? 'default' : 'secondary'}
                        className="text-xs font-medium"
                      >
                        {module.status === 'active' ? 'Active' : 'Coming Soon'}
                      </Badge>
                      {module.hasPMAdvisor && (
                        <Badge
                          variant="outline"
                          className="text-xs font-medium bg-[#DDD6FE] text-[#5B21B6] border-[#DDD6FE]"
                        >
                          PM Advisor
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardTitle className="mt-5 text-xl font-semibold text-[#111827]">
                    {module.title}
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm leading-relaxed text-[#6B7280]">
                    {module.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  {module.available && (
                    <div className="flex items-center text-sm font-semibold text-[#3B82F6] group-hover:underline">
                      Open module
                      <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
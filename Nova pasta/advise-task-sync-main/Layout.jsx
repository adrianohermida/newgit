import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PushNotificationPrompt from '@/components/notifications/PushNotificationPrompt';
import OfflineIndicator from '@/components/notifications/OfflineIndicator';
import NotificationBadge from '@/components/notifications/NotificationBadge';
import PWAInstallPrompt from '@/components/pwa/PWAInstallPrompt';
import {
  LayoutDashboard,
  FileText,
  Scale,
  CheckSquare,
  Settings,
  Menu,
  X,
  Moon,
  Sun,
  Activity,
  Zap,
  AlertCircle,
  Rocket,
  Smartphone,
  TrendingUp
} from 'lucide-react';



export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState('light');

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'light');
  };

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: 'Dashboard', ariaLabel: 'Ir para Dashboard' },
    { icon: FileText, label: 'Intimações', path: 'Intimacoes', ariaLabel: 'Ir para Intimações' },
    { icon: FileText, label: 'Publicações', path: 'PublicacoesAdvise', ariaLabel: 'Ir para Publicações' },
    { icon: Scale, label: 'Processos', path: 'ProcessosAdvise', ariaLabel: 'Ir para Processos' },
    { icon: CheckSquare, label: 'Tarefas', path: 'Tarefas', ariaLabel: 'Ir para Tarefas' },
    { icon: AlertCircle, label: 'Alertas', path: 'Alertas', ariaLabel: 'Ir para Alertas' },
    { icon: Settings, label: 'Integrações', path: 'Integracao', ariaLabel: 'Ir para Integrações' },
    { icon: Activity, label: 'API Pendências', path: 'APIPendencias', ariaLabel: 'Ir para Pendências de API' },
    { icon: Zap, label: 'iAPI — Monitoramentos', path: 'iAPI', ariaLabel: 'Ir para iAPI — Gestão de Monitoramentos' },
    { icon: Rocket, label: 'Sprints — Dashboard', path: 'SprintExecutionSummary', ariaLabel: 'Dashboard de Execução de Sprints' },
    { icon: Zap, label: 'Sprint 9 — Analytics', path: 'Sprint9Analytics', ariaLabel: 'Advanced Analytics & Reporting' },
    { icon: Activity, label: 'Executor Daily Log', path: 'ExecutorDailyLog', ariaLabel: 'Log diário de execução' },
    { icon: LayoutDashboard, label: 'Executor Dashboard', path: 'ExecutorSprintDashboard', ariaLabel: 'Dashboard consolidado de execução' },
    { icon: CheckSquare, label: 'Sprint 10 — Review', path: 'Sprint10Review', ariaLabel: 'Sprint 10 Review & Closure' },
    { icon: Rocket, label: 'Sprint 11 — Planning', path: 'Sprint11Planning', ariaLabel: 'Sprint 11 Planning & Execution' },
    { icon: Activity, label: 'Sprint 11 — Execution', path: 'Sprint11Execution', ariaLabel: 'Sprint 11 Live Execution Board' },
    { icon: Rocket, label: 'Sprint 15 — Execution', path: 'Sprint15Execution', ariaLabel: 'Sprint 15 Execution Board' },
    { icon: Zap, label: 'Sprint 15 — Features', path: 'Sprint15Features', ariaLabel: 'Sprint 15 Advanced Features Demo' },
    { icon: Smartphone, label: 'Mobile App', path: 'MobileApp', ariaLabel: 'Mobile App MVP' },
    { icon: Rocket, label: 'Sprint 16 — Planning', path: 'Sprint16Planning', ariaLabel: 'Sprint 16 Planning' },
    { icon: Activity, label: 'Sprint 16 — Execution', path: 'Sprint16Execution', ariaLabel: 'Sprint 16 Execution Board' },
    { icon: Rocket, label: 'Sprint 17 — Execution', path: 'Sprint17Execution', ariaLabel: 'Sprint 17 Execution Board' },
    { icon: CheckSquare, label: 'Sprint 18 — Final', path: 'Sprint18Execution', ariaLabel: 'Sprint 18 Final Sprint' },
    { icon: Zap, label: 'Sprint 19 — Production', path: 'Sprint19Execution', ariaLabel: 'Sprint 19 Production & Deploy' },
    { icon: Rocket, label: 'Sprint 20 — Execution', path: 'Sprint20Execution', ariaLabel: 'Sprint 20 Growth & Expansion' },
    { icon: TrendingUp, label: 'Sprint 21 — Execution', path: 'Sprint21Execution', ariaLabel: 'Sprint 21 Innovation Complete' },
    { icon: Zap, label: 'Sprint 22 — Planning', path: 'Sprint22Planning', ariaLabel: 'Sprint 22 Consolidation' }
  ];

  const isActive = (path) => currentPageName === path;

  return (
    <div className={`${theme === 'dark' ? 'dark' : ''}`}>
      <div className="bg-white dark:bg-[#081828] text-gray-900 dark:text-gray-50 transition-colors">
        {/* Mobile Header */}
        <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-[#081828] border-b border-gray-200 dark:border-slate-800 flex items-center justify-between px-4 z-50">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
          >
            {sidebarOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>

          <h1 className="text-lg font-bold">LegalPush</h1>

          <div className="flex items-center gap-2">
            <button
              aria-label="Notifications"
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg relative"
            >
              <NotificationBadge />
            </button>
            <button
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <aside
            className={`fixed md:relative left-0 top-0 h-screen w-64 bg-slate-50 dark:bg-[#0f1419] border-r border-gray-200 dark:border-slate-700 transition-all duration-300 z-40 ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
            }`}
            role="navigation"
            aria-label="Main navigation"
          >
            {/* Logo */}
            <div className="h-16 flex items-center justify-center border-b border-gray-200 dark:border-slate-800">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">LegalPush</h2>
            </div>

            {/* Menu Items */}
            <nav className="pt-6 space-y-2 px-4 bg-slate-50 dark:bg-[#0f1419]">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);

                return (
                  <Link
                    key={item.path}
                    to={createPageUrl(item.path)}
                    onClick={() => setSidebarOpen(false)}
                    aria-label={item.ariaLabel}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      active
                        ? 'bg-[#7E57FF] text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-slate-800">
              <button
                onClick={toggleTheme}
                className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-gray-700 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'light' ? (
                  <>
                    <Moon className="w-4 h-4" />
                    <span className="text-sm">Dark Mode</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-4 h-4" />
                    <span className="text-sm">Light Mode</span>
                  </>
                )}
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main
            className="flex-1 mt-16 md:mt-0 w-full bg-white dark:bg-[#081828] transition-colors"
            role="main"
            aria-label="Main content"
          >
            {children}
          </main>
        </div>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-30 mt-16"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* PWA Notifications & Install */}
        <OfflineIndicator />
        <PushNotificationPrompt />
        <PWAInstallPrompt />
      </div>
    </div>
  );
}
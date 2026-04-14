/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import APIDocumentation from './pages/APIDocumentation';
import APIPendencias from './pages/APIPendencias';
import APITesting from './pages/APITesting';
import Accessibility from './pages/Accessibility';
import AdviseIntegration from './pages/AdviseIntegration';
import Alertas from './pages/Alertas';
import AnaliseAdviseAPI from './pages/AnaliseAdviseAPI';
import AnalyticsDashboardPhase2 from './pages/AnalyticsDashboardPhase2';
import AuditModulosPlano from './pages/AuditModulosPlano';
import Dashboard from './pages/Dashboard';
import DashboardAnalytics from './pages/DashboardAnalytics';
import DashboardExecutivo from './pages/DashboardExecutivo';
import E2EAdviseTest from './pages/E2EAdviseTest';
import ExecutiveDashboard from './pages/ExecutiveDashboard';
import ExecutorDailyLog from './pages/ExecutorDailyLog';
import ExecutorDailyProgressTracker from './pages/ExecutorDailyProgressTracker';
import ExecutorSprintDashboard from './pages/ExecutorSprintDashboard';
import GerenciadorTickets from './pages/GerenciadorTickets';
import Integracao from './pages/Integracao';
import IntegracaoEscavador from './pages/IntegracaoEscavador';
import Intimacoes from './pages/Intimacoes';
import MobileApp from './pages/MobileApp';
import PWA from './pages/PWA';
import PWASetupGuide from './pages/PWASetupGuide';
import PerformanceMetrics from './pages/PerformanceMetrics';
import Processos from './pages/Processos';
import ProcessosAdvise from './pages/ProcessosAdvise';
import PublicacoesAdvise from './pages/PublicacoesAdvise';
import ReplicationGuide from './pages/ReplicationGuide';
import SincronizacaoPublicacoes from './pages/SincronizacaoPublicacoes';
import Sprint10Execution from './pages/Sprint10Execution';
import Sprint10Review from './pages/Sprint10Review';
import Sprint11Execution from './pages/Sprint11Execution';
import Sprint11Planning from './pages/Sprint11Planning';
import Sprint15Execution from './pages/Sprint15Execution';
import Sprint15Features from './pages/Sprint15Features';
import Sprint16Execution from './pages/Sprint16Execution';
import Sprint16Planning from './pages/Sprint16Planning';
import Sprint17Execution from './pages/Sprint17Execution';
import Sprint17Phase1Guide from './pages/Sprint17Phase1Guide';
import Sprint17Report from './pages/Sprint17Report';
import Sprint17Validation from './pages/Sprint17Validation';
import Sprint18Execution from './pages/Sprint18Execution';
import Sprint19RelatorioProjeto from './pages/Sprint19RelatorioProjeto';
import Sprint19Validation from './pages/Sprint19Validation';
import Sprint20Summary from './pages/Sprint20Summary';
import Sprint21Progress from './pages/Sprint21Progress';
import Sprint22Execution from './pages/Sprint22Execution';
import Sprint22Planning from './pages/Sprint22Planning';
import Sprint23Execution from './pages/Sprint23Execution';
import Sprint23ExecutionUpdated from './pages/Sprint23ExecutionUpdated';
import Sprint23Planning from './pages/Sprint23Planning';
import Sprint24Planning from './pages/Sprint24Planning';
import Sprint25Execution from './pages/Sprint25Execution';
import Sprint25Planning from './pages/Sprint25Planning';
import Sprint26Planning from './pages/Sprint26Planning';
import Sprint27Execution from './pages/Sprint27Execution';
import Sprint27Planning from './pages/Sprint27Planning';
import Sprint28E2EAdviseTest from './pages/Sprint28E2EAdviseTest';
import Sprint66Execution from './pages/Sprint66Execution';
import Sprint66Review from './pages/Sprint66Review';
import Sprint67Planning from './pages/Sprint67Planning';
import Sprint67Review from './pages/Sprint67Review';
import Sprint68Execution from './pages/Sprint68Execution';
import Sprint68Planning from './pages/Sprint68Planning';
import Sprint6Completion from './pages/Sprint6Completion';
import Sprint7Execution from './pages/Sprint7Execution';
import Sprint7Planning from './pages/Sprint7Planning';
import Sprint7Review from './pages/Sprint7Review';
import Sprint8Execution from './pages/Sprint8Execution';
import Sprint8ExecutorControl from './pages/Sprint8ExecutorControl';
import Sprint8Planning from './pages/Sprint8Planning';
import Sprint9Analytics from './pages/Sprint9Analytics';
import SprintDashboard from './pages/SprintDashboard';
import SprintExecutionReport from './pages/SprintExecutionReport';
import SprintExecutionSummary from './pages/SprintExecutionSummary';
import SprintGovernance from './pages/SprintGovernance';
import SprintReviewExecution from './pages/SprintReviewExecution';
import Tarefas from './pages/Tarefas';
import TesteAlertas from './pages/TesteAlertas';
import TesteFreshdesk from './pages/TesteFreshdesk';
import TesteIntimacoes from './pages/TesteIntimacoes';
import TesteProcessos from './pages/TesteProcessos';
import TesteSincronismoAdvise from './pages/TesteSincronismoAdvise';
import TestsAndValidation from './pages/TestsAndValidation';
import iAPI from './pages/iAPI';
import Sprint19Execution from './pages/Sprint19Execution';
import Sprint20Planning from './pages/Sprint20Planning';
import Sprint20Execution from './pages/Sprint20Execution';
import Sprint21Planning from './pages/Sprint21Planning';
import Sprint21Execution from './pages/Sprint21Execution';
import __Layout from './Layout.jsx';


export const PAGES = {
    "APIDocumentation": APIDocumentation,
    "APIPendencias": APIPendencias,
    "APITesting": APITesting,
    "Accessibility": Accessibility,
    "AdviseIntegration": AdviseIntegration,
    "Alertas": Alertas,
    "AnaliseAdviseAPI": AnaliseAdviseAPI,
    "AnalyticsDashboardPhase2": AnalyticsDashboardPhase2,
    "AuditModulosPlano": AuditModulosPlano,
    "Dashboard": Dashboard,
    "DashboardAnalytics": DashboardAnalytics,
    "DashboardExecutivo": DashboardExecutivo,
    "E2EAdviseTest": E2EAdviseTest,
    "ExecutiveDashboard": ExecutiveDashboard,
    "ExecutorDailyLog": ExecutorDailyLog,
    "ExecutorDailyProgressTracker": ExecutorDailyProgressTracker,
    "ExecutorSprintDashboard": ExecutorSprintDashboard,
    "GerenciadorTickets": GerenciadorTickets,
    "Integracao": Integracao,
    "IntegracaoEscavador": IntegracaoEscavador,
    "Intimacoes": Intimacoes,
    "MobileApp": MobileApp,
    "PWA": PWA,
    "PWASetupGuide": PWASetupGuide,
    "PerformanceMetrics": PerformanceMetrics,
    "Processos": Processos,
    "ProcessosAdvise": ProcessosAdvise,
    "PublicacoesAdvise": PublicacoesAdvise,
    "ReplicationGuide": ReplicationGuide,
    "SincronizacaoPublicacoes": SincronizacaoPublicacoes,
    "Sprint10Execution": Sprint10Execution,
    "Sprint10Review": Sprint10Review,
    "Sprint11Execution": Sprint11Execution,
    "Sprint11Planning": Sprint11Planning,
    "Sprint15Execution": Sprint15Execution,
    "Sprint15Features": Sprint15Features,
    "Sprint16Execution": Sprint16Execution,
    "Sprint16Planning": Sprint16Planning,
    "Sprint17Execution": Sprint17Execution,
    "Sprint17Phase1Guide": Sprint17Phase1Guide,
    "Sprint17Report": Sprint17Report,
    "Sprint17Validation": Sprint17Validation,
    "Sprint18Execution": Sprint18Execution,
    "Sprint19RelatorioProjeto": Sprint19RelatorioProjeto,
    "Sprint19Validation": Sprint19Validation,
    "Sprint20Summary": Sprint20Summary,
    "Sprint21Progress": Sprint21Progress,
    "Sprint22Execution": Sprint22Execution,
    "Sprint22Planning": Sprint22Planning,
    "Sprint23Execution": Sprint23Execution,
    "Sprint23ExecutionUpdated": Sprint23ExecutionUpdated,
    "Sprint23Planning": Sprint23Planning,
    "Sprint24Planning": Sprint24Planning,
    "Sprint25Execution": Sprint25Execution,
    "Sprint25Planning": Sprint25Planning,
    "Sprint26Planning": Sprint26Planning,
    "Sprint27Execution": Sprint27Execution,
    "Sprint27Planning": Sprint27Planning,
    "Sprint28E2EAdviseTest": Sprint28E2EAdviseTest,
    "Sprint66Execution": Sprint66Execution,
    "Sprint66Review": Sprint66Review,
    "Sprint67Planning": Sprint67Planning,
    "Sprint67Review": Sprint67Review,
    "Sprint68Execution": Sprint68Execution,
    "Sprint68Planning": Sprint68Planning,
    "Sprint6Completion": Sprint6Completion,
    "Sprint7Execution": Sprint7Execution,
    "Sprint7Planning": Sprint7Planning,
    "Sprint7Review": Sprint7Review,
    "Sprint8Execution": Sprint8Execution,
    "Sprint8ExecutorControl": Sprint8ExecutorControl,
    "Sprint8Planning": Sprint8Planning,
    "Sprint9Analytics": Sprint9Analytics,
    "SprintDashboard": SprintDashboard,
    "SprintExecutionReport": SprintExecutionReport,
    "SprintExecutionSummary": SprintExecutionSummary,
    "SprintGovernance": SprintGovernance,
    "SprintReviewExecution": SprintReviewExecution,
    "Tarefas": Tarefas,
    "TesteAlertas": TesteAlertas,
    "TesteFreshdesk": TesteFreshdesk,
    "TesteIntimacoes": TesteIntimacoes,
    "TesteProcessos": TesteProcessos,
    "TesteSincronismoAdvise": TesteSincronismoAdvise,
    "TestsAndValidation": TestsAndValidation,
    "iAPI": iAPI,
    "Sprint19Execution": Sprint19Execution,
    "Sprint20Planning": Sprint20Planning,
    "Sprint20Execution": Sprint20Execution,
    "Sprint21Planning": Sprint21Planning,
    "Sprint21Execution": Sprint21Execution,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};
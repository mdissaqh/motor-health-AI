import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import OverviewTab from './components/OverviewTab';
import DiagnoseTab from './components/DiagnoseTab';
import DiagnosticLabTab from './components/DiagnosticLabTab';
import VibrationTab from './components/VibrationTab';
import Motor3DTab from './components/Motor3DTab';
import ModelPerformanceTab from './components/ModelPerformanceTab';
import SampleFilesTab from './components/SampleFilesTab';
import ErrorBoundary from './components/ErrorBoundary';
import { api } from './api';

export default function App() {
  const getInitialTab = () => {
    const raw = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    const validDashboardTabs = ['overview', 'diagnose', 'lab', 'vibration', 'motor3d', 'performance', 'samples'];
    if (validDashboardTabs.includes(raw)) return raw;
    return 'landing'; // Default initial view is the new landing page
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [motors, setMotors] = useState([]);
  const [selectedMotorId, setSelectedMotorId] = useState('');
  const [runs, setRuns] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [backendHealth, setBackendHealth] = useState(null);

  const [selectedRun, setSelectedRun] = useState(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [notification, setNotification] = useState(null);

  // Sync activeTab with URL hash for browser history & direct URL support
  useEffect(() => {
    if (activeTab === 'landing') {
      if (window.location.hash && window.location.hash !== '#' && window.location.hash !== '#/' && window.location.hash !== '#/landing') {
        window.history.pushState(null, '', window.location.pathname);
      }
    } else {
      const targetHash = `#/${activeTab}`;
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
    }
  }, [activeTab]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const raw = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      const validDashboardTabs = ['overview', 'diagnose', 'lab', 'vibration', 'motor3d', 'performance', 'samples'];
      if (validDashboardTabs.includes(raw)) {
        setActiveTab(raw);
      } else if (!raw || raw === 'landing') {
        setActiveTab('landing');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const showToast = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  useEffect(() => {
    let ignore = false;

    async function fetchData() {
      try {
        try {
          const h = await api.getHealth();
          if (!ignore) setBackendHealth(h);
        } catch {
          if (!ignore) setBackendHealth({ status: 'OFFLINE' });
        }

        const motorsRes = await api.getMotors();
        if (!ignore && motorsRes.data) setMotors(motorsRes.data);

        const runsRes = await api.getDiagnosticRuns();
        if (!ignore && runsRes.data) {
          setRuns(runsRes.data);
          if (runsRes.data.length > 0) {
            setSelectedRun((prev) => prev || runsRes.data[runsRes.data.length - 1]);
          }
        }

        const woRes = await api.getWorkOrders();
        if (!ignore && woRes.data) {
          setWorkOrders(woRes.data);
          if (woRes.data.length > 0) {
            setSelectedWorkOrder((prev) => prev || woRes.data[woRes.data.length - 1]);
          }
        }
      } catch (err) {
        console.error('Initial data loading error:', err);
      }
    }

    fetchData();
    return () => {
      ignore = true;
    };
  }, []);

  // When a diagnosis finishes
  const handleDiagnosisComplete = (newRun, newWorkOrder) => {
    setRuns((prev) => [...prev, newRun]);
    setSelectedRun(newRun);

    if (newWorkOrder) {
      setWorkOrders((prev) => [...prev, newWorkOrder]);
      setSelectedWorkOrder(newWorkOrder);
      showToast(`Diagnosis completed: ${newRun.predicted_class || newRun.diagnostic_status}. Work order ${newWorkOrder.id} generated!`, 'success');
    } else {
      showToast(`Diagnosis completed: ${newRun.status_explanation || newRun.predicted_class}`, 'info');
    }

    setActiveTab('lab');
  };

  const handleSelectRun = (run) => {
    setSelectedRun(run);
    const linked = workOrders.find((w) => w.diagnostic_run_id === run.id);
    if (linked) setSelectedWorkOrder(linked);
    setActiveTab('lab');
  };

  const handleOpenWorkOrder = (wo) => {
    setSelectedWorkOrder(wo);
    showToast(`Work Order #${typeof wo === 'object' ? wo.id : wo} registered in system`, 'info');
  };

  const handleWorkOrderUpdated = (updatedWo) => {
    setWorkOrders((prev) =>
      prev.map((w) => (w.id === updatedWo.id ? updatedWo : w))
    );
    showToast(`Work order ${updatedWo.id} updated to ${updatedWo.status}`, 'success');
  };

  const activeLinkedWorkOrder = selectedRun
    ? workOrders.find((w) => w.diagnostic_run_id === selectedRun.id)
    : null;

  // Render Landing Page as standalone first page
  if (activeTab === 'landing') {
    return (
      <ErrorBoundary title="Motor Health AI">
        <LandingPage
          onGetStarted={() => setActiveTab('overview')}
          onStartDiagnosis={() => setActiveTab('overview')}
          backendHealth={backendHealth}
        />
      </ErrorBoundary>
    );
  }

  // Render Full Dashboard Layout
  return (
    <ErrorBoundary title="Motor Health AI Application">
      <div className={`app-layout-root ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
        {/* Collapsible Sidebar on Desktop / Drawer on Mobile */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          setMobileOpen={setMobileSidebarOpen}
        />

        {/* Main Application Area */}
        <div className="app-main-viewport">
          <Header
            activeTab={activeTab}
            onNavigateToDiagnose={() => setActiveTab('diagnose')}
            motors={motors}
            selectedMotorId={selectedMotorId}
            setSelectedMotorId={setSelectedMotorId}
            backendHealth={backendHealth}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          />

          {/* Floating Toast Notification */}
          {notification && (
            <div
              style={{
                position: 'fixed',
                top: '4.5rem',
                right: '1.5rem',
                zIndex: 1100,
                background: notification.type === 'success' ? '#065f46' : '#1e293b',
                color: '#fff',
                border: `1px solid ${notification.type === 'success' ? '#10b981' : '#38bdf8'}`,
                borderRadius: '8px',
                padding: '0.75rem 1.25rem',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                fontSize: '0.85rem',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                animation: 'modalIn 0.2s ease',
              }}
            >
              <span>{notification.type === 'success' ? '✓' : 'ℹ'}</span>
              <span>{notification.message}</span>
            </div>
          )}

          {/* Page Content Body */}
          <main className="main-content-scroll">
            <div className="content-inner-container">
              {activeTab === 'overview' && (
                <OverviewTab
                  runs={runs}
                  workOrders={workOrders}
                  motors={motors}
                  onSelectRun={handleSelectRun}
                  onNavigateToDiagnose={() => setActiveTab('diagnose')}
                />
              )}

              {activeTab === 'diagnose' && (
                <DiagnoseTab
                  motors={motors}
                  onDiagnosisComplete={handleDiagnosisComplete}
                />
              )}

              {activeTab === 'lab' && (
                <DiagnosticLabTab
                  selectedRun={selectedRun}
                  linkedWorkOrder={activeLinkedWorkOrder}
                  onNavigateToDiagnose={() => setActiveTab('diagnose')}
                  onNavigateTo3D={() => setActiveTab('motor3d')}
                  onOpenWorkOrder={handleOpenWorkOrder}
                />
              )}

              {activeTab === 'vibration' && (
                <VibrationTab motors={motors} />
              )}

              {activeTab === 'motor3d' && (
                <Motor3DTab
                  selectedRun={selectedRun}
                  motors={motors}
                  onNavigateToDiagnose={() => setActiveTab('diagnose')}
                />
              )}

              {activeTab === 'performance' && (
                <ModelPerformanceTab />
              )}

              {activeTab === 'samples' && (
                <SampleFilesTab
                  onNavigateToDiagnose={() => setActiveTab('diagnose')}
                />
              )}
            </div>
          </main>

          {/* Premium Footer */}
          <footer className="app-main-footer">
            <div className="footer-content">
              <div>
                <strong style={{ color: '#073B78' }}>Motor Health AI</strong> — Motor Health Digital Diagnostic Lab
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span>MCSA Scientific DSP Engine Active</span>
                <span>•</span>
                <span>Excel Operating Specs Synchronized</span>
                <span>•</span>
                <span>Zero Mock Predictions</span>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </ErrorBoundary>
  );
}

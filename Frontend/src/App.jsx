import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import OverviewTab from './components/OverviewTab';
import DiagnoseTab from './components/DiagnoseTab';
import DiagnosticLabTab from './components/DiagnosticLabTab';
import MaintenanceTab from './components/MaintenanceTab';
import ModelPerformanceTab from './components/ModelPerformanceTab';
import VariableConditionTab from './components/VariableConditionTab';
import { api } from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [motors, setMotors] = useState([]);
  const [selectedMotorId, setSelectedMotorId] = useState('');
  const [runs, setRuns] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [backendHealth, setBackendHealth] = useState(null);

  const [selectedRun, setSelectedRun] = useState(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [notification, setNotification] = useState(null);

  const showToast = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
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

        const fixRes = await api.getFixtures();
        if (!ignore && fixRes.data) setFixtures(fixRes.data);
      } catch (err) {
        console.error('Data loading error:', err);
      }
    }

    fetchData();
    return () => {
      ignore = true;
    };
  }, []);

  // Handler when a diagnosis finishes
  const handleDiagnosisComplete = async (newRun, newWorkOrder) => {
    setRuns((prev) => [...prev, newRun]);
    setSelectedRun(newRun);

    if (newWorkOrder) {
      setWorkOrders((prev) => [...prev, newWorkOrder]);
      setSelectedWorkOrder(newWorkOrder);
      showToast(`Diagnosis completed: ${newRun.predicted_class || newRun.diagnostic_status}. Work order ${newWorkOrder.id} generated!`, 'success');
    } else {
      showToast(`Diagnosis completed: ${newRun.status_explanation}`, 'info');
    }

    // Automatically navigate to the Diagnostic Lab to see evidence
    setActiveTab('lab');
  };

  const handleSelectRun = (run) => {
    setSelectedRun(run);
    // Find if there is a linked work order
    const linked = workOrders.find((w) => w.diagnostic_run_id === run.id);
    if (linked) setSelectedWorkOrder(linked);
    setActiveTab('lab');
  };

  const handleOpenWorkOrder = (wo) => {
    setSelectedWorkOrder(wo);
    setActiveTab('maintenance');
  };

  const handleWorkOrderUpdated = (updatedWo) => {
    setWorkOrders((prev) =>
      prev.map((w) => (w.id === updatedWo.id ? updatedWo : w))
    );
    showToast(`Work order ${updatedWo.id} updated to ${updatedWo.status}`, 'success');
  };

  // Find linked work order for the currently inspected run
  const activeLinkedWorkOrder = selectedRun
    ? workOrders.find((w) => w.diagnostic_run_id === selectedRun.id)
    : null;

  return (
    <>
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        motors={motors}
        selectedMotorId={selectedMotorId}
        setSelectedMotorId={setSelectedMotorId}
        backendHealth={backendHealth}
      />

      {/* Floating Notification Toast */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '5rem',
          right: '2rem',
          zIndex: 1000,
          background: notification.type === 'success' ? '#065f46' : '#1e293b',
          color: '#fff',
          border: `1px solid ${notification.type === 'success' ? '#10b981' : '#38bdf8'}`,
          borderRadius: '8px',
          padding: '0.85rem 1.25rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          fontSize: '0.85rem',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          animation: 'modalIn 0.2s ease',
        }}>
          <span>{notification.type === 'success' ? '✓' : 'ℹ'}</span>
          {notification.message}
        </div>
      )}

      <main className="main-content">
        <div className="app-container">
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
              fixtures={fixtures}
              onDiagnosisComplete={handleDiagnosisComplete}
            />
          )}

          {activeTab === 'lab' && (
            <DiagnosticLabTab
              selectedRun={selectedRun}
              linkedWorkOrder={activeLinkedWorkOrder}
              onNavigateToDiagnose={() => setActiveTab('diagnose')}
              onOpenWorkOrder={handleOpenWorkOrder}
            />
          )}

          {activeTab === 'maintenance' && (
            <MaintenanceTab
              workOrders={workOrders}
              onWorkOrderUpdated={handleWorkOrderUpdated}
              selectedWorkOrder={selectedWorkOrder}
              setSelectedWorkOrder={setSelectedWorkOrder}
            />
          )}

          {activeTab === 'performance' && <ModelPerformanceTab />}

          {activeTab === 'variable' && (
            <VariableConditionTab onSelectRun={handleSelectRun} />
          )}
        </div>
      </main>

      {/* Professional Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '1.5rem 0',
        marginTop: 'auto',
        background: '#070a11',
        fontSize: '0.78rem',
        color: 'var(--text-dim)',
      }}>
        <div className="app-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <strong style={{ color: '#fff' }}>Motor Health AI</strong> — Scientific MCSA Condition Monitoring & Diagnostic Lab
          </div>
          <div>
            Built with React 19, Express.js Gateway & Python Scientific DSP Engine (NumPy/SciPy). Zero static mock results.
          </div>
        </div>
      </footer>
    </>
  );
}

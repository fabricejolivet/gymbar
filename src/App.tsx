import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './app/landing/LandingPage';
import { HomePage } from './app/home/HomePage';
import { TrainingPage } from './app/training/TrainingPage';
import { CountdownPage } from './app/training/CountdownPage';
import { LiveTrainingPage } from './app/training/LiveTrainingPage';
import { ReportPage } from './app/report/ReportPage';
import { StatsPage } from './app/stats/StatsPage';
import { SettingsPage } from './app/settings/SettingsPage';
import { ProfilePage } from './app/profile/ProfilePage';
import { CalibratePage } from './app/calibrate/CalibratePage';
import { initEKFStoreFromPreferences } from './state/ekfStore';
import { initBarStoreFromPreferences } from './state/barStore';

function App() {
  useEffect(() => {
    console.log('[App] Initializing user preferences from database');
    initEKFStoreFromPreferences();
    initBarStoreFromPreferences();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/training/countdown" element={<CountdownPage />} />
        <Route path="/training/live" element={<LiveTrainingPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/calibrate" element={<CalibratePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

import React, { useState, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import Header from './Header';
import Section1 from './Section1';
import Footer from './Footer';
import Chat from './Chat';
import Shop from './Shop';
import Dashboard from './Dashboard';
import LoginPage from './LoginPage';
import ErrorBoundary from './ErrorBoundary';

function ProtectedRoute({ children }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </>
  );
}

function App() {
  const location = useLocation();
  const [isChatVisible, setIsChatVisible] = useState(false);
  const showFooter = location.pathname !== '/chat';

  useEffect(() => {
    setIsChatVisible(location.pathname === '/chat');
  }, [location]);

  return (
    <ErrorBoundary>
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className={`flex-grow ${location.pathname !== '/' ? 'pt-[75px]' : ''}`}>
          <Routes>
            <Route path="/" element={<Section1 />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <div className={`fixed inset-0 bg-white ${isChatVisible ? 'block' : 'hidden'}`}>
                    <Chat isVisible={isChatVisible} />
                  </div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
        {showFooter && <Footer />}
      </div>
    </ErrorBoundary>
  );
}

export default App;
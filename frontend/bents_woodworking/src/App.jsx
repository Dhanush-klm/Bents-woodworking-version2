import React, { useState, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn, useUser } from '@clerk/clerk-react';
import Header from './Header';
import Section1 from './Section1';
import Footer from './Footer';
import Chat from './Chat';
import Shop from './Shop';
import Dashboard from './Dashboard';
import LoginPage from './LoginPage';
import ErrorBoundary from './ErrorBoundary';
import { v4 as uuidv4 } from 'uuid';

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
  const { user } = useUser();

  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  useEffect(() => {
    setIsChatVisible(location.pathname === '/chat');
  }, [location]);

  useEffect(() => {
    if (user) {
      // Load sessions from localStorage
      const storedSessions = JSON.parse(localStorage.getItem(`chatSessions-${user.id}`)) || [];
      setSessions(storedSessions);

      // Create a new session if there are no sessions or if the last session has conversations
      if (storedSessions.length === 0 || storedSessions[storedSessions.length - 1].conversations.length > 0) {
        handleNewSession();
      } else {
        setCurrentSessionId(storedSessions[storedSessions.length - 1].id);
      }
    }
  }, [user]);

  useEffect(() => {
    if (user && sessions.length > 0) {
      localStorage.setItem(`chatSessions-${user.id}`, JSON.stringify(sessions));
    }
  }, [user, sessions]);

  const handleSessionSelect = (sessionId) => {
    setCurrentSessionId(sessionId);
  };

  const handleNewSession = () => {
    const newSessionId = uuidv4();
    const newSession = { id: newSessionId, conversations: [] };
    setSessions(prevSessions => [...prevSessions, newSession]);
    setCurrentSessionId(newSessionId);
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col min-h-screen">
        <Header 
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSessionSelect={handleSessionSelect}
          onNewSession={handleNewSession}
        />
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
                    <Chat 
                      isVisible={isChatVisible}
                      sessions={sessions}
                      setSessions={setSessions}
                      currentSessionId={currentSessionId}
                      setCurrentSessionId={setCurrentSessionId}
                    />
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

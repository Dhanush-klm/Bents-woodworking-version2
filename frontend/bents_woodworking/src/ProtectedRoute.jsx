import React from 'react';
import { useUser } from '@clerk/clerk-react';
import { Navigate, Outlet } from 'react-router-dom';

const ProtectedRoute = () => {
  const { isSignedIn, isLoaded } = useUser();

  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  if (!isSignedIn) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
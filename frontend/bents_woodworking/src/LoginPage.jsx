import React from 'react';
import { SignIn } from '@clerk/clerk-react';
import { useNavigate, Link } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';

const LoginPage = () => {
    console.log("LoginPage rendered");
  const navigate = useNavigate();

  

  return (
    <ErrorBoundary>
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="p-8 bg-white rounded-lg shadow-md w-full max-w-md">
          <Link to="/" className="block text-center mb-6">
            <img 
              src="/bents-logo.jpg" 
              alt="Bent's Woodworking" 
              className="mx-auto h-16 w-auto"
            />
          </Link>
          <h1 className="mb-6 text-2xl font-bold text-center text-gray-800">Login to Bent's Woodworking Assistant</h1>
          <SignIn 
            routing="path" 
            path="/login" 
            signUpUrl="/signup"
            afterSignInUrl="/dashboard"
            redirectUrl="/dashboard"
          />
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link to="/signup" className="text-blue-600 hover:underline">Sign up</Link>
            </p>
          </div>
          <div className="mt-6 text-center">
            <Link to="/" className="text-sm text-gray-600 hover:underline">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default LoginPage;
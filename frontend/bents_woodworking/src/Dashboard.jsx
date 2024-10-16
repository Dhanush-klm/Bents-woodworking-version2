import React from 'react';
import { UserButton } from '@clerk/clerk-react';
import { useClerk } from '@clerk/clerk-react';

const Dashboard = () => {
    const { user } = useClerk();

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Welcome to Your Dashboard</h1>
      {user && (
        <div>
          <p>Hello, {user.firstName}!</p>
          <p>Email: {user.primaryEmailAddress?.emailAddress}</p>
          <h1>Welcome to your dashboard {user.firstName}</h1>
      <UserButton />
        </div>
      )}
    </div>
  );
};

export default Dashboard;
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, MessageCircle, Home, Menu, X, ChevronRight } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import bents_logo from "../public/bents-logo.jpg";
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
const Header = ({ sessions, currentSessionId, onSessionSelect, onNewSession }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isSignedIn, user } = useUser();
  const navigate = useNavigate();
  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };
  const menuItems = [
    { to: "/", icon: Home, text: "Home" },
    { to: "/chat", icon: MessageCircle, text: "Chat" },
    { to: "/shop", icon: ShoppingBag, text: "Shop" },
  ];
  const handleSessionSelect = (sessionId) => {
    onSessionSelect(sessionId);
    navigate('/chat');
    setIsMenuOpen(false);
  };
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      setIsMenuOpen(false);
    }
  };
  return (
    <header className="fixed top-0 left-0 right-0 bg-black text-white p-4 shadow-md z-50">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="flex items-center">
          <LazyLoadImage
            src={bents_logo}
            alt="Bent's Woodworking"
            width={100}
            height={50}
            effect="blur"
            className="max-h-12 w-auto"
          />
        </Link>
        <div className="flex items-center">
          <nav className="mr-4 flex items-center">
            <div className="hidden md:flex items-center">
              {isSignedIn ? (
                <UserButton afterSignOutUrl="/" />
              ) : (
                <SignInButton mode="modal">
                  <button className="bg-white text-black px-4 py-2 rounded hover:bg-gray-200">
                    Sign In
                  </button>
                </SignInButton>
              )}
            </div>
          </nav>
          <button
            className="text-white focus:outline-none"
            onClick={toggleMenu}
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>
      {/* Mobile menu / Sidebar */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50" 
          onClick={handleOverlayClick}
        >
          <div className="fixed top-0 left-0 h-full w-64 bg-white text-black transition-transform duration-300 ease-in-out transform translate-x-0">
            <div className="absolute inset-0 overflow-y-auto pb-16">
              <div className="p-4">
                <button onClick={toggleMenu} className="absolute top-4 right-4 text-black">
                  <X size={24} />
                </button>
                <ul className="mt-8">
                  {menuItems.map((item, index) => (
                    <li key={index} className="mb-4">
                      <Link
                        to={item.to}
                        className="flex items-center text-black hover:text-gray-600"
                        onClick={toggleMenu}
                      >
                        <item.icon className="mr-2" size={20} />
                        {item.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gray-100 border-t border-gray-200 p-4">
              {isSignedIn ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <UserButton afterSignOutUrl="/" />
                    <span className="ml-2 text-sm text-gray-700 truncate">
                      {user.primaryEmailAddress.emailAddress}
                    </span>
                  </div>
                </div>
              ) : (
                <SignInButton mode="modal">
                  <button className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 w-full">
                    Sign In
                  </button>
                </SignInButton>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
export default Header;

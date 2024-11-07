import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, MessageCircle, Home, Menu, X } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import bents_logo from "../public/bents-logo.jpg";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const menuItems = [
    { to: "/", icon: Home, text: "Home" },
    { to: "/chat", icon: MessageCircle, text: "Chat" },
    { to: "/shop", icon: ShoppingBag, text: "Shop" },
  ];

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      setIsMenuOpen(false);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 bg-black text-white p-4 shadow-md z-50">
      <div className="flex items-center justify-between px-4 max-w-[2000px] mx-auto">
        <div className="flex items-center">
          <button
            className="text-white focus:outline-none mr-4"
            onClick={() => setIsMenuOpen(true)}
          >
            <Menu size={24} />
          </button>
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
        </div>

        <div className="flex items-center space-x-4">
          <Link to="/chat" className="text-white hover:text-gray-300">
            <MessageCircle size={24} />
          </Link>
          <Link to="/shop" className="text-white hover:text-gray-300">
            <ShoppingBag size={24} />
          </Link>
        </div>
      </div>

      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50" 
          onClick={handleOverlayClick}
        >
          <div className="fixed top-0 left-0 h-full w-64 bg-white text-black transition-transform duration-300 ease-in-out transform translate-x-0">
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
        </div>
      )}
    </header>
  );
};

export default Header;

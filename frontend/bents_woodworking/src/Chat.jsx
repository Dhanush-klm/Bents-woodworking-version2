import React, { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import { ArrowRight, PlusCircle, HelpCircle, ChevronRight, BookOpen, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import YouTube from 'react-youtube';
import { Button } from "@/components/ui/button";
import { useUser } from '@clerk/clerk-react';
import { v4 as uuidv4 } from 'uuid';

// Function to extract YouTube video ID from URL
const getYoutubeVideoIds = (urls) => {
  if (!urls || urls.length === 0) return [];
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  return urls.map(url => {
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }).filter(id => id !== null);
};

// Replace the woodworkingFacts array with processingSteps
const processingSteps = [
  "Rewriting query",
  "Searching knowledge base",
  "Processing data",
  "Generating answer"
];

export default function Chat({ isVisible }) {
  const { isSignedIn, user } = useUser();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentConversation, setCurrentConversation] = useState([]);
  const [currentRelatedProducts, setCurrentRelatedProducts] = useState([]);
  const [currentSourceVideos, setCurrentSourceVideos] = useState([]); // Add this line
  const [conversationHistory, setConversationHistory] = useState({
    "bents": [],
    "shop-improvement": [],
    "tool-recommendations": []
  });
  const [showInitialQuestions, setShowInitialQuestions] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingQuestionIndex, setLoadingQuestionIndex] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState("bents");
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const latestConversationRef = useRef(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showCenterSearch, setShowCenterSearch] = useState(true);
  const [randomQuestions, setRandomQuestions] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const sidebarRef = useRef(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const dropdownRef = useRef(null);
  const [currentFactIndex, setCurrentFactIndex] = useState(0);
  const topOfConversationRef = useRef(null);
  const [shouldScrollToTop, setShouldScrollToTop] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Sort sessions using useMemo
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const aDate = a.conversations && a.conversations.length > 0 ? new Date(a.conversations[0].timestamp) : new Date(0);
      const bDate = b.conversations && b.conversations.length > 0 ? new Date(b.conversations[0].timestamp) : new Date(0);
      return bDate - aDate;
    });
  }, [sessions]);

  // Initial Setup Effect
  useEffect(() => {
    if (!isSignedIn) {
      navigate('/login');
      return;
    }

    const fetchSessions = async () => { 
      try {
        const response = await axios.get(`http://localhost:5002/api/get-session/${user.id}`);
        const storedSessions = response.data || [];
        setSessions(storedSessions);

        if (storedSessions.length === 0 || storedSessions[storedSessions.length - 1].conversations.length > 0) {
          const newSessionId = uuidv4();
          const newSession = { id: newSessionId, conversations: [] };
          setSessions([...storedSessions, newSession]);
          setCurrentSessionId(newSessionId);
        } else {
          setCurrentSessionId(storedSessions[storedSessions.length - 1].id);
        }
      } catch (error) {
        console.error("Error fetching sessions:", error);
      }
    };

    const fetchInitialData = async () => {
      try {
        const response = await axios.get('http://localhost:5002/api/random-questions');
        setRandomQuestions(response.data.map(q => q.question_text));
      } catch (error) {
        console.error("Error fetching random questions:", error);
      }
    };

    fetchSessions();
    fetchInitialData();
    setCurrentConversation([]);
    setCurrentRelatedProducts([]);
    setShowInitialQuestions(true);
    setShowCenterSearch(true);
  }, [isSignedIn, user, navigate]);

  // Save sessions effect
  useEffect(() => {
    const saveSessions = async () => {
      if (isSignedIn && sessions.length > 0 && user) {
        try {
          const optimizedSessions = sessions.map(session => ({
            id: session.id,
            conversations: session.conversations.map(conv => ({
              question: conv.question,
              text: conv.text,
              video: conv.video || [],
              videoLinks: conv.videoLinks || {},
              timestamp: conv.timestamp
            }))
          }));

          await axios.post('http://localhost:5002/api/save-session', {
            userId: user.id,
            sessionData: optimizedSessions
          });
        } catch (error) {
          console.error("Error saving sessions:", error);
        }
      }
    };

    saveSessions();
  }, [sessions, isSignedIn, user]);

  // Scroll effect
  useEffect(() => {
    if (shouldScrollToTop && topOfConversationRef.current) {
      topOfConversationRef.current.scrollIntoView({ behavior: 'smooth' });
      setShouldScrollToTop(false);
    }
  }, [shouldScrollToTop]);

  // Click outside effects
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
      if (isSidebarOpen && sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        setIsSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSidebarOpen]);

  // Update the handleSearch function
  const handleSearch = async (e, index) => {
    e.preventDefault();
    const query = index !== undefined ? randomQuestions[index] : searchQuery;
    if (!query.trim() || isSearching) return;
    
    setIsSearching(true);
    setIsLoading(true);
    setLoadingProgress(0);
    if (index !== undefined) setLoadingQuestionIndex(index);
    setShowInitialQuestions(false);
    setShowCenterSearch(false);

    // Scroll to top before starting the search
    if (topOfConversationRef.current) {
      topOfConversationRef.current.scrollIntoView({ behavior: 'smooth' });
    }

    // Progress interval
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 1;
      });
    }, 150); // Adjust timing as needed

    try {
      const response = await axios.post('http://localhost:5002/chat', {
        message: query,
        selected_index: selectedIndex,
        chat_history: currentConversation.flatMap(conv => [conv.question, conv.initial_answer || conv.text])
      }, {
        timeout: 60000
      });
      
      // Store conversation
      const newConversation = {
        question: query,
        text: response.data.response,
        initial_answer: response.data.initial_answer,
        video: response.data.urls || [],
        video_titles: response.data.video_titles || [],
        video_timestamps: response.data.video_timestamps || {},
        videoLinks: response.data.video_links || {},
        timestamp: new Date().toISOString()
      };
      
      // Process and store products
      const simplifiedProducts = (response.data.related_products || []).map(product => ({
        title: product.title,
        link: product.link
      }));
      setCurrentRelatedProducts(simplifiedProducts);

      // Process and store source videos with titles and timestamps
      const sourceVideos = response.data.urls ? response.data.urls.map(url => ({
        url,
        title: response.data.video_titles?.[url] || 'Video',
        timestamp: response.data.video_timestamps?.[url] || null
      })) : [];
      setCurrentSourceVideos(sourceVideos);

      // Process and store tags
      const tags = response.data.tags || [];  // Assuming your API returns tags
      setCurrentTags(tags);

      setCurrentConversation(prev => [...prev, newConversation]);
      
      // Update sessions without the sidebar content
      setSessions(prevSessions => {
        return prevSessions.map(session => {
          if (session.id === currentSessionId) {
            return {
              ...session,
              conversations: [...session.conversations, newConversation]
            };
          }
          return session;
        });
      });

      setSearchQuery("");
    } catch (error) {
      console.error("Error fetching response:", error);
    } finally {
      clearInterval(progressInterval);
      setIsLoading(false);
      setLoadingQuestionIndex(null);
      setIsSearching(false);
      setLoadingProgress(0);
    }
  };

  // Helper function to extract video title from URL (you'll need to implement this)
  const extractVideoTitle = (url) => {
    // This is a placeholder. Implement according to your needs
    return `Video ${Math.floor(Math.random() * 1000)}`;
  };

  // Handle new conversation
  const handleNewConversation = () => {
    const newSessionId = uuidv4();
    const newSession = { id: newSessionId, conversations: [] };
    setSessions(prevSessions => [...prevSessions, newSession]);
    setCurrentSessionId(newSessionId);
    setCurrentConversation([]);
    setCurrentRelatedProducts([]);
    setShowInitialQuestions(true);
    setShowCenterSearch(true);
  };

  const handleSectionChange = (newIndex) => {
    setSelectedIndex(newIndex);
    setIsDropdownOpen(false);
    setCurrentConversation([]);
    setSelectedConversation(null);
    setCurrentRelatedProducts([]);
    setShowInitialQuestions(true);
    setShowCenterSearch(true);
  };

  // Update the renderRelatedProducts function
  const renderRelatedProducts = () => {
    if (!currentRelatedProducts.length) return null;

    return (
      <div className="mt-4 border-t pt-4">
        {/* Products Carousel - Smaller and without title */}
        {currentRelatedProducts.length > 0 && (
          <div className="mb-4">
            <div className="overflow-x-auto">
              <div className="flex space-x-3 pb-3">
                {currentRelatedProducts.map((product, index) => (
                  <a
                    key={index}
                    href={product.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 w-48 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-blue-600 hover:text-blue-800 line-clamp-2 text-sm">{product.title}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Rest of the content remains unchanged */}
        <h3 className="text-lg font-semibold mb-3">Recommended Videos</h3>
        {/* Source Videos Section - unchanged */}
        {currentSourceVideos && currentSourceVideos.length > 0 && (
          <div className="border rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-3">Source</h4>
            <div className="space-y-3">
              {currentSourceVideos.map((video, index) => (
                <div key={index} className="flex flex-col">
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <div className="flex items-start space-x-2">
                      <span className="text-blue-600 group-hover:text-blue-800 flex-grow">
                        {video.title || "5 Modifications I Made In My Garage Shop - New Shop Part 5"}
                      </span>
                      {video.timestamp && (
                        <span className="text-sm text-gray-500 whitespace-nowrap">
                          {`(${formatTimestamp(video.timestamp)})`}
                        </span>
                      )}
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Add new state variables at the top with other state declarations
  const [currentTags, setCurrentTags] = useState([]);
  const renderVideos = (videos, videoLinks) => {
    let videoIds = new Set();
    if (videos && videos.length > 0) {
      getYoutubeVideoIds(videos).forEach(id => videoIds.add(id));
    }
    if (videoLinks) {
      Object.values(videoLinks).flat().forEach(url => {
        const id = getYoutubeVideoIds([url])[0];
        if (id) videoIds.add(id);
      });
    }

    if (videoIds.size > 0) {
      const opts = {
        height: '160',
        width: '250',
        playerVars: {
          autoplay: 0,
          modestbranding: 1,
          rel: 0
        },
      };

      return (
        <div className="relative w-full">
          <div className="overflow-x-auto pb-4 hide-scrollbar">
            <div className="flex space-x-4 min-w-min">
              {Array.from(videoIds).map((videoId) => (
                <div key={videoId} className="flex-shrink-0">
                  <YouTube videoId={videoId} opts={opts} />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const formatResponse = (text, videoLinks) => {
    let formattedText = text;

    if (videoLinks) {
      formattedText = text.replace(/\[video(\d+)\]/g, (match, p1) => {
        const links = videoLinks[`[video${p1}]`];
        if (links && links.length > 0) {
          const firstLink = links[0];
          return `<a href="${firstLink}" target="_blank" rel="noopener noreferrer" class="video-link text-blue-500 hover:underline">Video</a>`;
        }
        return match;
      });
    }
    
    formattedText = formattedText.replace(
      /(\d+)\.\s*\*\*(.*?)\*\*(:?)\s*([-\s]*)(.+)/g,
      (match, number, title, colon, dash, content) => {
        return `<div class="font-bold mt-2 mb-1">${number}. ${title}${colon}</div><div class="ml-4">${dash}${content}</div>`;
      }
    );
    
    formattedText = formattedText.replace(/\*\*\*\*timestamp\*\*\*\*\s*(\[video\d+\])/g, '$1');
    formattedText = formattedText.replace(/^(\#{1,6})\s*\*\*(.*?)\*\*/gm, '$1 <strong>$2</strong>');
    
    return <div dangerouslySetInnerHTML={{ __html: formattedText }} />;
  };

  const renderSearchBar = () => (
    <div className="flex items-center w-full">
      <div className="flex-grow flex items-center border rounded-md bg-white shadow-sm">
        <Button
          onClick={handleNewConversation}
          className="p-2 text-gray-500 hover:text-gray-700 focus:outline-none"
          title="New Conversation"
        >
          <PlusCircle size={20} />
        </Button>
        <div className="relative" ref={dropdownRef}>
          <Button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="p-2 text-gray-500 hover:text-gray-700 focus:outline-none"
          >
            <HelpCircle size={20} />
          </Button>
          {isDropdownOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
              <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                {[
                  { value: "bents", label: "All" },
                  { value: "shop-improvement", label: "Shop Improvement" },
                  { value: "tool-recommendations", label: "Tool Recommendations" }
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSectionChange(option.value)}
                    className={`block px-4 py-2 text-sm w-full text-left ${
                      selectedIndex === option.value
                        ? "bg-blue-500 text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="h-6 w-px bg-gray-300 mx-2"></div>
        
        <form onSubmit={handleSearch} className="flex-grow flex items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ask a question..."
            className="flex-grow p-2 focus:outline-none"
          />
          <button
            type="submit"
            className={`p-2 text-gray-500 hover:text-gray-700 focus:outline-none ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={isLoading}
          >
            {isLoading ? <span className="animate-spin">⌛</span> : <ArrowRight size={20} />}
          </button>
        </form>
      </div>
    </div>
  );

  const renderSidebar = () => (
    <>
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setIsSidebarOpen(false)}></div>
      )}
      <div 
        ref={sidebarRef}
        className={`fixed top-0 left-0 h-full w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 h-full overflow-y-auto">
          <button onClick={() => setIsSidebarOpen(false)} className="absolute top-4 right-4 z-10">
            <X size={24} />
          </button>
          <h2 className="text-xl font-bold mb-4 mt-8">Sessions</h2>
          {sortedSessions.map((session) => (
            <div
              key={session.id}
              className={`cursor-pointer hover:bg-gray-100 p-2 rounded mb-2 ${
                session.id === currentSessionId ? 'bg-gray-100' : ''
              }`}
              onClick={() => {
                setCurrentSessionId(session.id);
                setCurrentConversation(session.conversations || []);
                setShowInitialQuestions(false);
                setShowCenterSearch(false);
                setIsSidebarOpen(false);
                setCurrentRelatedProducts([]); // Reset related products when switching sessions
              }}
            >
              {session.conversations && session.conversations.length > 0 ? (
                <p className="text-sm truncate">{session.conversations[0].question}</p>
              ) : (
                <p className="text-sm italic text-gray-500">Empty session</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );

  // Update the renderLoadingFact function
  const renderLoadingFact = () => {
    const currentStep = Math.floor((loadingProgress / 100) * 4);
    
    return (
      <div className="w-full max-w-xl mx-auto my-4 bg-white rounded-lg border shadow-sm">
        <div className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Processing Your Query</h3>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            </div>
            
            {/* Progress steps */}
            <div className="space-y-3">
              {processingSteps.map((step, index) => (
                <div key={index} className="relative">
                  <div className="flex items-center space-x-3">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center
                      ${index <= currentStep ? 'bg-blue-500' : 'bg-gray-200'}`}>
                      {index < currentStep && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm ${index <= currentStep ? 'text-gray-900' : 'text-gray-500'}`}>
                      {step}
                    </span>
                    {index === currentStep && (
                      <span className="text-sm text-blue-500 ml-2">
                        {Math.min(Math.max(((loadingProgress % 25) * 4), 0), 100)}%
                      </span>
                    )}
                  </div>
                  {index < processingSteps.length - 1 && (
                    <div className={`absolute left-2 ml-[-1px] w-0.5 h-3 ${
                      index < currentStep ? 'bg-blue-500' : 'bg-gray-200'
                    }`} style={{ top: '100%' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderConversation = (conv, index) => (
    <div 
      key={index} 
      className="bg-white p-4 rounded-lg shadow mb-4"
      ref={index === currentConversation.length - 1 ? latestConversationRef : null}
    >
      <h2 className="font-bold mb-4">{conv.question}</h2>
      
      {/* Products Carousel */}
      {index === currentConversation.length - 1 && currentRelatedProducts.length > 0 && (
        <div className="mb-6">
          <div className="overflow-x-auto custom-scrollbar">
            <div className="flex gap-3 pb-2 px-1">
              {currentRelatedProducts.map((product, index) => (
                <a
                  key={index}
                  href={product.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 w-44 p-3 border rounded-lg hover:bg-gray-50 transition-all duration-200 
                           shadow-sm hover:shadow-md transform hover:-translate-y-0.5 bg-white"
                >
                  <span className="text-gray-900 hover:text-gray-700 line-clamp-2 text-sm font-medium">
                    {product.title}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Video Players */}
      <div className="mb-4">
        {renderVideos(conv.video, conv.videoLinks)}
        {formatResponse(conv.text || '', conv.videoLinks)}
      </div>

      {/* Source Videos Section */}
      {index === currentConversation.length - 1 && (
        <div className="mt-4 border-t pt-4">
          <h3 className="text-lg font-semibold mb-3">Recommended Videos</h3>
          <div className="border rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-3">Source</h4>
            <div className="space-y-4">
              {conv.video && conv.video.map((url, idx) => (
                <div key={idx} className="flex flex-col">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <div className="flex flex-col">
                      <span className="text-blue-600 group-hover:text-blue-800">
                        {conv.video_titles?.[idx] || 'Video'}
                      </span>
                      {conv.video_timestamps?.[idx] && (
                        <span className="text-sm text-gray-500 mt-1">
                          timestamp at: {conv.video_timestamps[idx].toFixed(2)}
                        </span>
                      )}
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="clear-both"></div>
    </div>
  );

  // Update the scroll effect to use the latest conversation ref
  useEffect(() => {
    if (latestConversationRef.current) {
      latestConversationRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    }
  }, [currentConversation.length]); // This will trigger when a new conversation is added

  // Main render
  if (!isSignedIn) {
    return null;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-75px)] bg-white pt-[75px]">
      {renderSidebar()}
      <div className="relative flex-grow overflow-hidden">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="fixed top-[85px] left-4 z-30 bg-white px-4 py-2 rounded-full shadow-md hover:bg-gray-100 transition-colors duration-200 flex items-center space-x-2"
          title="Open Sessions"
        >
          <BookOpen size={20} />
          <span className="font-medium">History</span>
        </button>
        
        <div className="h-full overflow-y-auto p-4 pt-16 pb-20">
          <div ref={topOfConversationRef}></div>
          {currentConversation.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <h2 className="text-3xl font-bold mb-8">A question creates knowledge</h2>

              <div className="w-full max-w-3xl mb-8">
                {renderSearchBar()}
              </div>

              {showInitialQuestions && !isLoading && (
                <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {randomQuestions.map((question, index) => (
                    <button
                      key={index}
                      onClick={(e) => handleSearch(e, index)}
                      className="p-4 border rounded-lg hover:bg-gray-100 text-center h-full flex items-center justify-center transition-colors duration-200 ease-in-out"
                      disabled={isSearching || isLoading}
                    >
                      <span>{question}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              {currentConversation.map((conv, index) => renderConversation(conv, index))}
            </div>
          )}
          {isLoading && renderLoadingFact()}
        </div>
        
        {currentConversation.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 flex justify-center p-4 bg-white border-t border-gray-200">
            <div className="w-full max-w-3xl">
              {renderSearchBar()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Update the formatTimestamp function to be more descriptive
const formatTimestamp = (seconds) => {
  if (!seconds && seconds !== 0) return '';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// Add these styles to your CSS
const styles = `
  .hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  
  .hide-scrollbar::-webkit-scrollbar {
    display: none;
  }
  
  @media (max-width: 640px) {
    .overflow-x-auto {
      -webkit-overflow-scrolling: touch;
      scroll-snap-type: x mandatory;
    }
    
    .flex-shrink-0 {
      scroll-snap-align: start;
    }
  }
`;

// Add the styles to the document
const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

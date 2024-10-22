import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { ArrowRight, PlusCircle, HelpCircle, ChevronRight, Book, X } from 'lucide-react';
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

export default function Chat({ isVisible }) {
  const { isSignedIn, user } = useUser();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentConversation, setCurrentConversation] = useState([]);
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
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  useEffect(() => {
    if (!isSignedIn) {
      navigate('/login');
      return;
    }

    const fetchSessions = async () => {
      try {
        const response = await axios.get(`https://bents-backend-server.vercel.app/api/get-session/${user.id}`);
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

    fetchSessions();

    const fetchConversationHistory = async () => {
      try {
        // First, try to get the conversation history from localStorage
        const storedHistory = localStorage.getItem(`conversationHistory-${user.id}`);
        const storedSelectedIndex = localStorage.getItem(`selectedIndex-${user.id}`);

        if (storedHistory && storedSelectedIndex) {
          setConversationHistory(JSON.parse(storedHistory));
          setSelectedIndex(storedSelectedIndex);
          setIsInitialized(true);
        } else {
          // If not in localStorage, fetch from the server
          if (data && data.conversations) {
            let parsedConversations;
            try {
              parsedConversations = JSON.parse(data.conversations);
            } catch (e) {
              console.error("Error parsing conversations:", e);
              parsedConversations = {
                "bents": [],
                "shop-improvement": [],
                "tool-recommendations": []
              };
            }
            setConversationHistory(parsedConversations);
            setSelectedIndex(data.selected_index || "bents");
            
            // Store the fetched data in localStorage
            localStorage.setItem(`conversationHistory-${user.id}`, JSON.stringify(parsedConversations));
            localStorage.setItem(`selectedIndex-${user.id}`, data.selected_index || "bents");
          }
          setIsInitialized(true);
        }
      } catch (error) {
        console.error("Error fetching conversation history:", error);
        setIsInitialized(true);
      }
    };

    const fetchRandomQuestions = async () => {
      try {
        const response = await axios.get('https://bents-backend-server.vercel.app/api/random-questions');
        setRandomQuestions(response.data.map(q => q.question_text));
      } catch (error) {
        console.error("Error fetching random questions:", error);
      }
    };

    fetchConversationHistory();
    fetchRandomQuestions();
    setCurrentConversation([]);
    setShowInitialQuestions(true);
    setShowCenterSearch(true);
  }, [isSignedIn, user, navigate]);

  useEffect(() => {
    const saveConversationHistory = async () => {
      if (isInitialized && isSignedIn) {
        try {
          // Save to localStorage
          localStorage.setItem(`conversationHistory-${user.id}`, JSON.stringify(conversationHistory));
          localStorage.setItem(`selectedIndex-${user.id}`, selectedIndex);
        } catch (error) {
          console.error("Error saving conversation history:", error);
        }
      }
    };

    saveConversationHistory();
  }, [conversationHistory, selectedIndex, isInitialized, isSignedIn, user]);

  useEffect(() => {
    if (!isVisible && isSearching) {
      console.log('Search in progress while Chat is not visible');
    }
  }, [isVisible, isSearching]);

  useEffect(() => {
    // Save sessions to database whenever they change
    const saveSessions = async () => {
      if (isSignedIn && sessions.length > 0 && user) {
        try {
          const optimizedSessions = sessions.map(session => ({
            id: session.id,
            conversations: session.conversations.map(conv => ({
              question: conv.question,
              text: conv.text,
              video: conv.video || [],
              videoLinks: conv.videoLinks || {}
            }))
          }));

          await axios.post('https://bents-backend-server.vercel.app/api/save-session', {
            userId: user.id,
            sessionData: optimizedSessions
          });
        } catch (error) {
          console.error("Error saving sessions:", error.response?.data?.message || error.message);
        }
      }
    };

    saveSessions();
  }, [sessions, isSignedIn, user]);

  const scrollToLatestConversation = () => {
    if (latestConversationRef.current) {
      latestConversationRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSearch = async (e, initialQuestionIndex = null) => {
    e.preventDefault(); // Add this line to prevent default form submission
    
    const query = initialQuestionIndex !== null ? randomQuestions[initialQuestionIndex] : searchQuery;
    if (!query.trim() || isSearching) return;
    
    setIsSearching(true);
    setIsLoading(true);
    if (initialQuestionIndex !== null) {
      setLoadingQuestionIndex(initialQuestionIndex);
    }
    
    try {
      const response = await axios.post('https://bents-backend-server.vercel.app/chat', {
        message: query,
        selected_index: selectedIndex,
        chat_history: currentConversation.flatMap(conv => [conv.question, conv.initial_answer || conv.text])
      }, {
        timeout: 60000 // 60 seconds timeout
      });
      
      const newConversation = {
        question: query,
        text: response.data.response,
        initial_answer: response.data.initial_answer,
        video: response.data.urls || [],
        videoLinks: response.data.video_links || {},
        timestamp: new Date().toISOString() // Add this line
      };
      
      setCurrentConversation(prev => [...prev, newConversation]);
      
      // Update the current session with the new conversation
      setSessions(prevSessions => {
        const updatedSessions = prevSessions.map(session => {
          if (session.id === currentSessionId) {
            return { ...session, conversations: [...session.conversations, newConversation] };
          }
          return session;
        });
        return updatedSessions;
      });

      setShowInitialQuestions(false);
      setSearchQuery("");
      setShowCenterSearch(false);
      
      if (isVisible) {
        setTimeout(scrollToLatestConversation, 100);
      }
    } catch (error) {
      console.error("Error fetching response:", error);
    } finally {
      setIsLoading(false);
      setLoadingQuestionIndex(null);
      setIsSearching(false);
    }
  };

  const handleNewConversation = () => {
    const newSessionId = uuidv4();
    const newSession = { id: newSessionId, conversations: [] };
    setSessions(prevSessions => [...prevSessions, newSession]);
    setCurrentSessionId(newSessionId);
    setCurrentConversation([]);
    setShowInitialQuestions(true);
    setShowCenterSearch(true);
  };

  const handleSectionChange = (newIndex) => {
    setSelectedIndex(newIndex);
    setIsDropdownOpen(false);
    setCurrentConversation([]);
    setSelectedConversation(null);
    setShowInitialQuestions(true);
    setShowCenterSearch(true);
  };

  const renderVideos = (videos, videoLinks) => {
    let videoIds = new Set();
    if (videos && videos.length > 0) {
      getYoutubeVideoIds(videos).forEach(id => videoIds.add(id));
    }
    if (videoLinks) {
      const allVideoUrls = Object.values(videoLinks).flat();
      getYoutubeVideoIds(allVideoUrls).forEach(id => videoIds.add(id));
    }

    if (videoIds.size > 0) {
      const opts = {
        height: '195',
        width: '320',
        playerVars: {
          autoplay: 0,
        },
      };
      return (
        <div className="flex flex-wrap gap-4 mb-4">
          {Array.from(videoIds).map((videoId, index) => (
            <YouTube key={videoId} videoId={videoId} opts={opts} />
          ))}
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
    
    formattedText = formattedText.replace(/(\d+)\.\s*\*\*(.*?)\*\*(:?)\s*([-\s]*)(.+)/g, (match, number, title, colon, dash, content) => {
      return `<div class="font-bold mt-2 mb-1">${number}. ${title}${colon}</div><div class="ml-4">${dash}${content}</div>`;
    });
    
    formattedText = formattedText.replace(/\*\*\*\*timestamp\*\*\*\*\s*(\[video\d+\])/g, '$1');
    
    formattedText = formattedText.replace(/^(\#{1,6})\s*\*\*(.*?)\*\*/gm, '$1 <strong>$2</strong>');
    
    return <div dangerouslySetInnerHTML={{ __html: formattedText }} />;
  };

  const renderDropdownMenu = () => (
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
  );

  const renderSearchBar = () => (
    <form onSubmit={handleSearch} className="flex items-center w-full max-w-3xl mx-auto">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Ask a question..."
        className="flex-grow p-2 border rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        className="bg-blue-500 text-white p-2 rounded-r-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <ArrowRight size={24} />
      </button>
    </form>
  );

  const renderVideoLinks = (videos, videoLinks) => {
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
      return (
        <div className="flex flex-wrap gap-2 mt-2">
          {Array.from(videoIds).map((videoId, index) => (
            <a
              key={videoId}
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              Video {index + 1}
            </a>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderSidebar = () => {
    // Helper function to safely get timestamp
    const getLatestTimestamp = (session) => {
      if (session.conversations && session.conversations.length > 0) {
        const lastConversation = session.conversations[session.conversations.length - 1];
        if (lastConversation.timestamp) {
          const timestamp = new Date(lastConversation.timestamp).getTime();
          return isNaN(timestamp) ? 0 : timestamp;
        }
      }
      return 0;
    };

    // Sort sessions in descending order based on the timestamp of the last conversation
    const sortedSessions = [...sessions].sort((a, b) => {
      const aTimestamp = getLatestTimestamp(a);
      const bTimestamp = getLatestTimestamp(b);
      return bTimestamp - aTimestamp; // This puts the most recent timestamp first
    });

    return (
      <div className={`fixed top-[75px] left-0 h-[calc(100vh-75px)] w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 h-full overflow-y-auto">
          <button onClick={() => setIsSidebarOpen(false)} className="absolute top-4 right-4 z-10">
            <X size={24} />
          </button>
          <h2 className="text-xl font-bold mb-4 mt-8">Sessions</h2>
          {sortedSessions.map((session) => (
            <div
              key={session.id}
              className="cursor-pointer hover:bg-gray-100 p-2 rounded mb-2"
              onClick={(e) => {
                e.preventDefault();
                setCurrentSessionId(session.id);
                setCurrentConversation(session.conversations);
                setShowInitialQuestions(false);
                setShowCenterSearch(false);
                setIsSidebarOpen(false);
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
    );
  };
  if (!isSignedIn) {
    return null; // or a loading spinner
  }

  return (
    <div className="flex h-[calc(100vh-75px)] bg-white pt-[75px]">
      {renderSidebar()}
      <div className={`flex-grow overflow-y-auto pb-20 ${isSidebarOpen ? 'ml-64' : ''} relative`}>
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="fixed top-[85px] left-4 z-50 bg-white p-2 rounded-full shadow-md"
          >
            <Book size={24} />
          </button>
        )}
        
        <div className="mt-12"> {/* Add top margin to push content below the hamburger */}
          {selectedConversation ? (
            <div className="flex flex-col h-full">
              <div className="flex-grow overflow-y-auto p-4 pb-20">
                <div className="bg-white p-4 rounded-lg shadow mb-4">
                  <h2 className="font-bold mb-4">{selectedConversation.question}</h2>
                  
                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">Related Products</h3>
                    {selectedConversation.products && selectedConversation.products.length > 0 ? (
                      <div className="flex overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:gap-2">
                        {selectedConversation.products.map((product, pIndex) => (
                          <Link 
                            key={pIndex} 
                            to={product.link} 
                            className="flex-shrink-0 bg-gray-100 rounded-lg p-2 flex items-center justify-between mr-2 sm:mr-0 sm:w-auto min-w-[200px] sm:min-w-0"
                          >
                            <span className="font-medium">{product.title}</span>
                            <ChevronRight size={20} className="ml-2 text-gray-500" />
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 italic">No related products available at the moment.</p>
                    )}
                  </div>

                  <div className="mb-4">
                    {renderVideos(selectedConversation.video, selectedConversation.videoLinks)}
                    {formatResponse(selectedConversation.text || '', selectedConversation.videoLinks, selectedConversation.products)}
                  </div>
                  <div className="clear-both"></div>
                </div>
              </div>
            </div>
          ) : currentConversation.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-full p-4">
              <h2 className="text-3xl font-bold mb-8">A question creates knowledge</h2>
              
              {showCenterSearch && (
                <div className="w-full max-w-2xl mb-8">
                  {renderSearchBar()}
                </div>
              )}

              {showInitialQuestions && (
                <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {randomQuestions.map((question, index) => (
                    <button
                      key={index}
                      onClick={(e) => {
                        e.preventDefault();
                        handleSearch(e, index);
                      }}
                      className="p-4 border rounded-lg hover:bg-gray-100 text-center h-full flex items-center justify-center transition-colors duration-200 ease-in-out relative"
                      disabled={isSearching || isLoading || loadingQuestionIndex !== null}
                    >
                      {loadingQuestionIndex === index ? (
                        <span className="animate-spin absolute">⌛</span>
                      ) : (
                        <span>{question}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex-grow overflow-y-auto p-4 pb-20">
                {currentConversation.map((conv, index) => (
                  <div 
                    key={index} 
                    className="bg-white p-4 rounded-lg shadow mb-4"
                    ref={index === currentConversation.length - 1 ? latestConversationRef : null}
                  >
                    <h2 className="font-bold mb-4">{conv.question}</h2>
                    
                    <div className="mb-4">
                      {renderVideos(conv.video, conv.videoLinks)}
                      {formatResponse(conv.text || '', conv.videoLinks)}
                    </div>
                    <div className="clear-both"></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {!showCenterSearch && !selectedConversation && (
        <div className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 ${isSidebarOpen ? 'ml-64' : ''}`}>
          {renderSearchBar()}
        </div>
      )}
    </div>
  );
}

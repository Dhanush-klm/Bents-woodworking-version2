import React, { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import { ArrowRight, PlusCircle, HelpCircle, ChevronRight, BookOpen, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import YouTube from 'react-youtube';
import { Button } from "@/components/ui/button";
import { v4 as uuidv4 } from 'uuid';
import { cn } from "@/lib/utils";
// Update these imports to use relative paths
import { Textarea } from "./components/ui/textarea";

// Function to extract YouTube video ID from URL
const getYoutubeVideoIds = (urls) => {
  if (!urls || !Array.isArray(urls) || urls.length === 0) return [];
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  return urls.map(url => {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }).filter(id => id !== null);
};

// Replace the woodworkingFacts array with processingSteps
const processingSteps = [
  "Understanding query",
  "Searching knowledge base",
  "Processing data",
  "Generating answer"
];

// Add this new CSS-in-JS style block near the top of the file
const watermarkStyles = `
  .watermark-background {
    position: relative;
    background: linear-gradient(
      135deg,
      #f8fafc 0%,
      #f1f5f9 100%
    );
  }

  .watermark-background::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: 
      radial-gradient(circle at 25px 25px, rgba(148, 163, 184, 0.05) 2%, transparent 15%),
      radial-gradient(circle at 75px 75px, rgba(148, 163, 184, 0.05) 2%, transparent 15%);
    background-size: 100px 100px;
    pointer-events: none;
    z-index: 0;
  }

  /* Optional: Add a second layer for more depth */
  .watermark-background::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: 
      radial-gradient(circle at 50px 50px, rgba(148, 163, 184, 0.03) 2%, transparent 12%);
    background-size: 100px 100px;
    background-position: 25px 25px;
    pointer-events: none;
    z-index: 0;
  }
`;
export const maxDuration = 300; 
export default function Chat({ isVisible }) {
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
  const loadingCardRef = useRef(null);

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
    const fetchSessions = async () => {
      try {
        const guestId = 'guest-user';
        const response = await axios.get(`https://bents-backend-server.vercel.app/api/get-session/${guestId}`);
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
        const response = await axios.get('https://bents-backend-server.vercel.app/api/random-questions');
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
    setIsSidebarOpen(false);
  }, []);

  // Save sessions effect
  useEffect(() => {
    const saveSessions = async () => {
      if (sessions.length > 0) {
        try {
          const guestId = 'guest-user';
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

          await axios.post('https://bents-backend-server.vercel.app/api/save-session', {
            userId: guestId,
            sessionData: optimizedSessions
          });
        } catch (error) {
          console.error("Error saving sessions:", error);
        }
      }
    };

    saveSessions();
  }, [sessions]);

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
    if (index !== undefined) {
      setLoadingQuestionIndex(index);
      setSearchQuery(randomQuestions[index]); // Set search query for random questions
    }
    setShowInitialQuestions(false);

    // Don't clear the search query immediately when loading
    const currentQuery = query;

    // Scroll to loading card after state updates
    setTimeout(() => {
      if (loadingCardRef.current) {
        loadingCardRef.current.scrollIntoView({ 
          behavior: 'smooth',
          block: 'center'
        });
      }
    }, 100);

    // Start progress interval with faster initial steps
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        // First three steps complete quickly (0-75%)
        if (prev < 75) {
          return prev + 5; // Faster increment for first three steps
        }
        // Last step (Generating answer) takes most of the time (75-100%)
        if (prev >= 75 && prev < 100) {
          return prev + 0.5; // Slower increment for final step
        }
        clearInterval(progressInterval);
        return 100;
      });
    }, 100); // Reduced interval time

    try {
      const response = await axios.post('https://bents-backend-server.vercel.app/chat', {
        message: currentQuery,
        selected_index: selectedIndex,
        chat_history: currentConversation.flatMap(conv => [conv.question, conv.initial_answer || conv.text])
      }, {
        timeout: 300000
      });
      
      // Store conversation with related products
      const newConversation = {
        question: currentQuery,
        text: response.data.response,
        initial_answer: response.data.initial_answer,
        video: response.data.urls || [],
        video_titles: response.data.video_titles || [],
        video_timestamps: response.data.video_timestamps || {},
        videoLinks: response.data.video_links || {},
        related_products: (response.data.related_products || []).map(product => ({
          title: product.title,
          link: product.link
        })),
        timestamp: new Date().toISOString()
      };
      
      setCurrentConversation(prev => [...prev, newConversation]);
      
      // Update sessions
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

      // Only clear the search query after the response is received
      setSearchQuery("");

      // After setting the new conversation, scroll to the latest response
      setTimeout(() => {
        if (latestConversationRef.current) {
          latestConversationRef.current.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
          });
        }
      }, 100);

    } catch (error) {
      console.error("Error fetching response:", error);
      // Optionally clear the search query on error
      setSearchQuery("");
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
    // Check if current session exists and is empty
    const currentSession = sessions.find(session => session.id === currentSessionId);
    if (currentSession && currentSession.conversations.length === 0) {
      // If current session is empty, just reset the state without creating a new session
      setCurrentConversation([]);
      setCurrentRelatedProducts([]);
      setShowInitialQuestions(true);
      setShowCenterSearch(true);
      return;
    }
    // If current session is not empty or doesn't exist, create a new session
    const newSessionId = uuidv4();
    const newSession = { id: newSessionId, conversations: [] };
    setSessions(prevSessions => [...prevSessions, newSession]);
    setCurrentSessionId(newSessionId);
    setCurrentConversation([]);
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
            <h4 className="font-bold text-gray-800 mb-3">Source</h4>
            <div className="space-y-3">
              {currentSourceVideos.map((video, index) => (
                <div key={index} className="flex flex-col">
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group text-blue-500 underline"
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

    // Handle direct video URLs
    if (Array.isArray(videos)) {
      getYoutubeVideoIds(videos).forEach(id => videoIds.add(id));
    }

    // Handle video links object with new structure
    if (videoLinks && typeof videoLinks === 'object') {
      Object.values(videoLinks).forEach(videoInfo => {
        if (videoInfo && Array.isArray(videoInfo.urls)) {
          getYoutubeVideoIds(videoInfo.urls).forEach(id => {
            if (id) videoIds.add(id);
          });
        }
      });
    }

    if (videoIds.size > 0) {
      const opts = {
        height: '140',
        width: '180',
        playerVars: {
          autoplay: 0,
          modestbranding: 1,
          rel: 0
        },
      };

      return (
        <div className="relative w-full mb-6">
          <div className="overflow-x-auto pb-4 hide-scrollbar">
            <div className="flex space-x-4 min-w-min">
              {Array.from(videoIds).map((videoId) => (
                <div key={videoId} className="flex-shrink-0 shadow-sm rounded-lg overflow-hidden">
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
    <div className="flex flex-col items-center w-full px-2 sm:px-0">
      {currentConversation.length === 0 && (
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          A question creates knowledge
        </h1>
      )}
      <div className={cn(
        "flex items-center bg-background",
        "border rounded-[8px]",
        "ring-offset-background",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        "w-full max-w-[640px]"
      )}>
        <Button
          onClick={handleNewConversation}
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-l-xl"
        >
          <PlusCircle className="h-4 w-4" />
        </Button>

        <div className="relative" ref={dropdownRef}>
          <Button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8",
              selectedIndex !== "bents" 
                ? "text-blue-500 hover:text-blue-700" 
                : "text-muted-foreground hover:text-foreground"
            )}
            title={selectedIndex === "bents" ? "All Categories" : "Category Selected"}
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
          {isDropdownOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-48 rounded-xl shadow-lg bg-white border z-50">
              <div className="py-1 bg-white">
                {[
                  { value: "bents", label: "All" },
                  { value: "shop-improvement", label: "Shop Improvement" },
                  { value: "tool-recommendations", label: "Tool Recommendations" }
                ].map((option) => (
                  <Button
                    key={option.value}
                    onClick={() => {
                      setSelectedIndex(option.value);
                      setIsDropdownOpen(false);
                    }}
                    variant="ghost"
                    className={cn(
                      "w-full justify-start px-4 py-2 text-sm h-auto bg-white",
                      selectedIndex === option.value
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{option.label}</span>
                      {selectedIndex === option.value && (
                        <ChevronRight className="h-4 w-4 ml-2" />
                      )}
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-border mx-1" />
        
        <form onSubmit={handleSearch} className="flex-grow flex items-center">
          <Textarea
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            placeholder="Ask your question..."
            className={cn(
              "flex-grow",
              "border-0 focus-visible:ring-0 focus-visible:ring-offset-0",
              "py-1 px-3",
              "text-base text-center",
              "min-h-[32px]",
              "max-h-[120px]",
              "transition-height duration-200",
              "placeholder:text-gray-500",
              "placeholder:pt-[3px]",
              "focus:placeholder:opacity-0",
              isLoading && currentConversation.length === 0 ? "opacity-50" : ""
            )}
            disabled={false}
            style={{ 
              resize: 'none',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              lineHeight: '18px',
              paddingTop: '6px',
              caretColor: 'black',
              textAlign: 'center',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSearch(e);
              }
            }}
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-r-xl"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="animate-spin">⌛</span>
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
          </Button>
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
          <h2 className="text-xl font-bold mb-4 mt-8">History</h2>
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
                <p className="text-sm italic text-gray-500">New conversation</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );

  // Update the renderLoadingFact function
  const renderLoadingFact = () => {
    // Adjust step calculation to make first three steps complete quickly
    const currentStep = loadingProgress >= 75 ? 3 : Math.floor((loadingProgress / 75) * 3);
    
    return (
      <div 
        ref={loadingCardRef}
        className="w-full max-w-xl mx-auto bg-white rounded-[8px] border shadow-sm"
      >
        <div className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-1">
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

  // Group videos by title function
  const groupVideosByTitle = (videoLinks) => {
    if (!videoLinks) return {};
    
    const groupedVideos = {};
    Object.entries(videoLinks).forEach(([key, info]) => {
      if (!info || !info.video_title) return;
      
      const title = info.video_title;
      if (!groupedVideos[title]) {
        groupedVideos[title] = [];
      }
      groupedVideos[title].push(info);
    });
    
    return groupedVideos;
  };

  // Updated renderSourceVideos function
  const renderSourceVideos = (videoLinks) => {
    if (!videoLinks || Object.keys(videoLinks).length === 0) return null;

    const allVideos = Object.values(videoLinks).filter(video => video && video.urls?.[0]);
    
    const getStartTime = (timestamp) => {
      if (!timestamp) return 0;
      const [minutes, seconds] = timestamp.split(':').map(Number);
      return minutes * 60 + seconds;
    };

    const opts = {
      height: '158',  // 16:9 ratio for width of 280
      width: '280',
      playerVars: {
        autoplay: 0,
        modestbranding: 1,
        rel: 0,
        start: 0
      },
    };

    return (
      <div className="mt-6">
        <h3 className="text-xl font-semibold px-4 mb-4">Related Videos</h3>
        <div className="relative">
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
            <div className="flex gap-4 px-4 pb-4 min-w-min">
              {allVideos.map((video, index) => {
                const videoId = getYoutubeVideoIds([video.urls[0]])[0];
                const startTime = getStartTime(video.timestamp);
                const videoOpts = {
                  ...opts,
                  playerVars: {
                    ...opts.playerVars,
                    start: startTime
                  }
                };

                return (
                  <div key={index} className="flex-shrink-0 w-[200px] bg-white rounded-[8px] border shadow-sm overflow-hidden">
                    {videoId && (
                      <div className="relative p-3 pt-3">
                        <div className="w-full aspect-video rounded-[8px] overflow-hidden">
                          <YouTube 
                            videoId={videoId} 
                            opts={videoOpts}
                          />
                        </div>
                        <div className="absolute bottom-5 right-5 bg-black/75 text-white text-xs px-2 py-1 rounded-full">
                          {video.timestamp}
                        </div>
                      </div>
                    )}
                    <div className="px-4 pb-4 space-y-2">
                      <h4 className="font-medium text-sm line-clamp-1">
                        {video.video_title}
                      </h4>
                      <p className="text-sm text-gray-600 line-clamp-2 min-h-[2.5rem]">
                        {video.description?.replace(/"/g, '')}
                      </p>
                      <div className="flex justify-end pt-1">
                        <a
                          href={`${video.urls[0]}${startTime ? `&t=${startTime}s` : ''}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-600 hover:text-gray-800 text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full transition-colors"
                        >
                          Watch Full Video
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Update the renderConversation function
  const renderConversation = (conv, index) => (
    <div 
      key={index} 
      className="bg-white p-6 rounded-[8px] shadow mb-4"
      ref={index === currentConversation.length - 1 ? latestConversationRef : null}
    >
      <h2 className="font-bold mb-4">{conv.question}</h2>
      <div className="mb-4">
        {formatResponse(conv.text || '', conv.videoLinks)}
      </div>
      {renderSourceVideos(conv.videoLinks)}
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
  return (
    <div className="flex flex-col h-[calc(100vh-75px)] bg-white pt-[75px] watermark-background">
      {renderSidebar()}
      <div className="relative flex-grow overflow-hidden">
        <button
          onClick={() => {
            setIsSidebarOpen(true);
            const btn = document.querySelector('.history-button');
            btn.classList.add('active');
            setTimeout(() => btn.classList.remove('active'), 300);
          }}
          className={cn(
            "history-button",
            currentConversation.length > 0 ? "flex" : "hidden"
          )}
        >
          <BookOpen className="history-icon" />
        </button>
        
        <div className="h-full overflow-y-auto p-4 pt-16 pb-24">
          <div ref={topOfConversationRef}></div>
          
          {/* Only show top search bar when no conversations exist */}
          {currentConversation.length === 0 && (
            <div className={cn(
              "flex flex-col items-center justify-center w-full max-w-2xl mx-auto px-4",
              // Remove min-height when loading or when not showing initial questions
              showInitialQuestions && !isLoading 
                ? "min-h-[calc(100vh-200px)]" 
                : "min-h-0 py-8" // Add some padding instead of full height
            )}>
              <div className="space-y-8 w-full">
                <div className="w-full">
                  <div className="flex items-center justify-center w-full">
                    {renderSearchBar()}
                  </div>
                </div>
                
                {isLoading && (
                  <div className="w-full max-w-xl mx-auto">
                    {renderLoadingFact()}
                  </div>
                )}
                
                {showInitialQuestions && !isLoading && (
                  <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {randomQuestions.map((question, index) => (
                      <div key={index} className={cn(
                        "flex-grow flex items-center bg-background",
                        "border rounded-xl shadow-sm hover:bg-gray-50",
                        "ring-offset-background transition-colors duration-200",
                        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
                      )}>
                        <button
                          onClick={(e) => handleSearch(e, index)}
                          className="w-full p-4 text-left"
                          disabled={isSearching || isLoading}
                        >
                          <div className="flex items-center">
                            <span className="text-sm text-gray-900">{question}</span>
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Conversations */}
          {currentConversation.length > 0 && (
            <div className="space-y-4 pb-[100px]"> {/* Reduced bottom padding */}
              {currentConversation.map((conv, index) => renderConversation(conv, index))}
              
              {/* Loading state */}
              {isLoading && (
                <div className="w-full max-w-xl mx-auto px-4">
                  {renderLoadingFact()}
                </div>
              )}
            </div>
          )}

          {/* Fixed bottom search bar when conversations exist */}
          {currentConversation.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-10"> {/* Added z-index */}
              <div className="flex justify-center w-full px-4 py-4">
                <div className="w-full max-w-xl">
                  {renderSearchBar()}
                </div>
              </div>
            </div>
          )}
        </div>
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

  textarea {
    font-family: inherit;
    font-size: inherit;
    line-height: 1.5;
    overflow-x: auto;  /* Enable horizontal scrolling */
    overflow-y: hidden; /* Hide vertical scrollbar */
    white-space: nowrap; /* Prevent text wrapping */
  }

  /* Hide default scrollbar */
  textarea::-webkit-scrollbar {
    height: 6px;  /* Changed from width to height for horizontal scrollbar */
    width: 0;     /* Hide vertical scrollbar */
  }

  textarea::-webkit-scrollbar-track {
    background: transparent;
  }

  textarea::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
  }

  /* For Firefox */
  textarea {
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
  }

  /* Ensure the textarea doesn't grow vertically */
  textarea {
    resize: none;
    max-height: 40px;
    min-height: 40px;
  }

  @keyframes pulseScale {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }

  .history-button {
    transition: all 0.3s ease;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    top: 85px;
    left: 16px;
    z-index: 30;
    background-color: white;
    border-radius: 9999px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .history-icon {
    width: 20px;
    height: 20px;
  }

  .history-button:hover {
    background-color: #f8f9fa;
  }

  .history-button.active {
    animation: pulseScale 0.3s ease;
  }

  .history-button.active .history-icon {
    transform: rotate(-10deg);
  }

  .scrollbar-thin {
    scrollbar-width: thin;
  }
  
  .scrollbar-thin::-webkit-scrollbar {
    height: 6px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .scrollbar-thin::-webkit-scrollbar-thumb {
    background-color: rgb(209 213 219);
    border-radius: 3px;
  }
  
  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background-color: rgb(156 163 175);
  }
`;

// Add the styles to the document
const styleSheet = document.createElement("style");
styleSheet.innerText = styles + watermarkStyles;  // Combine both style blocks
document.head.appendChild(styleSheet);

// Update handleSectionChange to work for both initial and ongoing conversations
const handleSectionChange = (value) => {
  setSelectedIndex(value);
  setIsDropdownOpen(false);
  
  // Update the search context based on selection
  switch(value) {
    case "shop-improvement":
      // Set context for shop improvement
      setCurrentTags(['shop-improvement']);
      break;
    case "tool-recommendations":
      // Set context for tool recommendations
      setCurrentTags(['tool-recommendations']);
      break;
    default:
      // Reset to all categories
      setCurrentTags([]);
      break;
  }
};

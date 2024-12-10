import React, { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import { ArrowRight, PlusCircle, HelpCircle, ChevronRight, BookOpen, X, ExternalLinkIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import YouTube from 'react-youtube';
import { Button } from "@/components/ui/button";
import { v4 as uuidv4 } from 'uuid';
import { cn } from "@/lib/utils";
// Update these imports to use relative paths
import { Textarea } from "./components/ui/textarea";
import ReactMarkdown from 'react-markdown';

// First, declare all style constants
const baseStyles = `
  .hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  
  .hide-scrollbar::-webkit-scrollbar {
    display: none;
  }
`;

const watermarkStyles = `
  .watermark-background {
    position: relative;
    background: linear-gradient(
      135deg,
      #f8fafc 0%,
      #f1f5f9 100%
    );
    min-height: 100vh;
  }
`;

const formattingStyles = `
  .prose {
    max-width: none;
    width: 100%;
  }

  .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
    font-weight: 700;
    line-height: 1.2;
    color: #1f2937;
  }

  .prose p {
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
    color: #4b5563;
  }

  .prose strong {
    font-weight: 700;
    color: #1f2937;
    display: block;
    margin-top: 0.5rem;
    margin-bottom: 0;
    padding-bottom: 0.25rem;
  }

  .numbered-section {
    margin: 1.5rem 0;
  }

  .numbered-title {
    font-size: 1.1rem;
    margin-bottom: 1rem;
    color: #1f2937;
  }

  .numbered-title .main-title {
    font-weight: 700;
  }

  .section-content {
    margin-left: 1.5rem;
  }

  .section-header {
    font-size: 1rem;
    margin: 1rem 0 0.5rem 0;
    color: #374151;
  }

  .section-header strong {
    font-weight: 600;
  }

  .list-item {
    margin: 0.5rem 0 0.5rem 1rem;
    line-height: 1.5;
    color: #4b5563;
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .bold-text {
    margin: 1rem 0;
    font-size: 1.1rem;
    color: #1f2937;
    font-weight: 600;
    display: block;
  }

  .inline-header {
    display: inline;
    color: #374151;
  }

  .inline-header strong {
    font-weight: 600;
    color: #1f2937;
  }

  .prose a {
    color: #3b82f6;
    text-decoration: none;
    transition: color 0.2s;
  }

  .prose a:hover {
    color: #2563eb;
    text-decoration: underline;
  }

  .space-y-1 > * + * {
    margin-top: 0.25rem;
  }

  .space-y-2 > * + * {
    margin-top: 0.5rem;
  }

  .break-words {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .whitespace-pre-line {
    white-space: pre-line;
  }

  /* Video section styles */
  .video-section {
    margin: 1.5rem 0;
    padding: 1rem;
    background: #f8fafc;
    border-radius: 0.5rem;
  }

  .video-title {
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.5rem;
  }

  .video-timestamp {
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* Product section styles */
  .product-section {
    background: #ffffff;
    border-radius: 0.5rem;
    padding: 1rem;
    margin: 1rem 0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .product-title {
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.5rem;
  }

  .product-price {
    font-size: 0.875rem;
    color: #3b82f6;
    font-weight: 600;
  }

  .product-description {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0.5rem 0;
  }

  .numbered-title .main-title {
    font-weight: 700;
  }

  .section-header strong {
    font-weight: 600;
  }

  .prose h2 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 1.5rem 0 1rem;
    color: #1f2937;
  }

  .prose strong {
    font-weight: 600;
    color: #1f2937;
  }

  .prose > div {
    margin: 0.5rem 0;
  }

  .prose .bullet-point {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin: 0.25rem 0;
  }

  .prose .bullet-marker {
    color: #9ca3af;
    flex-shrink: 0;
  }

  .prose .numbered-point {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin: 0.25rem 0;
  }

  .prose .number-marker {
    color: #9ca3af;
    flex-shrink: 0;
    min-width: 1.5rem;
  }
`;

const additionalStyles = `
  .hide-scrollbar {
    -ms-overflow-style: none !important;
    scrollbar-width: none !important;
  }
  
  .hide-scrollbar::-webkit-scrollbar {
    display: none !important;
  }
  
  .question-textarea {
    -webkit-overflow-scrolling: touch !important;
    overscroll-behavior: contain;
    touch-action: pan-y;
    will-change: height;
    transition: height 0.1s ease-out !important;
  }
  
  @media (max-width: 640px) {
    .question-textarea {
      font-size: 16px !important;
      min-height: 42px !important;
      height: auto !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      resize: none !important;
      line-height: 1.5 !important;
      padding-top: 10px !important;
      padding-bottom: 10px !important;
      -webkit-text-size-adjust: 100%;
      -webkit-overflow-scrolling: touch !important;
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }

    .question-textarea::-webkit-scrollbar {
      display: none !important;
    }
    
    /* Add smooth expansion animation */
    .question-textarea {
      transition: height 0.2s ease-out !important;
    }
    
    /* Ensure proper touch handling */
    .question-textarea {
      touch-action: pan-y pinch-zoom !important;
    }
    
    /* Prevent unwanted zoom on iOS */
    .question-textarea {
      max-height: 50vh !important;
    }
  }
`;

const bottomBarStyles = `
  @media (max-width: 640px) {
    .fixed.bottom-0 {
      position: sticky !important;
      bottom: 0 !important;
      background: white !important;
      z-index: 50 !important;
      padding-bottom: env(safe-area-inset-bottom) !important;
    }
    
    .fixed.bottom-0 form {
      width: 100% !important;
      max-width: 100% !important;
    }
  }
`;

// Single declaration of combinedStyles
const combinedStyles = `
  ${baseStyles}
  ${watermarkStyles}
  ${formattingStyles}
  ${additionalStyles}
  ${bottomBarStyles}
`;

// Create and inject styles
(() => {
  const styleEl = document.createElement("style");
  styleEl.innerText = combinedStyles;
  document.head.appendChild(styleEl);
})();

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

// Restore the processingSteps array
const processingSteps = [
  "Understanding query",
  "Searching knowledge base",
  "Processing data",
  "Generating answer"
];

export const maxDuration = 300; 
const LOCAL_STORAGE_KEY = 'chat_sessions';

export default function Chat({ isVisible }) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [sessions, setSessions] = useState(() => {
    try {
      const savedSessions = localStorage.getItem(LOCAL_STORAGE_KEY);
      return savedSessions ? JSON.parse(savedSessions) : [{
        id: uuidv4(),
        conversations: []
      }];
    } catch (error) {
      console.error('Error loading sessions:', error);
      return [{
        id: uuidv4(),
        conversations: []
      }];
    }
  });
  const [currentSessionId, setCurrentSessionId] = useState(() => {
    try {
      const savedCurrentSessionId = localStorage.getItem('current_session_id');
      return savedCurrentSessionId || sessions[0]?.id || null;
    } catch (error) {
      console.error('Error loading current session ID:', error);
      return sessions[0]?.id || null;
    }
  });
  const [currentConversation, setCurrentConversation] = useState(() => {
    try {
      const savedSessions = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedSessions) {
        const parsedSessions = JSON.parse(savedSessions);
        const savedCurrentSessionId = localStorage.getItem('current_session_id');
        const currentSession = parsedSessions.find(session => session.id === savedCurrentSessionId);
        return currentSession?.conversations || [];
      }
      return [];
    } catch (error) {
      console.error('Error loading conversation:', error);
      return [];
    }
  });
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebarRef = useRef(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const dropdownRef = useRef(null);
  const [currentFactIndex, setCurrentFactIndex] = useState(0);
  const topOfConversationRef = useRef(null);
  const [shouldScrollToTop, setShouldScrollToTop] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const loadingCardRef = useRef(null);
  const productsScrollContainerRef = useRef(null);

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
    const initializeChat = async () => {
      try {
        // Only fetch random questions, don't modify session state
        const response = await axios.get('https://bents-backend-server.vercel.app/api/random-questions');
        setRandomQuestions(response.data.map(q => q.question_text));
        setIsSidebarOpen(false);
      } catch (error) {
        console.error("Error in initial setup:", error);
        setIsSidebarOpen(false);
      }
    };

    initializeChat();
  }, []);

  // Add this effect to persist sessions
  useEffect(() => {
    if (sessions.length > 0) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
      } catch (error) {
        console.error('Error saving sessions:', error);
      }
    }
  }, [sessions]);

  // Add this effect to maintain current session
  useEffect(() => {
    if (currentSessionId) {
      try {
        localStorage.setItem('current_session_id', currentSessionId);
        const currentSession = sessions.find(session => session.id === currentSessionId);
        if (currentSession) {
          setCurrentConversation(currentSession.conversations);
          setShowInitialQuestions(currentSession.conversations.length === 0);
        }
      } catch (error) {
        console.error('Error maintaining current session:', error);
      }
    }
  }, [currentSessionId, sessions]);

  // Restore the loading card functionality
  const renderLoadingCard = () => {
    const currentStep = processingSteps[Math.floor(loadingProgress / 25)];
    
    return (
      <div 
        ref={loadingCardRef}
        className={cn(
          "w-full p-4 mb-4",
          "bg-white rounded-lg shadow-sm",
          "border border-gray-200",
          "transform transition-all duration-300"
        )}
      >
        <div className="flex flex-col space-y-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <span className="text-sm font-medium text-gray-700">{currentStep}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div 
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
        </div>
      </div>
    );
  };

  // Restore the loading progress functionality in handleSearch
  const handleSearch = async (e, index) => {
    e.preventDefault();
    const query = index !== undefined ? randomQuestions[index] : searchQuery;
    if (!query.trim() || isSearching) return;
    
    setIsSearching(true);
    setIsLoading(true);
    setLoadingProgress(0);
    if (index !== undefined) {
      setLoadingQuestionIndex(index);
      setSearchQuery(randomQuestions[index]);
    }
    setShowInitialQuestions(false);

    // Fast progress for first three steps
    const fastProgressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 75) {
          clearInterval(fastProgressInterval);
          return 75;
        }
        return prev + 5; // Faster increment for first three steps
      });
    }, 50); // Shorter interval for faster progress

    try {
      const response = await axios.post('https://bents-backend-server.vercel.app/chat', {
        message: query,
        selected_index: selectedIndex,
        chat_history: currentConversation.flatMap(conv => [conv.question, conv.initial_answer || conv.text])
      }, {
        timeout: 300000
      });

      // Complete the progress bar only after response is received
      setLoadingProgress(100);

      const newConversation = {
        id: uuidv4(),
        question: query,
        text: response.data.response,
        initial_answer: response.data.initial_answer,
        video: response.data.urls || [],
        video_titles: response.data.video_titles || [],
        video_timestamps: response.data.video_timestamps || {},
        videoLinks: response.data.video_links || {},
        related_products: response.data.related_products || [],
        timestamp: new Date().toISOString()
      };

      // Update conversation and sessions while maintaining the loading state
      setCurrentConversation(prev => {
        const updatedConversation = [...prev, newConversation];
        setSessions(prevSessions => {
          const updatedSessions = prevSessions.map(session => {
            if (session.id === currentSessionId) {
              return {
                ...session,
                conversations: updatedConversation
              };
            }
            return session;
          });
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedSessions));
          return updatedSessions;
        });
        return updatedConversation;
      });

      setSearchQuery("");
    } catch (error) {
      console.error("Error in handleSearch:", error);
      clearInterval(fastProgressInterval);
      setLoadingProgress(0);
      setSearchQuery("");
    } finally {
      setIsLoading(false);
      setLoadingQuestionIndex(null);
      setIsSearching(false);
    }
  };

  // Update handleNewConversation to properly handle session creation
  const handleNewConversation = () => {
    const newSessionId = uuidv4();
    const newSession = { id: newSessionId, conversations: [] };
    
    setSessions(prevSessions => {
      const updatedSessions = [...prevSessions, newSession];
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedSessions));
      } catch (error) {
        console.error('Error saving new session:', error);
      }
      return updatedSessions;
    });
    
    setCurrentSessionId(newSessionId);
    try {
      localStorage.setItem('current_session_id', newSessionId);
    } catch (error) {
      console.error('Error saving new session ID:', error);
    }
    
    setCurrentConversation([]);
    setShowInitialQuestions(true);
    setShowCenterSearch(true);
  };

  // Helper function to extract video title from URL (you'll need to implement this)
  const extractVideoTitle = (url) => {
    // This is a placeholder. Implement according to your needs
    return `Video ${Math.floor(Math.random() * 1000)}`;
  };

  // Update the renderRelatedProducts function
  const renderRelatedProducts = (products) => {
    if (!products || products.length === 0) return null;

    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900">Related Products</h3>
        </div>
        
        <div className="relative">
          <div 
            ref={productsScrollContainerRef}
            className="overflow-x-auto custom-scrollbar scroll-smooth"
            style={{ padding: '5px' }}
          >
            <div className="flex gap-4 pb-3 min-w-min">
              {products.map((product) => (
                <a
                  key={product.id}
                  href={product.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex-shrink-0 px-4 py-3 bg-white",
                    "rounded-[8px] w-[250px]",
                    "border border-gray-200",
                    "transform transition-all duration-300 ease-in-out",
                    "hover:scale-[1.02] hover:shadow-lg hover:border-blue-200",
                    "bg-gradient-to-br from-white to-gray-50",
                    "hover:from-blue-50/50 hover:to-white",
                    "group relative",
                    "cursor-pointer"
                  )}
                  style={{ marginLeft: '1px' }}
                >
                  <div className="space-y-2">
                    {/* Title and Price Row */}
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-sm font-medium text-gray-900 line-clamp-1",
                        "group-hover:text-blue-700",
                        "transition-colors duration-300"
                      )}>
                        {product.title}
                      </span>
                      {product.price && (
                        <span className={cn(
                          "text-sm font-semibold text-blue-600",
                          "group-hover:text-blue-700",
                          "transition-colors duration-300"
                        )}>
                          {product.price}
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {product.description && (
                      <p className={cn(
                        "text-sm text-gray-600 line-clamp-2",
                        "group-hover:text-gray-700",
                        "transition-colors duration-300"
                      )}>
                        {product.description}
                      </p>
                    )}

                    {/* Category Tag */}
                    {product.category && (
                      <div className="flex items-center">
                        <span className={cn(
                          "text-xs px-2 py-1 rounded-full",
                          "bg-gray-100 text-gray-500",
                          "group-hover:bg-blue-100 group-hover:text-blue-600",
                          "transition-all duration-300"
                        )}>
                          {product.category}
                        </span>
                      </div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
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

  // Add the new formatText function
  const formatText = (inputText) => {
    if (!inputText) return '';
    
    const lines = inputText.trim().split('\n');
    const formattedLines = [];
    let currentSection = null;

    lines.forEach(line => {
      line = line.trim();

      // Skip empty lines or single hyphens
      if (line === '-' || line === '') {
        return;
      }

      // Handle main titles (no hyphen prefix)
      if (!line.startsWith('-') && !line.startsWith(':') && !['purpose', 'features', 'application'].some(keyword => line.toLowerCase().includes(keyword))) {
        formattedLines.push(`\n**${line}**\n`);
        return;
      }

      // Handle section headers with content
      if (['purpose', 'features', 'application'].some(keyword => line.toLowerCase().includes(keyword))) {
        currentSection = line;
        if (line.includes(':')) {
          const [title, content] = line.split(':', 2);
          formattedLines.push(`- **${title}**: ${content.trim()}`);
        } else {
          formattedLines.push(`- **${currentSection}**`);
        }
        return;
      }

      // Handle content lines
      if (line.startsWith(':')) {
        const content = line.slice(1).trim();
        if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1].endsWith(':')) {
          formattedLines[formattedLines.length - 1] += ` ${content}`;
        } else {
          formattedLines.push(content);
        }
      }
    });

    let result = formattedLines.join('\n');
    result = result.replace(/\s+/g, ' ');
    result = result.replace(/\n\s+\n/g, '\n\n');

    return result;
  };

  // Update the formatResponse function
  const formatResponse = (text) => {
    if (!text) return null;

    // Apply markdown transformations based on the structure
    let formattedText = text
      // Only format numbered titles with bold text
      .replace(/###\s*(\d+)\.\s*\*\*(.*?)\*\*/g, (_, number, title) => 
        `\n### ${number}. **${title}**\n`
      )
      // Remove any other bold formatting in the content
      .replace(/(?<!###\s*\d+\.\s*)\*\*(.*?)\*\*/g, '$1')
      // Ensure bullet points stay on one line
      .replace(/^\s*-\s+(.*?)$/gm, (match, content) => 
        `- ${content.replace(/\n\s+/g, ' ')}`
      )
      // Remove extra whitespace and newlines
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();

    return (
      <div className="prose prose-slate max-w-none">
        <ReactMarkdown
          components={{
            p: ({node, ...props}) => {
              const text = props.children[0];
              // Only apply special formatting to section headers
              if (typeof text === 'string' && /^###\s*\d+\.\s*\*\*.*?\*\*/.test(text)) {
                return (
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {props.children}
                    </h3>
                  </div>
                );
              }
              return (
                <p className="text-gray-700 mb-3 leading-relaxed">
                  {props.children}
                </p>
              );
            },
            strong: ({node, ...props}) => {
              // Only apply bold to section headers
              const parentText = node.parent?.value;
              if (parentText && /^###\s*\d+\./.test(parentText)) {
                return (
                  <strong className="font-semibold text-gray-900">
                    {props.children}
                  </strong>
                );
              }
              // Return regular text for non-header content
              return <span>{props.children}</span>;
            },
          }}
        >
          {formattedText}
        </ReactMarkdown>
      </div>
    );
  };

  // Add these helper functions
  const cleanupText = (text) => {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .replace(/\s*-\s*/g, '-')
      .trim();
  };

  const formatNestedList = (text) => {
    const lines = text.split('\n');
    let level = 0;
    return lines.map(line => {
      const indent = line.match(/^\s*/)[0].length;
      level = Math.floor(indent / 2);
      return `<div class="list-item level-${level}">${line.trim()}</div>`;
    }).join('\n');
  };

  // Update the renderSearchBar function
  const renderSearchBar = () => (
    <div className="flex flex-col items-center w-full px-2 sm:px-0">
      {currentConversation.length === 0 && (
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          A question creates knowledge
        </h1>
      )}
      <div className={cn(
        "flex items-start bg-background",
        "border rounded-[8px]",
        "ring-offset-background",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        "w-[calc(107%-10px)] sm:w-full"
      )}>
        <Button
          onClick={handleNewConversation}
          variant="ghost"
          size="icon"
          className="h-[42px] w-[42px] rounded-l-lg flex items-center justify-center flex-shrink-0"
        >
          <PlusCircle className="h-5 w-5" />
        </Button>

        <div className="h-[42px] w-px bg-border mx-1 flex-shrink-0" />
        
        <form onSubmit={handleSearch} className="flex-grow flex items-start min-w-0">
          <Textarea
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              autoResizeTextarea(e.target);
            }}
            placeholder="Ask your question..."
            className={cn(
              "flex-grow",
              "border-0 focus-visible:ring-0 focus-visible:ring-offset-0",
              "py-2 px-4",
              "text-base",
              "transition-all duration-200 ease-out",
              "placeholder:text-gray-500",
              "focus:placeholder:opacity-0",
              "resize-none",
              "question-textarea",
              "hide-scrollbar",
              isLoading && currentConversation.length === 0 ? "opacity-50" : ""
            )}
            style={{
              resize: 'none',
              lineHeight: '1.5',
              caretColor: 'black',
              textAlign: 'left',
              paddingTop: '10px',
              paddingBottom: '10px',
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'break-word',
              minHeight: '42px',
              height: 'auto',
              maxHeight: '300px',
              overflow: 'hidden',
              WebkitOverflowScrolling: 'touch',
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
            className="h-[42px] w-[42px] rounded-r-lg flex items-center justify-center flex-shrink-0"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="animate-spin">⌛</span>
            ) : (
              <ArrowRight className="h-5 w-5" />
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
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`cursor-pointer hover:bg-gray-100 p-2 rounded mb-2 ${
                session.id === currentSessionId ? 'bg-gray-100' : ''
              }`}
              onClick={() => handleHistorySelect(session.id)}
            >
              {session.conversations && session.conversations.length > 0 ? (
                <p className="text-sm truncate">{session.conversations[0].question}</p>
              ) : (
                <p className="text-sm italic text-gray-500">New conversation</p>
              )}
              <p className="text-xs text-gray-500">
                {session.conversations && session.conversations.length > 0
                  ? new Date(session.conversations[0].timestamp).toLocaleDateString()
                  : 'No messages'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  // Add this effect to handle loading card scroll
  useEffect(() => {
    if (isLoading && loadingCardRef.current) {
      setTimeout(() => {
        loadingCardRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 100);
    }
  }, [isLoading]);

  // Update the renderLoadingFact function to use the ref
  const renderLoadingFact = () => {
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

  // Update the renderSourceVideos function
  const renderSourceVideos = (videoLinks) => {
    if (!videoLinks || Object.keys(videoLinks).length === 0) return null;

    const allVideos = Object.values(videoLinks).filter(video => video && video.urls?.[0]);
    
    if (allVideos.length === 0) return null;

    return (
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4">Related Videos</h3>
        <div className="relative">
          <div className="overflow-x-auto custom-scrollbar scroll-smooth">
            <div className="flex gap-4 pb-4 min-w-min">
              {allVideos.map((video, index) => {
                const videoId = getYoutubeVideoIds([video.urls[0]])[0];
                if (!videoId) return null;

                const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                const fullVideoUrl = video.urls[0].split('&t=')[0];

                return (
                  <div
                    key={index}
                    className="flex-shrink-0 w-[250px] bg-white rounded-[8px] border shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col"
                  >
                    <a
                      href={`${video.urls[0]}${video.timestamp ? `&t=${getStartTime(video.timestamp)}s` : ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block flex-grow"
                    >
                      <div className="relative">
                        <img 
                          src={thumbnailUrl}
                          alt={video.video_title || 'Video thumbnail'}
                          className="w-full h-[140px] object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-black/75 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          </div>
                        </div>
                      </div>
                      <div className="p-3 flex-grow">
                        <h4 className="font-medium text-sm line-clamp-2 mb-2">
                          {video.video_title || 'Video Title'}
                        </h4>
                        {video.description && (
                          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                            {video.description.replace(/"/g, '')}
                          </p>
                        )}
                        {video.timestamp && (
                          <div className="flex items-center text-sm text-gray-500 mb-2">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Starts at {video.timestamp}</span>
                          </div>
                        )}
                      </div>
                    </a>
                    {/* Fixed bottom section - Arrow removed */}
                    <div className="border-t bg-gray-50">
                      <a
                        href={fullVideoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 flex items-center justify-center hover:bg-gray-100 transition-colors group"
                      >
                        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                          Watch Full Video
                        </span>
                      </a>  
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

  // Update the scroll effect to ensure it works properly
  useEffect(() => {
    if (latestConversationRef.current && currentConversation.length > 0) {
      setTimeout(() => {
        latestConversationRef.current.scrollIntoView({ 
          behavior: 'smooth',
          block: 'start'
        });
      }, 100); // Small delay to ensure content is rendered
    }
  }, [currentConversation.length]);

  // Update the renderConversation function to properly use the ref
  const renderConversation = (conv, index) => (
    <div 
      key={conv.id}
      className={cn(
        "bg-white p-6 rounded-[8px] shadow mb-4 break-words whitespace-normal",
        index === 0 ? "mt-4" : ""
      )}
      ref={index === currentConversation.length - 1 ? latestConversationRef : null}
    >
      <h2 className="font-bold mb-4 break-words whitespace-normal">{conv.question}</h2>
      <div className="mb-4 break-words whitespace-normal">
        {formatResponse(conv.text || '', conv.videoLinks)}
      </div>
      {conv.related_products && conv.related_products.length > 0 && (
        <div className="mt-4">
          {renderRelatedProducts(conv.related_products)}
        </div>
      )}
      {renderSourceVideos(conv.videoLinks)}
    </div>
  );

  // Move the useEffect inside the component
  useEffect(() => {
    const setVH = () => {
      let vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', setVH);

    return () => {
      window.removeEventListener('resize', setVH);
      window.removeEventListener('orientationchange', setVH);
    };
  }, []);

  // Add these effects after your existing useEffects
  useEffect(() => {
    if (sessions.length > 0 && currentSessionId) {
      const currentSession = sessions.find(session => session.id === currentSessionId);
      if (currentSession) {
        setCurrentConversation(currentSession.conversations);
        localStorage.setItem('current_session_id', currentSessionId);
        setShowInitialQuestions(currentSession.conversations.length === 0);
      }
    }
  }, [sessions, currentSessionId]);

  useEffect(() => {
    const savedCurrentSessionId = localStorage.getItem('current_session_id');
    if (savedCurrentSessionId) {
      const savedSessions = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedSessions) {
        const parsedSessions = JSON.parse(savedSessions);
        const lastActiveSession = parsedSessions.find(session => session.id === savedCurrentSessionId);
        if (lastActiveSession) {
          setCurrentSessionId(lastActiveSession.id);
          setCurrentConversation(lastActiveSession.conversations);
          setShowInitialQuestions(lastActiveSession.conversations.length === 0);
          setSessions(parsedSessions);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
    }
  }, [sessions]);

  // Add this function to handle history selection
  const handleHistorySelect = (sessionId) => {
    const selectedSession = sessions.find(session => session.id === sessionId);
    if (selectedSession) {
      setCurrentSessionId(sessionId);
      setCurrentConversation(selectedSession.conversations);
      setShowInitialQuestions(selectedSession.conversations.length === 0);
      setIsSidebarOpen(false); // Close sidebar after selection
    }
  };

  // Add this effect to handle browser refresh
  useEffect(() => {
    const handleBrowserRefresh = (event) => {
      // Create new session
      const newSessionId = uuidv4();
      const newSession = { id: newSessionId, conversations: [] };
      
      // Update sessions in localStorage
      const updatedSessions = [...sessions, newSession];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedSessions));
      localStorage.setItem('current_session_id', newSessionId);
      
      // Clear current conversation
      setCurrentSessionId(newSessionId);
      setCurrentConversation([]);
      setShowInitialQuestions(true);
      setShowCenterSearch(true);
      setSearchQuery("");
    };

    // Add event listener for beforeunload (browser refresh)
    window.addEventListener('beforeunload', handleBrowserRefresh);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBrowserRefresh);
    };
  }, [sessions]);

  // Main render
  return (
    <div className="flex flex-col h-[calc(100vh-75px)] bg-white pt-[75px] watermark-background">
      {renderSidebar()}
      <div className="relative flex-grow overflow-hidden">
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
                <div className="w-[calc(100%-1px)] sm:w-full">
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
                  <div className="w-[calc(100%+0px)] sm:w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
            <div className="space-y-4 pb-[100px] conversation-container"> {/* Reduced bottom padding */}
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

// Update the styles to hide scrollbar and maintain smooth scrolling
const productStyles = `
  .hide-scrollbar {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;     /* Firefox */
    -webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS */
  }
  
  .hide-scrollbar::-webkit-scrollbar {
    display: none;  /* Chrome, Safari and Opera */
  }
  
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
`;

// Add this to handle FAQ questions
const handleFAQSelect = (index) => {
  setSearchQuery(randomQuestions[index]);
  setTimeout(() => {
    const textarea = document.querySelector('.question-textarea');
    if (textarea) {
      autoResizeTextarea(textarea);
    }
  }, 0);
};

// Add this helper function if not already present
const getStartTime = (timestamp) => {
  if (!timestamp) return 0;
  const [minutes, seconds] = timestamp.split(':').map(Number);
  return minutes * 60 + seconds;
};

// Update the autoResizeTextarea function to handle text content better
const autoResizeTextarea = (textarea) => {
  requestAnimationFrame(() => {
    // Store the current scroll position
    const scrollPos = textarea.scrollTop;
    
    // Reset height to auto
    textarea.style.height = 'auto';
    
    // Calculate the new height
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = window.innerWidth <= 640 ? Math.min(300, window.innerHeight * 0.5) : 300;
    
    if (scrollHeight > maxHeight) {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = 'auto';
      // Restore scroll position
      textarea.scrollTop = scrollPos;
    } else {
      textarea.style.height = `${scrollHeight}px`;
      textarea.style.overflowY = 'hidden';
    }
    
    // Force reflow for smooth transition
    textarea.offsetHeight;
  });
};

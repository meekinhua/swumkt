import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Eye, User, ArrowLeft, Loader2, ChevronDown, RefreshCw } from 'lucide-react';
import Navigation from '@/components/Navigation';

const ContentBrowse = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [displayedCount, setDisplayedCount] = useState(0);
  const loadMoreRef = useRef(null);
  const abortControllerRef = useRef(null);
  const isLoadingRef = useRef(false);
  
  const itemsPerBatch = 5;  // Load 5 items at a time
  const itemsPerPage = 20;  // Max items before going to next page

  // Calculate how many items we can still load on this page
  const canLoadMore = displayedCount < Math.min(itemsPerPage, totalItems - (currentPage - 1) * itemsPerPage) && totalItems > displayedCount;
  const hasMorePages = (currentPage * itemsPerPage) < totalItems;
  const showInfiniteScroll = canLoadMore || hasMorePages;

  const fetchInitialContents = async () => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    setLoading(true);
    setError(null);
    setContents([]);
    setDisplayedCount(0);
    isLoadingRef.current = true;
    
    try {
      const skip = (currentPage - 1) * itemsPerPage;
      const response = await axios.get(`${API}/content`, {
        params: { 
          skip: skip,
          limit: itemsPerBatch
        },
        signal: abortControllerRef.current.signal,
        timeout: 30000 // 30 second timeout
      });
      
      if (response.data.items) {
        setContents(response.data.items);
        setTotalItems(response.data.total);
        setDisplayedCount(response.data.items.length);
      } else {
        setContents(response.data);
        setTotalItems(response.data.length);
        setDisplayedCount(response.data.length);
      }
      setError(null);
    } catch (error) {
      if (axios.isCancel(error)) {
        console.log('Request cancelled');
        return;
      }
      console.error('Error fetching contents:', error);
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  };

  const loadMoreContents = useCallback(async () => {
    // Prevent multiple simultaneous calls
    if (isLoadingRef.current || loadingMore) return;
    
    // Check if we need to move to next page
    const currentPageFull = displayedCount >= itemsPerPage;
    const hasMoreContent = (currentPage * itemsPerPage) < totalItems;
    
    if (currentPageFull && hasMoreContent) {
      // Auto-move to next page
      isLoadingRef.current = true;
      setLoadingMore(true);
      setCurrentPage(prev => prev + 1);
      return;
    }
    
    // Load more items on current page
    if (!canLoadMore) return;
    
    isLoadingRef.current = true;
    setLoadingMore(true);
    
    try {
      const skip = (currentPage - 1) * itemsPerPage + displayedCount;
      const remainingOnPage = itemsPerPage - displayedCount;
      const limit = Math.min(itemsPerBatch, remainingOnPage);
      
      if (limit <= 0) {
        setLoadingMore(false);
        isLoadingRef.current = false;
        return;
      }
      
      const response = await axios.get(`${API}/content`, {
        params: { 
          skip: skip,
          limit: limit
        },
        timeout: 30000 // 30 second timeout
      });
      
      if (response.data.items) {
        setContents(prev => [...prev, ...response.data.items]);
        setDisplayedCount(prev => prev + response.data.items.length);
        setTotalItems(response.data.total);
      } else {
        setContents(prev => [...prev, ...response.data]);
        setDisplayedCount(prev => prev + response.data.length);
      }
    } catch (error) {
      console.error('Error loading more contents:', error);
      // Don't show error for load more, just stop loading
    } finally {
      setLoadingMore(false);
      isLoadingRef.current = false;
    }
  }, [currentPage, displayedCount, itemsPerPage, itemsPerBatch, canLoadMore, loadingMore]);

  const handleRetry = () => {
    fetchInitialContents();
  };

  const filteredContents = contents.filter(content => {
    const matchesSearch = content.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         content.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || content.content_type === filterType;
    return matchesSearch && matchesType;
  });

  const getTypeLabel = (type) => {
    const labels = {
      research: 'ผลวิจัย',
      survey: 'ผลสำรวจ',
      article: 'บทความ',
      news: 'ข่าวสาร'
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      {/* Navigation */}
      <Navigation />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8 fade-in-up">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-3 sm:mb-4 text-gray-800 font-semibold hover:text-[#00A9CE] hover:bg-[#00A9CE]/10 text-sm sm:text-base"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> {t('auth.backToHome')}
          </Button>
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-2 sm:mb-4" data-testid="browse-title">
            <span className="gradient-text">{t('content.browse')}</span>
          </h1>
          <p className="text-sm sm:text-lg text-gray-700 font-semibold">{t('landing.description')}</p>
        </div>

        {/* Search and Filter */}
        <Card className="p-4 sm:p-6 mb-6 sm:mb-8 bg-white/98 border-2 border-gray-300 shadow-lg">
          <div className="flex flex-col gap-4">
            {/* Search Input */}
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
              <Input
                data-testid="search-input"
                placeholder={t('content.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
              />
            </div>
            
            {/* Filter Tabs - Scrollable on mobile */}
            <div className="w-full overflow-x-auto scrollbar-hide">
              <Tabs value={filterType} onValueChange={setFilterType} className="w-full">
                <TabsList className="inline-flex min-w-max sm:grid sm:grid-cols-5 w-full bg-gray-100 p-1">
                  <TabsTrigger value="all" data-testid="filter-all" className="font-bold text-xs sm:text-sm px-3 sm:px-4 whitespace-nowrap">{t('content.allContent')}</TabsTrigger>
                  <TabsTrigger value="research" data-testid="filter-research" className="font-bold text-xs sm:text-sm px-3 sm:px-4 whitespace-nowrap">{t('features.marketResearch.title')}</TabsTrigger>
                  <TabsTrigger value="survey" data-testid="filter-survey" className="font-bold text-xs sm:text-sm px-3 sm:px-4 whitespace-nowrap">Survey</TabsTrigger>
                  <TabsTrigger value="article" data-testid="filter-article" className="font-bold text-xs sm:text-sm px-3 sm:px-4 whitespace-nowrap">Article</TabsTrigger>
                  <TabsTrigger value="news" data-testid="filter-news" className="font-bold text-xs sm:text-sm px-3 sm:px-4 whitespace-nowrap">News</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </Card>

        {/* Content Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#00A9CE] mx-auto"></div>
            <p className="mt-4 text-gray-600 font-medium">กำลังโหลดข้อมูล...</p>
          </div>
        ) : error ? (
          <Card className="p-8 sm:p-12 text-center bg-white/98 border-2 border-red-200 shadow-lg">
            <div className="text-red-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-gray-700 text-base sm:text-lg font-semibold mb-4">{error}</p>
            <Button 
              onClick={handleRetry}
              className="bg-gradient-to-r from-[#00A9CE] to-[#33BCDA] hover:from-[#008FB5] hover:to-[#00A9CE] text-white font-bold"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              ลองใหม่อีกครั้ง
            </Button>
          </Card>
        ) : filteredContents.length === 0 ? (
          <Card className="p-8 sm:p-12 text-center bg-white/98 border-2 border-gray-300 shadow-lg">
            <p className="text-gray-700 text-base sm:text-lg font-semibold">{t('content.noResults')}</p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {filteredContents.map((content, index) => (
              <Card
                key={content.id}
                className="p-4 sm:p-6 bg-white/98 hover:shadow-2xl transition-all duration-300 cursor-pointer border-2 border-gray-300 hover:border-[#00A9CE] card-hover scale-in"
                onClick={() => navigate(`/content/${content.id}`)}
                data-testid={`content-card-${index}`}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {/* Show cover image, featured_image, or first image attachment */}
                {(() => {
                  // Check if there's a cover_image_id (selected from attachments)
                  if (content.cover_image_id && content.attachments) {
                    const coverImage = content.attachments.find(att => att.id === content.cover_image_id);
                    if (coverImage && coverImage.file_data) {
                      return (
                        <div className="mb-3 sm:mb-4 rounded-lg overflow-hidden">
                          <img
                            src={coverImage.file_data}
                            alt={content.title}
                            className="w-full h-36 sm:h-48 object-cover"
                          />
                        </div>
                      );
                    }
                  }
                  
                  // Check if there's a featured_image (legacy support)
                  if (content.featured_image) {
                    return (
                      <div className="mb-3 sm:mb-4 rounded-lg overflow-hidden">
                        <img
                          src={content.featured_image}
                          alt={content.title}
                          className="w-full h-36 sm:h-48 object-cover"
                        />
                      </div>
                    );
                  }
                  
                  // Otherwise, check for first image attachment
                  const imageAttachments = content.attachments?.filter(
                    att => att.file_type && att.file_type.startsWith('image/')
                  ) || [];
                  
                  if (imageAttachments.length > 0 && imageAttachments[0].file_data) {
                    return (
                      <div className="mb-3 sm:mb-4 rounded-lg overflow-hidden">
                        <img
                          src={imageAttachments[0].file_data}
                          alt={content.title}
                          className="w-full h-36 sm:h-48 object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </div>
                    );
                  }
                  
                  return null;
                })()}
                
                <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                  <span className="badge-success text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-full">
                    {getTypeLabel(content.content_type)}
                  </span>
                  {content.category && (
                    <span className="badge-warning text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-full">
                      {content.category}
                    </span>
                  )}
                </div>

                <h3 className="text-base sm:text-xl font-black text-gray-900 mb-2 line-clamp-2">
                  {content.title}
                </h3>
                
                <p className="text-gray-700 mb-3 sm:mb-4 line-clamp-2 sm:line-clamp-3 text-xs sm:text-sm font-medium">
                  {content.content.replace(/<[^>]*>/g, '').substring(0, 150)}...
                </p>

                {content.tags && content.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 sm:gap-2 mb-3 sm:mb-4">
                    {content.tags.slice(0, 3).map((tag, idx) => (
                      <span key={idx} className="text-xs px-2 py-1 bg-[#00A9CE]/10 text-[#005A73] rounded font-semibold border border-[#00A9CE]/20">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs sm:text-sm text-gray-600 font-semibold">
                  <div className="flex items-center gap-1">
                    <Eye className="w-3 h-3 sm:w-4 sm:h-4 text-[#00A9CE]" />
                    <span>{content.views || 0} {t('stats.access')}</span>
                  </div>
                  {content.contributors && content.contributors.length > 0 && (
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3 sm:w-4 sm:h-4 text-[#00A9CE]" />
                      <span>{content.contributors.length}</span>
                    </div>
                  )}
                </div>
              </Card>
              ))}
            </div>
            
            {/* Infinite Scroll Trigger - auto-loads on scroll */}
            {showInfiniteScroll && (
              <div 
                ref={loadMoreRef}
                className="mt-6 sm:mt-8 flex flex-col items-center justify-center gap-3"
              >
                {loadingMore ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-[#00A9CE] animate-spin" />
                    <span className="text-sm sm:text-base text-gray-600 font-semibold">กำลังโหลดเนื้อหาเพิ่มเติม...</span>
                  </div>
                ) : (
                  <Button
                    onClick={loadMoreContents}
                    className="bg-gradient-to-r from-[#00A9CE] to-[#33BCDA] hover:from-[#008FB5] hover:to-[#00A9CE] text-white font-bold px-6 sm:px-8 py-2.5 sm:py-3 shadow-lg text-sm sm:text-base"
                  >
                    <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    โหลดเพิ่ม ({displayedCount}/{totalItems})
                  </Button>
                )}
                
                {/* Progress indicator */}
                <div className="bg-white/80 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 shadow-md border border-gray-200">
                  <span className="text-xs sm:text-sm font-semibold text-gray-600">
                    แสดง {filteredContents.length} จาก {totalItems} รายการ
                  </span>
                </div>
              </div>
            )}
            
            {/* End of content message */}
            {!showInfiniteScroll && filteredContents.length > 0 && (
              <div className="mt-8 flex flex-col items-center gap-3">
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg px-6 py-4 shadow-md border-2 border-green-200">
                  <p className="text-center text-gray-700 font-semibold text-sm sm:text-base">
                    ✅ แสดงครบทั้งหมด {totalItems} รายการแล้ว
                  </p>
                </div>
                <Button
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  variant="outline"
                  className="border-2 border-[#00A9CE] text-[#00A9CE] hover:bg-[#00A9CE]/10 font-bold text-sm"
                >
                  ↑ กลับขึ้นด้านบน
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ContentBrowse;
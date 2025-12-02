import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Avatar } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Eye, Edit, Users, MessageCircle, Send, Languages, Paperclip, Download, Image as ImageIcon, X, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';
import MermaidViewer from '@/components/MermaidViewer';

// Image Lightbox Component
const ImageLightbox = ({ images, currentIndex, onClose, onNext, onPrev }) => {
  if (currentIndex < 0 || !images || images.length === 0) return null;
  
  const currentImage = images[currentIndex];
  const imgSrc = currentImage?.file_data || currentImage?.data || currentImage?.url;
  
  // Handle keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrev]);
  
  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-50"
      >
        <X className="w-8 h-8 text-white" />
      </button>
      
      {/* Image counter */}
      <div className="absolute top-4 left-4 px-4 py-2 bg-white/10 rounded-full">
        <span className="text-white font-bold">{currentIndex + 1} / {images.length}</span>
      </div>
      
      {/* Previous button */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
        >
          <ChevronLeft className="w-8 h-8 text-white" />
        </button>
      )}
      
      {/* Image */}
      <div 
        className="max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imgSrc}
          alt={currentImage?.filename || currentImage?.title || `Image ${currentIndex + 1}`}
          className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
        />
      </div>
      
      {/* Next button */}
      {images.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
        >
          <ChevronRight className="w-8 h-8 text-white" />
        </button>
      )}
      
      {/* Image title */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 bg-white/10 rounded-full max-w-[80vw]">
        <p className="text-white font-medium text-center truncate">
          {currentImage?.filename || currentImage?.title || `รูปภาพ ${currentIndex + 1}`}
        </p>
      </div>
    </div>
  );
};

const ContentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  const [content, setContent] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [translatedContent, setTranslatedContent] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('');
  
  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxImages, setLightboxImages] = useState([]);

  const openLightbox = (images, index) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    document.body.style.overflow = 'auto';
  };

  const nextImage = () => {
    setLightboxIndex((prev) => (prev + 1) % lightboxImages.length);
  };

  const prevImage = () => {
    setLightboxIndex((prev) => (prev - 1 + lightboxImages.length) % lightboxImages.length);
  };

  useEffect(() => {
    fetchContent();
    fetchComments();
  }, [id]);

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API}/content/${id}`);
      const contentData = response.data;
      
      // Fetch creator details
      try {
        const creatorResponse = await axios.get(`${API}/users/${contentData.created_by}`);
        contentData.creatorDetails = creatorResponse.data;
      } catch (err) {
        console.error('Error fetching creator:', err);
      }
      
      // Fetch user details for group members
      if (contentData.group_members && contentData.group_members.length > 0) {
        const memberPromises = contentData.group_members.map(async (memberId) => {
          try {
            const userResponse = await axios.get(`${API}/users/${memberId}`);
            return userResponse.data;
          } catch (err) {
            console.error(`Error fetching user ${memberId}:`, err);
            return null;
          }
        });
        const members = await Promise.all(memberPromises);
        contentData.groupMemberDetails = members.filter(m => m !== null);
      }
      
      setContent(contentData);
    } catch (error) {
      console.error('Error fetching content:', error);
      toast.error(t('content.notFound') || 'ไม่พบเนื้อหา');
      navigate('/content');
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    try {
      const response = await axios.get(`${API}/comments/${id}`);
      setComments(response.data);
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error('กรุณาเข้าสู่ระบบเพื่อแสดงความคิดเห็น');
      return;
    }

    if (!newComment.trim()) return;

    setSubmittingComment(true);
    try {
      await axios.post(
        `${API}/comments`,
        { content_id: id, comment_text: newComment },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewComment('');
      fetchComments();
      toast.success('แสดงความคิดเห็นสำเร็จ');
    } catch (error) {
      console.error('Error submitting comment:', error);
      toast.error('ไม่สามารถแสดงความคิดเห็นได้');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleTranslate = async () => {
    if (!targetLanguage) {
      toast.error(t('common.error'));
      return;
    }

    setTranslating(true);
    try {
      const response = await axios.post(`${API}/translate`, {
        text: content.content,
        target_language: targetLanguage
      });
      setTranslatedContent(response.data.translated_text);
      toast.success(t('common.success'));
    } catch (error) {
      console.error('Translation error:', error);
      toast.error(t('common.error'));
    } finally {
      setTranslating(false);
    }
  };

  const canEdit = user && content && (content.created_by === user.id || user.role === 'admin');

  const getTypeLabel = (type) => {
    const labels = {
      research: 'ผลวิจัย',
      survey: 'ผลสำรวจ',
      article: 'บทความ',
      news: 'ข่าวสาร'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #E8ECF1 100%)' }}>
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#00A9CE]"></div>
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      {/* Navigation */}
      <Navigation />

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button variant="ghost" onClick={() => navigate('/content')} data-testid="back-to-browse-btn" className="mb-4 text-gray-800 hover:text-[#00A9CE]">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('content.back')}
        </Button>
        <Card className="p-8 mb-8 bg-white/98 border-2 border-gray-300 shadow-xl fade-in-up" data-testid="content-detail-card">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="badge-success text-sm px-3 py-1.5 rounded-full" data-testid="content-type-badge">
                  {getTypeLabel(content.content_type)}
                </span>
                {content.category && (
                  <span className="badge-warning text-sm px-3 py-1.5 rounded-full">
                    {content.category}
                  </span>
                )}
              </div>
              {canEdit && (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/content/edit/${id}`)}
                  data-testid="edit-content-btn"
                  className="border-2 border-[#00A9CE] text-[#005A73] hover:bg-[#00A9CE]/10 font-bold"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  แก้ไข
                </Button>
              )}
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4" data-testid="content-title">
              {content.title}
            </h1>

            <div className="flex items-center gap-4 text-sm text-gray-700 font-semibold">
              <div className="flex items-center gap-1">
                <Eye className="w-4 h-4 text-[#00A9CE]" />
                <span data-testid="content-views">{content.views || 0} ครั้งที่เข้าชม</span>
              </div>
              {(content.creatorDetails || (content.group_members && content.group_members.length > 0)) && (
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4 text-[#00A9CE]" />
                  <span>
                    {1 + (content.group_members?.length || 0)} {t('content.creators') || 'ผู้สร้าง'}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <MessageCircle className="w-4 h-4 text-[#00A9CE]" />
                <span data-testid="content-comments-count">
                  {comments.length} {t('content.comments') || 'ความคิดเห็น'}
                </span>
              </div>
            </div>
          </div>

          {/* Cover Image - Show cover_image_id, featured_image, or first image attachment */}
          {(() => {
            // Check if there's a cover_image_id (selected from attachments)
            if (content.cover_image_id && content.attachments) {
              const coverImage = content.attachments.find(att => att.id === content.cover_image_id);
              if (coverImage) {
                const imageSrc = coverImage.file_data || coverImage.url || coverImage.data;
                if (imageSrc) {
                  return (
                    <div className="mb-6 rounded-lg overflow-hidden border-2 border-gray-200">
                      <img
                        src={imageSrc}
                        alt={content.title}
                        className="w-full h-auto"
                      />
                    </div>
                  );
                }
              }
            }
            
            // Check if there's a featured_image (legacy support)
            if (content.featured_image) {
              return (
                <div className="mb-6 rounded-lg overflow-hidden border-2 border-gray-200">
                  <img
                    src={content.featured_image}
                    alt={content.title}
                    className="w-full h-auto"
                  />
                </div>
              );
            }
            
            // Otherwise, check for first image attachment
            const imageAttachments = content.attachments?.filter(
              att => att.file_type && att.file_type.startsWith('image/')
            ) || [];
            
            if (imageAttachments.length > 0) {
              const firstImage = imageAttachments[0];
              const imageSrc = firstImage.url || firstImage.data || firstImage.file_data;
              
              if (imageSrc) {
                return (
                  <div className="mb-6 rounded-lg overflow-hidden border-2 border-gray-200">
                    <img
                      src={imageSrc}
                      alt={content.title}
                      className="w-full h-auto"
                      onError={(e) => {
                        console.error('Image failed to load:', firstImage.title);
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                );
              }
            }
            
            return null;
          })()}

          {/* Journey Map Viewer - Show if this is a journey map content */}
          {content.journey_map_metadata && content.journey_map_metadata.mermaid_code && (
            <MermaidViewer code={content.journey_map_metadata.mermaid_code} />
          )}

          {/* Content Body */}
          <div className="prose max-w-none mb-6" data-testid="content-body">
            <div className="flex items-center justify-between mb-4 p-4 bg-[#00A9CE]/5 rounded-lg border border-[#00A9CE]/20">
              <h3 className="text-lg font-black text-gray-900">{t('content.originalText')}</h3>
              <div className="flex items-center gap-3">
                <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                  <SelectTrigger className="w-40 border-2 border-[#00A9CE]">
                    <SelectValue placeholder={t('content.translate')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="th">ไทย</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="ja">日本語</SelectItem>
                    <SelectItem value="ko">한국어</SelectItem>
                    <SelectItem value="my">မြန်မာ</SelectItem>
                    <SelectItem value="lo">ລາວ</SelectItem>
                    <SelectItem value="vi">Tiếng Việt</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleTranslate}
                  disabled={!targetLanguage || translating}
                  className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] text-white font-bold"
                >
                  {translating ? (
                    <>{t('content.translating')}</>
                  ) : (
                    <>
                      <Languages className="w-4 h-4 mr-2" />
                      {t('content.translate')}
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            <div 
              className="text-gray-800 leading-relaxed"
              style={{
                lineHeight: '1.8',
                fontSize: '1.125rem'
              }}
              dangerouslySetInnerHTML={{ __html: content.content }}
            />
          </div>

          {/* Translated Content */}
          {translatedContent && (
            <div className="prose max-w-none mb-6 p-6 bg-gradient-to-br from-[#00A9CE]/10 to-[#33BCDA]/10 rounded-lg border-2 border-[#00A9CE]/30">
              <h3 className="text-lg font-black text-[#005A73] mb-4">{t('content.translatedText')}</h3>
              <p className="text-gray-800 leading-relaxed whitespace-pre-wrap text-lg font-medium">
                {translatedContent}
              </p>
            </div>
          )}

          {/* Attachments - Show ALL attachments with lightbox for images */}
          {(() => {
            if (!content.attachments || content.attachments.length === 0) return null;
            
            // Get all image attachments for lightbox navigation
            const imageAttachments = content.attachments.filter(
              att => att.file_type && att.file_type.startsWith('image/')
            );
            const nonImageAttachments = content.attachments.filter(
              att => !att.file_type || !att.file_type.startsWith('image/')
            );
            
            return (
              <div className="mb-6 p-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border-2 border-blue-200">
                <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                  <Paperclip className="w-5 h-5 text-[#00A9CE]" />
                  ไฟล์แนบทั้งหมด ({content.attachments.length})
                </h3>
                
                {/* Image Grid */}
                {imageAttachments.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      รูปภาพ ({imageAttachments.length}) - คลิกเพื่อดูขนาดเต็ม
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {imageAttachments.map((attachment, idx) => {
                        const imgSrc = attachment.file_data || attachment.data || attachment.url;
                        return (
                          <div 
                            key={attachment.id || idx} 
                            className="group relative bg-white rounded-lg border-2 border-gray-200 hover:border-[#00A9CE] transition-all cursor-pointer overflow-hidden aspect-square"
                            onClick={() => openLightbox(imageAttachments, idx)}
                          >
                            {imgSrc ? (
                              <>
                                <img
                                  src={imgSrc}
                                  alt={attachment.filename || attachment.title || `รูปภาพ ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-size="12">Error</text></svg>';
                                  }}
                                />
                                {/* Hover overlay */}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                                  <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                {/* Image info overlay */}
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                                  <p className="text-white text-xs font-medium truncate">
                                    {attachment.filename || attachment.title || `รูปภาพ ${idx + 1}`}
                                  </p>
                                  {attachment.file_size_kb && (
                                    <p className="text-white/70 text-xs">{attachment.file_size_kb} KB</p>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                <ImageIcon className="w-8 h-8 text-gray-400" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* Non-Image Files */}
                {nonImageAttachments.length > 0 && (
                  <div>
                    <p className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
                      <Paperclip className="w-4 h-4" />
                      ไฟล์อื่นๆ ({nonImageAttachments.length})
                    </p>
                    <div className="space-y-2">
                      {nonImageAttachments.map((attachment, idx) => (
                        <div 
                          key={attachment.id || idx} 
                          className="flex items-center justify-between bg-white p-3 rounded-lg border-2 border-gray-200 hover:border-[#00A9CE] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Paperclip className="w-5 h-5 text-gray-500" />
                            <div>
                              <p className="text-sm font-bold text-gray-900">{attachment.filename || attachment.title || 'ไฟล์แนบ'}</p>
                              <p className="text-xs text-gray-500">
                                {attachment.file_type || 'Unknown'} 
                                {attachment.file_size_kb ? ` • ${attachment.file_size_kb} KB` : ''}
                              </p>
                            </div>
                          </div>
                          {attachment.file_data && (
                            <a
                              href={attachment.file_data}
                              download={attachment.filename}
                              className="flex items-center gap-2 px-4 py-2 bg-[#00A9CE] hover:bg-[#008FB5] text-white rounded-lg font-bold transition-colors"
                            >
                              <Download className="w-4 h-4" />
                              ดาวน์โหลด
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          
          {/* Lightbox */}
          {lightboxOpen && (
            <ImageLightbox
              images={lightboxImages}
              currentIndex={lightboxIndex}
              onClose={closeLightbox}
              onNext={nextImage}
              onPrev={prevImage}
            />
          )}

          {/* Tags */}
          {content.tags && content.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {content.tags.map((tag, idx) => (
                <span key={idx} className="text-sm px-3 py-1.5 bg-[#00A9CE]/10 text-[#005A73] rounded-full font-bold border border-[#00A9CE]/20">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Contributors & Group Members */}
          {(content.creatorDetails || 
            (content.contributors && content.contributors.length > 0) || 
            (content.groupMemberDetails && content.groupMemberDetails.length > 0)) && (
            <div className="border-t-2 border-gray-300 pt-6">
              <h3 className="text-lg font-black text-gray-900 mb-4">
                {content.is_zbs04_assignment ? t('content.creators') || 'ผู้สร้าง Content' : t('content.contributors') || 'ผู้มีส่วนร่วม'}
              </h3>
              <div className="flex flex-wrap gap-4">
                {/* Show creator first for ZBS04 assignments */}
                {content.is_zbs04_assignment && content.creatorDetails && (
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border-2 border-green-300">
                    {content.creatorDetails.google_picture || content.creatorDetails.avatar_url ? (
                      <img 
                        src={content.creatorDetails.google_picture || content.creatorDetails.avatar_url} 
                        alt={content.creatorDetails.full_name}
                        className="w-12 h-12 rounded-full border-2 border-green-500 object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br from-green-600 to-green-500 items-center justify-center text-white font-bold ${content.creatorDetails.google_picture || content.creatorDetails.avatar_url ? 'hidden' : 'flex'}`}>
                      {content.creatorDetails.full_name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{content.creatorDetails.full_name}</p>
                      <p className="text-xs text-gray-600 font-semibold">{content.creatorDetails.email}</p>
                      <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-green-600 text-white rounded-full font-bold">
                        {t('content.creator') || 'ผู้สร้าง'}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Show group members for ZBS04 assignments */}
                {content.is_zbs04_assignment && content.groupMemberDetails ? (
                  content.groupMemberDetails
                    .filter(member => member.id !== content.created_by) // Don't show creator twice
                    .map((member, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-[#00A9CE]/5 rounded-lg border border-[#00A9CE]/20">
                        {member.google_picture || member.avatar_url ? (
                          <img 
                            src={member.google_picture || member.avatar_url} 
                            alt={member.full_name}
                            className="w-12 h-12 rounded-full border-2 border-[#00A9CE] object-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div className={`w-12 h-12 rounded-full bg-gradient-to-br from-[#007B9A] to-[#00A9CE] items-center justify-center text-white font-bold ${member.google_picture || member.avatar_url ? 'hidden' : 'flex'}`}>
                          {member.full_name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{member.full_name}</p>
                          <p className="text-xs text-gray-600 font-semibold">{member.email}</p>
                        </div>
                      </div>
                    ))
                ) : (
                  /* Show contributors for regular content */
                  content.contributors && content.contributors.map((contributor, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-3 bg-[#00A9CE]/5 rounded-lg border border-[#00A9CE]/20">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#007B9A] to-[#00A9CE] flex items-center justify-center text-white font-bold">
                        {contributor.user_name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{contributor.user_name}</p>
                        <p className="text-xs text-gray-600 font-semibold">{contributor.role}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Comments Section */}
        <Card className="p-8 bg-white/98 border-2 border-gray-300 shadow-xl">
          <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-[#00A9CE]" />
            ความคิดเห็น ({comments.length})
          </h2>

          {/* Comment Form */}
          {user ? (
            <form onSubmit={handleCommentSubmit} className="mb-8" data-testid="comment-form">
              <Textarea
                data-testid="comment-input"
                placeholder="แสดงความคิดเห็นของคุณ..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
                className="mb-2 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
              />
              <Button
                type="submit"
                data-testid="submit-comment-btn"
                disabled={submittingComment || !newComment.trim()}
                className="bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl"
              >
                {submittingComment ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    กำลังส่ง...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    ส่งความคิดเห็น
                  </span>
                )}
              </Button>
            </form>
          ) : (
            <div className="mb-8 p-6 bg-[#00A9CE]/5 rounded-lg text-center border-2 border-[#00A9CE]/20">
              <p className="text-gray-700 mb-3 font-semibold">กรุณาเข้าสู่ระบบเพื่อแสดงความคิดเห็น</p>
              <Button onClick={() => navigate('/login')} className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] text-white font-bold">
                เข้าสู่ระบบ
              </Button>
            </div>
          )}

          {/* Comments List */}
          <div className="space-y-4">
            {comments.length === 0 ? (
              <p className="text-center text-gray-600 py-8 font-semibold">ยังไม่มีความคิดเห็น</p>
            ) : (
              comments.map((comment, idx) => (
                <div key={comment.id} className="flex gap-3 p-4 bg-gray-50 rounded-lg border-2 border-gray-200" data-testid={`comment-${idx}`}>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#007B9A] to-[#00A9CE] flex items-center justify-center text-white font-bold flex-shrink-0">
                    {comment.user_name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-900">{comment.user_name}</span>
                      <span className="text-xs text-gray-600 font-semibold">
                        {new Date(comment.created_at).toLocaleDateString('th-TH')}
                      </span>
                    </div>
                    <p className="text-gray-800 font-medium">{comment.comment_text}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ContentDetail;
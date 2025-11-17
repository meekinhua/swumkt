import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Avatar } from '@/components/ui/avatar';
import { ArrowLeft, Eye, Edit, Users, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';

const ContentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [content, setContent] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    fetchContent();
    fetchComments();
  }, [id]);

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API}/content/${id}`);
      setContent(response.data);
    } catch (error) {
      console.error('Error fetching content:', error);
      toast.error('ไม่พบเนื้อหา');
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                S
              </div>
              <span className="text-xl font-bold text-gray-900">SWUMKT</span>
            </div>
            
            <Button variant="ghost" onClick={() => navigate('/content')} data-testid="back-to-browse-btn">
              <ArrowLeft className="w-4 h-4 mr-2" />
              กลับไปยังคลังความรู้
            </Button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="p-8 mb-8" data-testid="content-detail-card">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-medium" data-testid="content-type-badge">
                  {getTypeLabel(content.content_type)}
                </span>
                {content.category && (
                  <span className="text-sm px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                    {content.category}
                  </span>
                )}
              </div>
              {canEdit && (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/content/edit/${id}`)}
                  data-testid="edit-content-btn"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  แก้ไข
                </Button>
              )}
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" data-testid="content-title">
              {content.title}
            </h1>

            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Eye className="w-4 h-4" />
                <span data-testid="content-views">{content.views || 0} ครั้งที่เข้าชม</span>
              </div>
              {content.contributors && content.contributors.length > 0 && (
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>{content.contributors.length} ผู้มีส่วนร่วม</span>
                </div>
              )}
            </div>
          </div>

          {/* Featured Image */}
          {content.featured_image && (
            <div className="mb-6 rounded-lg overflow-hidden">
              <img
                src={content.featured_image}
                alt={content.title}
                className="w-full h-auto"
              />
            </div>
          )}

          {/* Content Body */}
          <div className="prose max-w-none mb-6" data-testid="content-body">
            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
              {content.content}
            </p>
          </div>

          {/* Tags */}
          {content.tags && content.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {content.tags.map((tag, idx) => (
                <span key={idx} className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Contributors */}
          {content.contributors && content.contributors.length > 0 && (
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">ผู้มีส่วนร่วม</h3>
              <div className="flex flex-wrap gap-4">
                {content.contributors.map((contributor, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Avatar className="w-8 h-8 bg-blue-100 text-blue-600 flex items-center justify-center">
                      {contributor.user_name.charAt(0)}
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{contributor.user_name}</p>
                      <p className="text-xs text-gray-500">{contributor.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Comments Section */}
        <Card className="p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <MessageCircle className="w-6 h-6" />
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
                className="mb-2"
              />
              <Button
                type="submit"
                data-testid="submit-comment-btn"
                disabled={submittingComment || !newComment.trim()}
                className="bg-blue-600 hover:bg-blue-700"
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
            <div className="mb-8 p-4 bg-gray-50 rounded-lg text-center">
              <p className="text-gray-600 mb-2">กรุณาเข้าสู่ระบบเพื่อแสดงความคิดเห็น</p>
              <Button onClick={() => navigate('/login')} className="bg-blue-600 hover:bg-blue-700">
                เข้าสู่ระบบ
              </Button>
            </div>
          )}

          {/* Comments List */}
          <div className="space-y-4">
            {comments.length === 0 ? (
              <p className="text-center text-gray-500 py-8">ยังไม่มีความคิดเห็น</p>
            ) : (
              comments.map((comment, idx) => (
                <div key={comment.id} className="flex gap-3 p-4 bg-gray-50 rounded-lg" data-testid={`comment-${idx}`}>
                  <Avatar className="w-10 h-10 bg-blue-100 text-blue-600 flex items-center justify-center">
                    {comment.user_name.charAt(0)}
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">{comment.user_name}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(comment.created_at).toLocaleDateString('th-TH')}
                      </span>
                    </div>
                    <p className="text-gray-700">{comment.comment_text}</p>
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
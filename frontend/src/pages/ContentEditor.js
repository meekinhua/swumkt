import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

const ContentEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    content_type: 'article',
    category: '',
    tags: [],
    featured_image: '',
    status: 'draft'
  });
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (id) {
      fetchContent();
    }
  }, [id]);

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API}/content/${id}`);
      const content = response.data;
      
      // Check if user can edit
      if (content.created_by !== user.id && user.role !== 'admin') {
        toast.error('คุณไม่มีสิทธิ์แก้ไขเนื้อหานี้');
        navigate('/dashboard');
        return;
      }

      setFormData({
        title: content.title,
        content: content.content,
        content_type: content.content_type,
        category: content.category || '',
        tags: content.tags || [],
        featured_image: content.featured_image || '',
        status: content.status
      });
    } catch (error) {
      console.error('Error fetching content:', error);
      toast.error('ไม่สามารถโหลดเนื้อหาได้');
      navigate('/dashboard');
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()]
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData = { ...formData };
      if (!submitData.category) delete submitData.category;
      if (!submitData.featured_image) delete submitData.featured_image;

      if (id) {
        // Update existing content
        await axios.put(`${API}/content/${id}`, submitData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('บันทึกเนื้อหาสำเร็จ');
      } else {
        // Create new content
        const response = await axios.post(`${API}/content`, submitData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('สร้างเนื้อหาสำเร็จ');
        navigate(`/content/${response.data.id}`);
        return;
      }
      
      navigate(`/content/${id}`);
    } catch (error) {
      console.error('Error saving content:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถบันทึกเนื้อหาได้');
    } finally {
      setLoading(false);
    }
  };

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
            
            <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="back-to-dashboard-btn">
              <ArrowLeft className="w-4 h-4 mr-2" />
              กลับ Dashboard
            </Button>
          </div>
        </div>
      </nav>

      {/* Editor */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8" data-testid="editor-title">
            {id ? 'แก้ไขเนื้อหา' : 'สร้างเนื้อหาใหม่'}
          </h1>

          <form onSubmit={handleSubmit} data-testid="content-editor-form">
            <div className="space-y-6">
              {/* Title */}
              <div>
                <Label htmlFor="title">หัวข้อ *</Label>
                <Input
                  id="title"
                  data-testid="title-input"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="ใส่หัวข้อเนื้อหา..."
                  required
                  className="mt-1"
                />
              </div>

              {/* Content Type */}
              <div>
                <Label htmlFor="content_type">ประเภทเนื้อหา *</Label>
                <Select
                  value={formData.content_type}
                  onValueChange={(value) => setFormData({ ...formData, content_type: value })}
                >
                  <SelectTrigger className="mt-1" data-testid="content-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="research" data-testid="type-research">ผลวิจัย</SelectItem>
                    <SelectItem value="survey" data-testid="type-survey">ผลสำรวจ</SelectItem>
                    <SelectItem value="article" data-testid="type-article">บทความ</SelectItem>
                    <SelectItem value="news" data-testid="type-news">ข่าวสาร</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Category */}
              <div>
                <Label htmlFor="category">หมวดหมู่</Label>
                <Input
                  id="category"
                  data-testid="category-input"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="เช่น การตลาดดิจิทัล, พฤติกรรมผู้บริโภค..."
                  className="mt-1"
                />
              </div>

              {/* Content */}
              <div>
                <Label htmlFor="content">เนื้อหา *</Label>
                <Textarea
                  id="content"
                  data-testid="content-textarea"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="เขียนเนื้อหาของคุณที่นี่..."
                  required
                  rows={12}
                  className="mt-1"
                />
              </div>

              {/* Featured Image URL */}
              <div>
                <Label htmlFor="featured_image">ลิงก์รูปภาพ</Label>
                <Input
                  id="featured_image"
                  data-testid="featured-image-input"
                  value={formData.featured_image}
                  onChange={(e) => setFormData({ ...formData, featured_image: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                  className="mt-1"
                />
                {formData.featured_image && (
                  <div className="mt-2">
                    <img
                      src={formData.featured_image}
                      alt="Preview"
                      className="w-full max-h-64 object-cover rounded-lg"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Tags */}
              <div>
                <Label htmlFor="tags">แท็ก</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="tags"
                    data-testid="tag-input"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="เพิ่มแท็ก..."
                  />
                  <Button
                    type="button"
                    data-testid="add-tag-btn"
                    onClick={handleAddTag}
                    variant="outline"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {formData.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        data-testid={`tag-${idx}`}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          data-testid={`remove-tag-${idx}`}
                          className="hover:text-blue-900"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Status */}
              <div>
                <Label htmlFor="status">สถานะ *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger className="mt-1" data-testid="status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft" data-testid="status-draft">แบบร่าง</SelectItem>
                    <SelectItem value="published" data-testid="status-published">เผยแพร่</SelectItem>
                    <SelectItem value="archived" data-testid="status-archived">เก็บถาวร</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="submit"
                  data-testid="save-content-btn"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      กำลังบันทึก...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Save className="w-4 h-4" />
                      {id ? 'บันทึกการเปลี่ยนแปลง' : 'สร้างเนื้อหา'}
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="cancel-btn"
                  onClick={() => navigate('/dashboard')}
                  disabled={loading}
                >
                  ยกเลิก
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default ContentEditor;
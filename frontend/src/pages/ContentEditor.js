import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Plus, X, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import Navigation from '@/components/Navigation';

const ContentEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    content_type: 'article',
    category: '',
    tags: [],
    featured_image: '',
    status: 'draft',
    attachments: [],
    is_zbs04_assignment: false,
    zbs04_assignment_type: '',
    group_members: []
  });
  const [tagInput, setTagInput] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [memberDetails, setMemberDetails] = useState([]);

  useEffect(() => {
    if (id) {
      fetchContent();
    }
  }, [id]);

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API}/content/${id}`);
      const content = response.data;
      
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
        status: content.status,
        attachments: content.attachments || [],
        is_zbs04_assignment: content.is_zbs04_assignment || false,
        zbs04_assignment_type: content.zbs04_assignment_type || '',
        group_members: content.group_members || []
      });

      // Fetch member details for existing group members
      if (content.group_members && content.group_members.length > 0) {
        const memberPromises = content.group_members.map(async (memberId) => {
          try {
            const memberResponse = await axios.get(`${API}/users/${memberId}`);
            return memberResponse.data;
          } catch (err) {
            console.error(`Error fetching member ${memberId}:`, err);
            return null;
          }
        });
        const members = await Promise.all(memberPromises);
        setMemberDetails(members.filter(m => m !== null));
      }
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

  const handleAddMember = async () => {
    if (!memberEmail.trim()) {
      toast.error('กรุณากรอกอีเมลสมาชิก');
      return;
    }

    setAddingMember(true);
    try {
      // Search for user by email
      const response = await axios.get(`${API}/users/search?email=${encodeURIComponent(memberEmail)}`);
      
      if (response.data && response.data.id) {
        // Check if already added
        if (formData.group_members.includes(response.data.id)) {
          toast.error('สมาชิกคนนี้ถูกเพิ่มแล้ว');
          setAddingMember(false);
          return;
        }
        
        // Add to group_members and memberDetails
        setFormData({
          ...formData,
          group_members: [...formData.group_members, response.data.id]
        });
        setMemberDetails([...memberDetails, response.data]);
        setMemberEmail('');
        toast.success(`เพิ่ม ${response.data.full_name} แล้ว`);
      }
    } catch (error) {
      console.error('Search user error:', error);
      toast.error('ไม่พบผู้ใช้ที่มีอีเมลนี้');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = (memberId) => {
    setFormData({
      ...formData,
      group_members: formData.group_members.filter(id => id !== memberId)
    });
    setMemberDetails(memberDetails.filter(member => member.id !== memberId));
    toast.success('ลบสมาชิกแล้ว');
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate total files
    if (formData.attachments.length + files.length > 10) {
      toast.error('สามารถแนบได้สูงสุด 10 ไฟล์');
      return;
    }

    try {
      setUploadingFile(true);
      const newAttachments = [];

      for (const file of files) {
        // Validate file size (max 5MB before compression)
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`ไฟล์ ${file.name} ใหญ่เกินไป (สูงสุด 5MB)`);
          continue;
        }

        // Read file as base64
        const base64String = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        let finalFileData = base64String;
        let finalFileSize = file.size;

        // If it's an image, compress it on backend
        if (file.type.startsWith('image/')) {
          try {
            const response = await axios.post(
              `${API}/api/compress-image`,
              { image_base64: base64String },
              { headers: { Authorization: `Bearer ${token}` } }
            );
            finalFileData = response.data.compressed_image;
            // Calculate compressed size
            const base64Length = finalFileData.split(',')[1].length;
            finalFileSize = (base64Length * 0.75); // Approximate size from base64
          } catch (compressionError) {
            console.warn('Image compression failed, using original:', compressionError);
            // Use original if compression fails
          }
        }

        // Create attachment object
        const attachment = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          filename: file.name,
          file_type: file.type,
          file_size_kb: Math.round((finalFileSize / 1024) * 100) / 100,
          file_data: finalFileData,
          uploaded_at: new Date().toISOString()
        };

        newAttachments.push(attachment);
      }

      if (newAttachments.length > 0) {
        setFormData({
          ...formData,
          attachments: [...formData.attachments, ...newAttachments]
        });
        toast.success(`อัปโหลด ${newAttachments.length} ไฟล์สำเร็จ`);
      }
    } catch (error) {
      console.error('File upload error:', error);
      toast.error('เกิดข้อผิดพลาดในการอัปโหลดไฟล์');
    } finally {
      setUploadingFile(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (attachmentId) => {
    setFormData({
      ...formData,
      attachments: formData.attachments.filter(att => att.id !== attachmentId)
    });
    toast.success('ลบไฟล์แนบสำเร็จ');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate ZBS04 fields
      if (formData.is_zbs04_assignment && !formData.zbs04_assignment_type) {
        toast.error('กรุณาเลือกประเภทงาน ZBS04');
        setLoading(false);
        return;
      }

      const submitData = { ...formData };
      if (!submitData.category) delete submitData.category;
      if (!submitData.featured_image) delete submitData.featured_image;

      console.log('[ContentEditor] Submitting data:', submitData);
      console.log('[ContentEditor] ZBS04 fields:', {
        is_zbs04_assignment: submitData.is_zbs04_assignment,
        zbs04_assignment_type: submitData.zbs04_assignment_type,
        group_members: submitData.group_members
      });

      if (id) {
        await axios.put(`${API}/content/${id}`, submitData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('บันทึกเนื้อหาสำเร็จ');
      } else {
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
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      {/* Navigation */}
      <Navigation />

      {/* Editor */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button variant="ghost" onClick={() => navigate('/dashboard')} data-testid="back-to-dashboard-btn" className="mb-4 text-gray-800 hover:text-[#00A9CE]">
          <ArrowLeft className="w-4 h-4 mr-2" />
          กลับ Dashboard
        </Button>
        <Card className="p-8 bg-white/98 border-2 border-gray-300 shadow-xl fade-in-up">
          <h1 className="text-4xl font-black text-gray-900 mb-8" data-testid="editor-title">
            {id ? <span className="gradient-text">แก้ไขเนื้อหา</span> : <span className="gradient-text">สร้างเนื้อหาใหม่</span>}
          </h1>

          <form onSubmit={handleSubmit} data-testid="content-editor-form">
            <div className="space-y-6">
              {/* Title */}
              <div>
                <Label htmlFor="title" className="text-gray-800 font-bold mb-2">หัวข้อ *</Label>
                <Input
                  id="title"
                  data-testid="title-input"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="ใส่หัวข้อเนื้อหา..."
                  required
                  className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
                />
              </div>

              {/* Content Type */}
              <div>
                <Label htmlFor="content_type" className="text-gray-800 font-bold mb-2">ประเภทเนื้อหา *</Label>
                <Select
                  value={formData.content_type}
                  onValueChange={(value) => setFormData({ ...formData, content_type: value })}
                >
                  <SelectTrigger className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium" data-testid="content-type-select">
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
                <Label htmlFor="category" className="text-gray-800 font-bold mb-2">หมวดหมู่</Label>
                <Input
                  id="category"
                  data-testid="category-input"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="เช่น การตลาดดิจิทัล, พฤติกรรมผู้บริโภค..."
                  className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
                />
              </div>

              {/* Content */}
              <div>
                <Label htmlFor="content" className="text-gray-800 font-bold mb-2">เนื้อหา *</Label>
                <Textarea
                  id="content"
                  data-testid="content-textarea"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="เขียนเนื้อหาของคุณที่นี่..."
                  required
                  rows={12}
                  className="mt-1 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
                />
              </div>

              {/* Featured Image URL */}
              <div>
                <Label htmlFor="featured_image" className="text-gray-800 font-bold mb-2">ลิงก์รูปภาพ</Label>
                <Input
                  id="featured_image"
                  data-testid="featured-image-input"
                  value={formData.featured_image}
                  onChange={(e) => setFormData({ ...formData, featured_image: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                  className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
                />
                {formData.featured_image && (
                  <div className="mt-2">
                    <img
                      src={formData.featured_image}
                      alt="Preview"
                      className="w-full max-h-64 object-cover rounded-lg border-2 border-gray-300"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Tags */}
              <div>
                <Label htmlFor="tags" className="text-gray-800 font-bold mb-2">แท็ก</Label>
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
                    className="h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium"
                  />
                  <Button
                    type="button"
                    data-testid="add-tag-btn"
                    onClick={handleAddTag}
                    variant="outline"
                    className="border-2 border-[#00A9CE] text-[#005A73] hover:bg-[#00A9CE]/10 font-bold"
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
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#00A9CE]/10 text-[#005A73] rounded-full text-sm font-bold border border-[#00A9CE]/20"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          data-testid={`remove-tag-${idx}`}
                          className="hover:text-[#E63946]"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* File Attachments */}
              <div>
                <Label className="text-gray-800 font-bold mb-2">ไฟล์แนบ</Label>
                <div className="mt-2">
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-[#00A9CE] hover:bg-[#00A9CE]/5 transition-colors">
                      {uploadingFile ? (
                        <>
                          <div className="w-5 h-5 border-2 border-[#00A9CE] border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-gray-600 font-medium">กำลังอัปโหลด...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-gray-500" />
                          <span className="text-gray-600 font-medium">คลิกเพื่ออัปโหลดไฟล์ (หลายไฟล์)</span>
                          <span className="text-gray-400 text-sm">(สูงสุด 10 ไฟล์, ไฟล์ละ 5MB)</span>
                        </>
                      )}
                    </div>
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      disabled={uploadingFile}
                      className="hidden"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    />
                  </label>

                  {formData.attachments.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm text-gray-600 font-medium">ไฟล์ที่แนบ:</p>
                      {formData.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex items-center gap-3">
                            {attachment.file_type && attachment.file_type.startsWith('image/') ? (
                              <ImageIcon className="w-5 h-5 text-blue-500" />
                            ) : (
                              <Upload className="w-5 h-5 text-gray-500" />
                            )}
                            <div>
                              <p className="text-sm font-medium text-gray-900">{attachment.filename || attachment.title || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">{attachment.file_size_kb || 'N/A'} KB</p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveAttachment(attachment.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Status */}
              <div>
                <Label htmlFor="status" className="text-gray-800 font-bold mb-2">สถานะ *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger className="mt-1 h-12 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900 font-medium" data-testid="status-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft" data-testid="status-draft">แบบร่าง</SelectItem>
                    <SelectItem value="published" data-testid="status-published">เผยแพร่</SelectItem>
                    <SelectItem value="archived" data-testid="status-archived">เก็บถาวร</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ZBS04 Assignment Section - Only for enrolled students */}
              {user?.zbs04_enrolled && (
                <Card className="p-6 bg-gradient-to-r from-[#00A9CE]/5 to-[#33BCDA]/5 border-2 border-[#00A9CE]/30">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">งาน ZBS04 (ถ้ามี)</h3>
                  
                  {/* Checkbox - Is ZBS04 Assignment */}
                  <div className="flex items-center gap-3 mb-4">
                    <input
                      type="checkbox"
                      id="is_zbs04"
                      checked={formData.is_zbs04_assignment}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        is_zbs04_assignment: e.target.checked,
                        zbs04_assignment_type: e.target.checked ? formData.zbs04_assignment_type : '',
                        group_members: e.target.checked ? formData.group_members : []
                      })}
                      className="w-5 h-5 rounded border-2 border-[#00A9CE] text-[#00A9CE] focus:ring-[#00A9CE]"
                    />
                    <Label htmlFor="is_zbs04" className="text-gray-800 font-bold cursor-pointer">
                      เป็นงานส่งในวิชา ZBS04
                    </Label>
                  </div>

                  {/* Show fields only if checkbox is checked */}
                  {formData.is_zbs04_assignment && (
                    <>
                      {/* Assignment Type */}
                      <div className="mb-4">
                        <Label className="text-gray-800 font-bold mb-2">
                          ประเภทงาน <span className="text-red-600">*</span>
                        </Label>
                        <Select
                          value={formData.zbs04_assignment_type}
                          onValueChange={(value) => setFormData({ ...formData, zbs04_assignment_type: value })}
                          required
                        >
                          <SelectTrigger className={`mt-1 h-12 border-2 focus:border-[#00A9CE] text-gray-900 font-medium ${
                            !formData.zbs04_assignment_type ? 'border-red-300' : 'border-gray-300'
                          }`}>
                            <SelectValue placeholder="เลือกประเภทงาน" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="customer_behavior_analysis">การวิเคราะห์พฤติกรรมลูกค้า</SelectItem>
                            <SelectItem value="customer_perception_analysis">การวิเคราะห์การรับรู้ของลูกค้า</SelectItem>
                            <SelectItem value="competitor_analysis">การวิเคราะห์คู่แข่ง</SelectItem>
                            <SelectItem value="customer_journey_map">แผนที่เส้นทางลูกค้า</SelectItem>
                          </SelectContent>
                        </Select>
                        {!formData.zbs04_assignment_type && (
                          <p className="text-xs text-red-600 mt-1">กรุณาเลือกประเภทงาน</p>
                        )}
                      </div>

                      {/* Group Members */}
                      <div>
                        <Label className="text-gray-800 font-bold mb-2">
                          {t('content.groupMembers') || 'สมาชิกกลุ่ม'}
                        </Label>
                        
                        {/* Show Creator First (Cannot be removed) */}
                        <div className="mb-3 p-3 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border-2 border-green-300">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900">{user.full_name}</span>
                            <span className="text-xs text-gray-500">({user.email})</span>
                            <span className="ml-auto text-xs px-2 py-0.5 bg-green-600 text-white rounded-full font-bold">
                              {t('content.creator') || 'ผู้สร้าง'}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2 mb-3">
                          <Input
                            type="email"
                            placeholder={t('content.memberEmailPlaceholder') || 'อีเมลสมาชิกกลุ่ม'}
                            value={memberEmail}
                            onChange={(e) => setMemberEmail(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMember())}
                            className="flex-1 h-10 border-2 border-gray-300 focus:border-[#00A9CE] text-gray-900"
                          />
                          <Button
                            type="button"
                            onClick={handleAddMember}
                            disabled={addingMember}
                            className="bg-[#00A9CE] hover:bg-[#008FB5] text-white font-bold"
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            {t('content.addMember') || 'เพิ่ม'}
                          </Button>
                        </div>

                        {/* Member List (excluding creator) */}
                        {memberDetails.filter(m => m.id !== user.id).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {memberDetails
                              .filter(m => m.id !== user.id)
                              .map((member) => (
                                <div key={member.id} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border-2 border-[#00A9CE]/30">
                                  <span className="text-sm font-bold text-gray-900">{member.full_name}</span>
                                  <span className="text-xs text-gray-500">({member.email})</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMember(member.id)}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </Card>
              )}

              {/* Submit Buttons */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="submit"
                  data-testid="save-content-btn"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-[#005A73] via-[#007B9A] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl h-12"
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
                  className="border-2 border-gray-400 text-gray-700 hover:bg-gray-100 font-bold"
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
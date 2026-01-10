import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { API } from '@/App';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Plus, FolderKanban, Users, Calendar, Lock, Globe, 
  MoreHorizontal, Trash2, Edit, ExternalLink, Loader2,
  LayoutGrid, List
} from 'lucide-react';
import { toast } from 'sonner';

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { t, i18n } = useTranslation();
  
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState({});
  const [viewMode, setViewMode] = useState('grid'); // grid or list
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    project_type: 'general',
    visibility: 'private'
  });

  const fetchProjects = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProjects(response.data.projects || []);
    } catch (error) {
      console.error('Fetch projects error:', error);
      toast.error('ไม่สามารถโหลดรายการ Projects ได้');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/projects/templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTemplates(response.data);
    } catch (error) {
      console.error('Fetch templates error:', error);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchProjects();
      fetchTemplates();
    }
  }, [token, fetchProjects, fetchTemplates]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('กรุณาใส่ชื่อ Project');
      return;
    }

    try {
      setCreating(true);
      const response = await axios.post(`${API}/projects`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('สร้าง Project สำเร็จ!');
      setShowCreateModal(false);
      setFormData({ name: '', description: '', project_type: 'general', visibility: 'private' });
      
      // Navigate to new project
      navigate(`/projects/${response.data.id}`);
    } catch (error) {
      console.error('Create project error:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถสร้าง Project ได้');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (projectId, e) => {
    e.stopPropagation();
    if (!window.confirm('ต้องการลบ Project นี้หรือไม่?')) return;

    try {
      await axios.delete(`${API}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('ลบ Project สำเร็จ');
      fetchProjects();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'ไม่สามารถลบ Project ได้');
    }
  };

  const projectTypes = {
    general: { label: 'งานทั่วไป', icon: '📋' },
    university_research: { label: 'งานวิจัยมหาวิทยาลัย', icon: '🎓' },
    industry_research: { label: 'งานวิจัยอุตสาหกรรม', icon: '🏭' },
    thesis: { label: 'วิทยานิพนธ์', icon: '📚' },
    client: { label: 'งานลูกค้า', icon: '💼' }
  };

  const canCreateProject = user?.role === 'admin' || user?.role === 'instructor';

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navigation />
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-[#00A9CE]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
              <FolderKanban className="w-8 h-8 text-[#00A9CE]" />
              Projects
            </h1>
            <p className="text-gray-600 mt-1">จัดการและติดตามงานด้วย Kanban Board</p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex bg-white rounded-lg border p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${viewMode === 'grid' ? 'bg-[#00A9CE] text-white' : 'text-gray-600'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${viewMode === 'list' ? 'bg-[#00A9CE] text-white' : 'text-gray-600'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            
            {canCreateProject && (
              <Button
                onClick={() => setShowCreateModal(true)}
                className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold"
              >
                <Plus className="w-4 h-4 mr-2" />
                สร้าง Project
              </Button>
            )}
          </div>
        </div>

        {/* Projects Grid/List */}
        {projects.length === 0 ? (
          <Card className="p-12 text-center">
            <FolderKanban className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-600 mb-2">ยังไม่มี Project</h3>
            <p className="text-gray-500 mb-4">เริ่มต้นสร้าง Project แรกของคุณ</p>
            {canCreateProject && (
              <Button
                onClick={() => setShowCreateModal(true)}
                className="bg-[#00A9CE] hover:bg-[#008FB5] text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                สร้าง Project
              </Button>
            )}
          </Card>
        ) : (
          <div className={viewMode === 'grid' 
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
            : 'flex flex-col gap-4'
          }>
            {projects.map((project) => (
              <Card
                key={project.id}
                className={`bg-white border-2 hover:border-[#00A9CE] hover:shadow-lg transition-all cursor-pointer ${
                  viewMode === 'list' ? 'p-4' : 'p-6'
                }`}
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <div className={viewMode === 'list' ? 'flex items-center justify-between' : ''}>
                  <div className={viewMode === 'list' ? 'flex items-center gap-4 flex-1' : ''}>
                    {/* Project Type Icon */}
                    <div className={`${viewMode === 'list' ? '' : 'mb-4'}`}>
                      <span className="text-3xl">{projectTypes[project.project_type]?.icon || '📋'}</span>
                    </div>
                    
                    <div className="flex-1">
                      {/* Title & Visibility */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-lg text-gray-900 line-clamp-1">{project.name}</h3>
                        {project.visibility === 'public' ? (
                          <Globe className="w-4 h-4 text-green-500 flex-shrink-0" title="Public" />
                        ) : (
                          <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" title="Private" />
                        )}
                      </div>
                      
                      {/* Description */}
                      {project.description && viewMode !== 'list' && (
                        <p className="text-gray-600 text-sm mt-2 line-clamp-2">{project.description}</p>
                      )}
                      
                      {/* Meta info */}
                      <div className={`flex items-center gap-4 text-sm text-gray-500 ${viewMode === 'list' ? '' : 'mt-4'}`}>
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {project.members?.length || 1}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(project.created_at).toLocaleDateString('th-TH')}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                          {projectTypes[project.project_type]?.label || project.project_type}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className={`flex items-center gap-2 ${viewMode === 'list' ? '' : 'mt-4 pt-4 border-t'}`}>
                    {project.share_token && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = `${window.location.origin}/projects/public/${project.share_token}`;
                          navigator.clipboard.writeText(url);
                          toast.success('คัดลอก Public Link แล้ว!');
                        }}
                        title="Copy Public Link"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-500 hover:bg-red-50 border-red-200"
                      onClick={(e) => handleDelete(project.id, e)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg bg-white p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#00A9CE]" />
              สร้าง Project ใหม่
            </h2>
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="name" className="font-bold">ชื่อ Project *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="เช่น ทริปนิสิต ปี 2567"
                  className="mt-1"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="description" className="font-bold">รายละเอียด</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="รายละเอียดเพิ่มเติม..."
                  className="mt-1"
                  rows={3}
                />
              </div>
              
              <div>
                <Label className="font-bold">ประเภท Project</Label>
                <Select
                  value={formData.project_type}
                  onValueChange={(value) => setFormData({...formData, project_type: value})}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(projectTypes).map(([key, { label, icon }]) => (
                      <SelectItem key={key} value={key}>
                        {icon} {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  เลือกประเภทเพื่อใช้ Column Template ที่เหมาะสม
                </p>
              </div>
              
              <div>
                <Label className="font-bold">การเข้าถึง</Label>
                <Select
                  value={formData.visibility}
                  onValueChange={(value) => setFormData({...formData, visibility: value})}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">
                      <span className="flex items-center gap-2">
                        <Lock className="w-4 h-4" /> Private - เฉพาะสมาชิก
                      </span>
                    </SelectItem>
                    <SelectItem value="public">
                      <span className="flex items-center gap-2">
                        <Globe className="w-4 h-4" /> Public - ทุกคนดูได้ (ไม่ต้อง Login)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Preview Columns */}
              {templates[formData.project_type] && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-bold text-gray-700 mb-2">Columns ที่จะสร้าง:</p>
                  <div className="flex flex-wrap gap-2">
                    {templates[formData.project_type].map((col, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 text-xs rounded text-white"
                        style={{ backgroundColor: col.color }}
                      >
                        {col.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1"
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-gradient-to-r from-[#005A73] to-[#00A9CE] text-white"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  สร้าง Project
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;

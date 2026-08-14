import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { BeTopbar, Icon } from '@/pages/brand-equity/be-components';
import '@/pages/brand-equity/brand-equity-styles.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { API } from '@/App';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Plus,
  TrendingUp,
  FileText,
  Settings,
  Users,
  BarChart3,
  Calendar,
  Tag,
  MoreVertical,
  Clock,
  History,
  Trash2,
  RotateCcw,
  XCircle
} from 'lucide-react';

const ConjointAnalysisTool = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStatusHistoryModal, setShowStatusHistoryModal] = useState(false);
  const [selectedStudyHistory, setSelectedStudyHistory] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [newStudy, setNewStudy] = useState({
    title: '',
    description: '',
    product_category: '',
    demographics_to_capture: ['age', 'gender', 'occupation'],
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [studyToDelete, setStudyToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState('active'); // 'active' | 'trash'
  const [trashedStudies, setTrashedStudies] = useState([]);
  const [loadingTrash, setLoadingTrash] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [purgingId, setPurgingId] = useState(null);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [studyToPurge, setStudyToPurge] = useState(null);

  useEffect(() => {
    if (user && token) {
      loadStudies();
    }
  }, [user, token, statusFilter]);

  useEffect(() => {
    if (user && token && view === 'trash') {
      loadTrashedStudies();
    }
  }, [user, token, view]);

  const loadTrashedStudies = async () => {
    setLoadingTrash(true);
    try {
      const response = await axios.get(`${API}/conjoint/studies/trash`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTrashedStudies(response.data.studies || []);
    } catch (error) {
      console.error('Error loading trashed studies:', error);
      toast.error('ไม่สามารถโหลดรายการในถังขยะได้');
    } finally {
      setLoadingTrash(false);
    }
  };

  const handleRestoreStudy = async (study) => {
    setRestoringId(study.id);
    try {
      await axios.post(`${API}/conjoint/studies/${study.id}/restore`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('กู้คืนการศึกษาสำเร็จ');
      loadTrashedStudies();
    } catch (error) {
      console.error('Error restoring study:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถกู้คืนได้');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePurgeStudy = async () => {
    if (!studyToPurge) return;
    setPurgingId(studyToPurge.id);
    try {
      await axios.delete(`${API}/conjoint/studies/${studyToPurge.id}/purge`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('ลบถาวรเรียบร้อย');
      setShowPurgeConfirm(false);
      setStudyToPurge(null);
      loadTrashedStudies();
    } catch (error) {
      console.error('Error purging study:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถลบถาวรได้');
    } finally {
      setPurgingId(null);
    }
  };

  const loadStudies = async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? `?status_filter=${statusFilter}` : '';
      const response = await axios.get(`${API}/conjoint/studies${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudies(response.data.studies);
    } catch (error) {
      console.error('Error loading studies:', error);
      toast.error('ไม่สามารถโหลดรายการศึกษาได้');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStudy = async () => {
    if (!newStudy.title.trim()) {
      toast.error('กรุณากรอกชื่อการศึกษา');
      return;
    }

    try {
      const response = await axios.post(
        `${API}/conjoint/studies`,
        newStudy,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('สร้างการศึกษาใหม่สำเร็จ!');
      setShowCreateModal(false);
      setNewStudy({ title: '', description: '', product_category: '', demographics_to_capture: ['age', 'gender', 'occupation'] });
      
      // Navigate to qualitative phase
      navigate(`/research/conjoint/${response.data.study_id}/qualitative`);
    } catch (error) {
      console.error('Error creating study:', error);
      toast.error('ไม่สามารถสร้างการศึกษาได้');
    }
  };

  const handleDeleteStudy = async () => {
    if (!studyToDelete) return;
    
    setDeleting(true);
    try {
      await axios.delete(`${API}/conjoint/studies/${studyToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('ย้ายไปยังถังขยะแล้ว (กู้คืนได้ภายใน 30 วัน)');
      loadStudies(); // Reload list
    } catch (error) {
      console.error('Error deleting study:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถลบการศึกษาได้');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setStudyToDelete(null);
    }
  };

  const handleStatusChange = async (studyId, newStatus) => {
    try {
      await axios.put(
        `${API}/conjoint/studies/${studyId}/status`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('อัปเดตสถานะสำเร็จ!');
      loadStudies();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถอัปเดตสถานะได้');
    }
  };

  const getStatusConfig = (status) => {
    const configs = {
      'draft': {
        label: '⚪ ฉบับร่าง',
        color: 'bg-gray-100 text-gray-700 border-gray-300',
        description: 'กำลังสร้าง/แก้ไข ยังไม่เปิดให้ตอบ Survey'
      },
      'active': {
        label: '🟢 เปิดใช้งาน',
        color: 'bg-green-100 text-green-700 border-green-300',
        description: 'เปิดให้ตอบ Survey ได้ แก้ไขการตั้งค่าไม่ได้'
      },
      'completed': {
        label: '🔵 เสร็จสิ้น',
        color: 'bg-blue-100 text-blue-700 border-blue-300',
        description: 'ปิดรับคำตอบแล้ว ดูผลวิเคราะห์ได้'
      },
      'archived': {
        label: '⚫ เก็บถาวร',
        color: 'bg-slate-100 text-slate-700 border-slate-300',
        description: 'เก็บถาวร แสดงแยกต่างหาก'
      }
    };
    return configs[status] || configs['draft'];
  };

  const getStatusBadge = (study) => {
    const statusConfig = getStatusConfig(study.status);
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusConfig.color}`}>
        {statusConfig.label}
      </span>
    );
  };

  const canChangeStatus = (study) => {
    // Owner or admin can change status
    return study.creator_id === user?.id || user?.role === 'admin';
  };

  const showStatusHistory = (study) => {
    setSelectedStudyHistory(study);
    setShowStatusHistoryModal(true);
  };

  const handleStudyAction = (study, action) => {
    if (action === 'edit') {
      navigate(`/research/conjoint/${study.id}/design`);
    } else if (action === 'view') {
      navigate(`/research/conjoint/${study.id}/results`);
    }
  };

  if (loading) {
    return (
      <div className="be-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.18em' }}>LOADING…</div>
      </div>
    );
  }

  return (
    <div className="be-root">
      <BeTopbar user={user} onLogo={() => navigate('/dashboard')}
                subtitle="CONJOINT ANALYSIS" active="conjoint"
                right={<button className="be-btn be-btn-ghost be-btn-sm" onClick={() => navigate('/dashboard')}>
                         <Icon name="chevronL" size={10}/>Dashboard
                       </button>}/>

      <div className="be-conjoint-page">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="be-eyebrow" style={{ marginBottom: 12 }}>
            <span className="be-dot-sm be-pulse" style={{ background: 'var(--be-blue)' }}/>
            CHOICE-BASED CONJOINT · MARKET RESEARCH
          </div>
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <h1 className="be-h1" style={{ fontSize: 38, marginBottom: 6 }}>
                Conjoint Analysis
              </h1>
              <p className="be-muted" style={{ fontSize: 15, maxWidth: 640 }}>
                วิเคราะห์ความสำคัญของคุณสมบัติผลิตภัณฑ์ และจำลองส่วนแบ่งตลาด
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="be-btn be-btn-red"
              data-testid="conjoint-new-study">
              <Icon name="plus" size={11}/>สร้างการศึกษาใหม่
            </button>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="p-4 sm:p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-blue-500 rounded-lg flex-shrink-0">
                <FileText className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-blue-900 mb-1 text-sm sm:text-base">Phase 1: Qualitative</h3>
                <p className="text-xs sm:text-sm text-blue-700">ใช้ LLM วิเคราะห์หา Attributes และ Levels</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-6 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-purple-500 rounded-lg flex-shrink-0">
                <Settings className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-purple-900 mb-1 text-sm sm:text-base">Phase 2: Design</h3>
                <p className="text-xs sm:text-sm text-purple-700">D-Optimal Design + AI Image Generation</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-6 bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-green-500 rounded-lg flex-shrink-0">
                <BarChart3 className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-green-900 mb-1 text-sm sm:text-base">Phase 3: Analysis</h3>
                <p className="text-xs sm:text-sm text-green-700">Part-Worth Utilities + Market Simulation</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Studies List */}
        <Card className="p-4 sm:p-6 bg-white/95 border-2 border-gray-300 shadow-xl">
          {/* View tabs: Active studies vs Trash */}
          <div className="flex items-center gap-2 mb-4 sm:mb-6 border-b border-gray-200 pb-3">
            <button
              onClick={() => setView('active')}
              data-testid="conjoint-tab-active"
              className={`px-4 py-2 rounded-md text-sm font-bold transition ${
                view === 'active'
                  ? 'bg-gray-900 text-white'
                  : 'bg-transparent text-gray-600 hover:bg-gray-100'
              }`}
            >
              การศึกษาของคุณ
            </button>
            <button
              onClick={() => setView('trash')}
              data-testid="conjoint-tab-trash"
              className={`px-4 py-2 rounded-md text-sm font-bold transition flex items-center gap-2 ${
                view === 'trash'
                  ? 'bg-gray-900 text-white'
                  : 'bg-transparent text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              ถังขยะ
              {trashedStudies.length > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  view === 'trash' ? 'bg-white text-gray-900' : 'bg-red-100 text-red-700'
                }`}>
                  {trashedStudies.length}
                </span>
              )}
            </button>
          </div>

          {view === 'active' && (
          <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-black text-gray-900">การศึกษาของคุณ</h2>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-semibold text-gray-600">กรอง:</span>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="ทุกสถานะ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทุกสถานะ</SelectItem>
                    <SelectItem value="draft">⚪ ฉบับร่าง</SelectItem>
                    <SelectItem value="active">🟢 เปิดใช้งาน</SelectItem>
                    <SelectItem value="completed">🔵 เสร็จสิ้น</SelectItem>
                    <SelectItem value="archived">⚫ เก็บถาวร</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Sync Button for Admin */}
              {user?.role === 'admin' && (
                <Button
                  onClick={async () => {
                    try {
                      const response = await axios.post(
                        `${API}/conjoint/admin/sync-all-respondent-counts`,
                        {},
                        { headers: { Authorization: `Bearer ${token}` } }
                      );
                      toast.success(`ซิงค์สำเร็จ: ${response.data.synced_count} รายการ`);
                      loadStudies();
                    } catch (error) {
                      toast.error('ไม่สามารถซิงค์ได้');
                    }
                  }}
                  variant="outline"
                  size="sm"
                  className="border-2 border-blue-500 text-blue-700 hover:bg-blue-50"
                >
                  🔄 ซิงค์จำนวนผู้ตอบ
                </Button>
              )}
            </div>
          </div>

          {studies.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-semibold mb-4">
                {statusFilter === 'all' ? 'ยังไม่มีการศึกษา' : 'ไม่พบการศึกษาที่มีสถานะนี้'}
              </p>
              {statusFilter === 'all' && (
                <Button
                  onClick={() => setShowCreateModal(true)}
                  variant="outline"
                  className="border-2 border-[#00A9CE] text-[#005A73] hover:bg-[#00A9CE]/10"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  สร้างการศึกษาแรก
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {studies.map((study) => (
                <div
                  key={study.id}
                  className="p-4 sm:p-6 bg-gray-50 rounded-lg border-2 border-gray-200 hover:border-[#00A9CE] hover:shadow-md transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                        <h3 className="text-lg sm:text-xl font-bold text-gray-900 break-words">{study.title}</h3>
                        <div className="flex items-center gap-2 flex-wrap">
                          {getStatusBadge(study)}
                          {user?.role === 'admin' && study.creator_id !== user?.id && (
                            <span className="px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300 whitespace-nowrap">
                              👤 {study.creator_name || 'Unknown'}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {study.description && (
                        <p className="text-sm sm:text-base text-gray-600 mb-3 break-words">{study.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm text-gray-500">
                        {study.product_category && (
                          <div className="flex items-center gap-1">
                            <Tag className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span>{study.product_category}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span>{new Date(study.created_at).toLocaleDateString('th-TH')}</span>
                        </div>

                        {(study.respondent_count > 0 || study.respondent_count === undefined) && (
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span>{study.respondent_count || 0} ผู้ตอบ</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Menu */}
                    <div className="flex flex-col sm:flex-row gap-2 lg:flex-shrink-0">
                      <Button
                        onClick={() => handleStudyAction(study, 'edit')}
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto border-2 border-blue-500 text-blue-700 hover:bg-blue-50 text-xs sm:text-sm"
                      >
                        <Settings className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                        แก้ไข
                      </Button>
                      
                      <Button
                        onClick={() => handleStudyAction(study, 'view')}
                        size="sm"
                        className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm"
                      >
                        <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                        ดูรายงาน
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full sm:w-auto">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {canChangeStatus(study) && (
                            <>
                              <div className="px-2 py-1.5 text-xs font-semibold text-gray-500">
                                เปลี่ยนสถานะเป็น:
                              </div>
                              {['draft', 'active', 'completed', 'archived']
                                .filter(status => status !== study.status)
                                .map((status) => {
                                  const config = getStatusConfig(status);
                                  return (
                                    <DropdownMenuItem
                                      key={status}
                                      onClick={() => handleStatusChange(study.id, status)}
                                      className="cursor-pointer"
                                    >
                                      {config.label}
                                    </DropdownMenuItem>
                                  );
                                })}
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem
                            onClick={() => showStatusHistory(study)}
                            className="cursor-pointer"
                          >
                            <History className="w-4 h-4 mr-2" />
                            ประวัติการเปลี่ยนสถานะ
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                const response = await axios.post(
                                  `${API}/conjoint/studies/${study.id}/sync-respondent-count`,
                                  {},
                                  { headers: { Authorization: `Bearer ${token}` } }
                                );
                                if (response.data.synced) {
                                  toast.success(`ซิงค์สำเร็จ: ${response.data.old_count} → ${response.data.new_count}`);
                                } else {
                                  toast.info('จำนวนผู้ตอบถูกต้องแล้ว');
                                }
                                loadStudies();
                              } catch (error) {
                                toast.error('ไม่สามารถซิงค์ได้');
                              }
                            }}
                            className="cursor-pointer"
                          >
                            🔄 ซิงค์จำนวนผู้ตอบ
                          </DropdownMenuItem>
                          
                          {(study.creator_id === user?.id || user?.role === 'admin') && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setStudyToDelete(study);
                                  setShowDeleteConfirm(true);
                                }}
                                className="cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                ลบการศึกษา
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          </>
          )}

          {view === 'trash' && (
            <div data-testid="conjoint-trash-view">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 flex items-center gap-2">
                    <Trash2 className="w-5 h-5" />ถังขยะ
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-500 mt-1">
                    การศึกษาในถังขยะจะถูกลบถาวรอัตโนมัติหลัง 30 วัน
                  </p>
                </div>
              </div>

              {loadingTrash ? (
                <div className="text-center py-12 text-gray-500 text-sm">กำลังโหลด…</div>
              ) : trashedStudies.length === 0 ? (
                <div className="text-center py-12">
                  <Trash2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 font-semibold">ถังขยะว่างเปล่า</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {trashedStudies.map((study) => {
                    const deletedAt = study.deleted_at ? new Date(study.deleted_at) : null;
                    const purgeAt = deletedAt ? new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000) : null;
                    const daysLeft = purgeAt ? Math.max(0, Math.ceil((purgeAt - new Date()) / (24 * 60 * 60 * 1000))) : null;
                    return (
                      <div
                        key={study.id}
                        className="p-4 sm:p-6 bg-amber-50/60 rounded-lg border-2 border-amber-200"
                        data-testid={`conjoint-trash-item-${study.id}`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg sm:text-xl font-bold text-gray-900 break-words">{study.title}</h3>
                            {study.description && (
                              <p className="text-sm text-gray-600 mt-1 break-words">{study.description}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-3 sm:gap-6 mt-3 text-xs text-gray-500">
                              {deletedAt && (
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>ลบเมื่อ {deletedAt.toLocaleDateString('th-TH')}</span>
                                </div>
                              )}
                              {daysLeft !== null && (
                                <div className="flex items-center gap-1 text-amber-700 font-semibold">
                                  <span>เหลือ {daysLeft} วัน</span>
                                </div>
                              )}
                              {user?.role === 'admin' && study.creator_id !== user?.id && (
                                <span className="px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
                                  👤 {study.creator_name || 'Unknown'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2 lg:flex-shrink-0">
                            <Button
                              onClick={() => handleRestoreStudy(study)}
                              disabled={restoringId === study.id}
                              size="sm"
                              variant="outline"
                              className="border-2 border-green-600 text-green-700 hover:bg-green-50 text-xs sm:text-sm"
                              data-testid={`conjoint-restore-btn-${study.id}`}
                            >
                              {restoringId === study.id ? (
                                <span className="flex items-center gap-2">
                                  <div className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                                  กำลังกู้คืน…
                                </span>
                              ) : (
                                <>
                                  <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                  กู้คืน
                                </>
                              )}
                            </Button>
                            <Button
                              onClick={() => {
                                setStudyToPurge(study);
                                setShowPurgeConfirm(true);
                              }}
                              size="sm"
                              className="bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm"
                              data-testid={`conjoint-purge-btn-${study.id}`}
                            >
                              <XCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                              ลบถาวร
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Create Study Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-2xl w-full p-6 bg-white">
            <h2 className="text-2xl font-black text-gray-900 mb-6">สร้างการศึกษา Conjoint Analysis ใหม่</h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  ชื่อการศึกษา *
                </label>
                <input
                  type="text"
                  value={newStudy.title}
                  onChange={(e) => setNewStudy({ ...newStudy, title: e.target.value })}
                  placeholder="เช่น: การศึกษาคุณสมบัติสมาร์ทโฟน"
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  คำอธิบาย
                </label>
                <textarea
                  value={newStudy.description}
                  onChange={(e) => setNewStudy({ ...newStudy, description: e.target.value })}
                  placeholder="อธิบายวัตถุประสงค์ของการศึกษา..."
                  rows={3}
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  หมวดหมู่ผลิตภัณฑ์/บริการ
                </label>
                <input
                  type="text"
                  value={newStudy.product_category}
                  onChange={(e) => setNewStudy({ ...newStudy, product_category: e.target.value })}
                  placeholder="เช่น: Electronics, F&B, Service"
                  className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-[#00A9CE] focus:outline-none"
                />
              </div>

              {/* Demographic fields to collect from respondents — used by the
                  Results page filter bar for segment analysis. Editable later
                  in the Design page until the survey starts. */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  ข้อมูลผู้ตอบที่จะเก็บ <span className="text-xs text-gray-500 font-normal">(สำหรับแบ่ง segment ในผลวิเคราะห์)</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  เลือกเท่าที่จำเป็น — แก้ทีหลังได้ในหน้า Design จนกว่า survey จะเริ่ม
                </p>
                <div className="flex flex-wrap gap-2" data-testid="create-demo-chips">
                  {[
                    { key: 'age',        label: 'ช่วงอายุ' },
                    { key: 'gender',     label: 'เพศ' },
                    { key: 'occupation', label: 'อาชีพ' },
                    { key: 'education',  label: 'การศึกษา' },
                    { key: 'region',     label: 'ภูมิภาค' },
                    { key: 'income',     label: 'รายได้' },
                  ].map(opt => {
                    const active = (newStudy.demographics_to_capture || []).includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          const cur = newStudy.demographics_to_capture || [];
                          const next = active ? cur.filter(k => k !== opt.key) : [...cur, opt.key];
                          setNewStudy({ ...newStudy, demographics_to_capture: next });
                        }}
                        data-testid={`create-demo-chip-${opt.key}`}
                        aria-pressed={active}
                        className="be-chip"
                      >
                        {active && <span className="be-chip-check">✓</span>}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowCreateModal(false)}
                variant="outline"
                className="flex-1"
              >
                ยกเลิก
              </Button>
              <Button
                onClick={handleCreateStudy}
                className="flex-1 bg-gradient-to-r from-[#007B9A] to-[#00A9CE] hover:from-[#005A73] hover:to-[#008FB5] text-white font-bold"
              >
                สร้างและเริ่มต้น
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Status History Modal */}
      {showStatusHistoryModal && selectedStudyHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-3xl w-full p-6 bg-white max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black text-gray-900">ประวัติการเปลี่ยนสถานะ</h2>
              <Button
                onClick={() => setShowStatusHistoryModal(false)}
                variant="ghost"
                size="sm"
              >
                ✕
              </Button>
            </div>

            <div className="mb-4">
              <h3 className="font-bold text-lg text-gray-800">{selectedStudyHistory.title}</h3>
              <p className="text-sm text-gray-600">ID: {selectedStudyHistory.id}</p>
            </div>

            {selectedStudyHistory.status_history && selectedStudyHistory.status_history.length > 0 ? (
              <div className="space-y-3">
                {selectedStudyHistory.status_history.map((entry, index) => (
                  <div
                    key={index}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {entry.from_status && (
                            <>
                              <span className="text-sm font-semibold text-gray-600">
                                {getStatusConfig(entry.from_status).label}
                              </span>
                              <span className="text-gray-400">→</span>
                            </>
                          )}
                          <span className="text-sm font-semibold">
                            {getStatusConfig(entry.to_status).label}
                          </span>
                        </div>
                        
                        <div className="text-xs text-gray-500 space-y-1">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(entry.changed_at).toLocaleString('th-TH')}</span>
                          </div>
                          <div>
                            โดย: <span className="font-semibold">{entry.changed_by_name}</span>
                          </div>
                          {entry.reason && (
                            <div className="mt-2 text-gray-700">
                              เหตุผล: {entry.reason}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                ไม่มีประวัติการเปลี่ยนสถานะ
              </div>
            )}

            <div className="mt-6">
              <Button
                onClick={() => setShowStatusHistoryModal(false)}
                className="w-full"
                variant="outline"
              >
                ปิด
              </Button>
            </div>
          </Card>
        </div>
      )}
      
      {/* Delete Confirmation Modal (soft-delete to Trash) */}
      {showDeleteConfirm && studyToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-md w-full mx-4 bg-white" data-testid="conjoint-delete-modal">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              ย้ายการศึกษาไปยังถังขยะ?
            </h3>
            <p className="text-gray-700 mb-6">
              การศึกษา <strong>&quot;{studyToDelete.title}&quot;</strong> จะถูกย้ายไปยังถังขยะ
              <br />
              <span className="text-amber-700 font-semibold">
                สามารถกู้คืนได้ภายใน 30 วัน หลังจากนั้นจะถูกลบถาวรอัตโนมัติ
              </span>
              <br />
              <span className="text-gray-500 text-sm">
                ข้อมูลผู้ตอบ ({studyToDelete.respondent_count || 0} คน) จะยังถูกเก็บไว้จนกว่าจะลบถาวร
              </span>
            </p>
            <div className="flex gap-4">
              <Button
                onClick={handleDeleteStudy}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
                data-testid="conjoint-confirm-delete-btn"
              >
                {deleting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    กำลังย้าย...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    ย้ายไปถังขยะ
                  </span>
                )}
              </Button>
              <Button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setStudyToDelete(null);
                }}
                disabled={deleting}
                variant="outline"
                className="flex-1 border-2 border-gray-400 hover:bg-gray-100 font-bold"
              >
                ยกเลิก
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Purge Confirmation Modal (permanent delete) */}
      {showPurgeConfirm && studyToPurge && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-md w-full mx-4 bg-white" data-testid="conjoint-purge-modal">
            <h3 className="text-xl font-bold text-red-700 mb-4">
              ⚠️ ลบถาวร — ไม่สามารถกู้คืนได้
            </h3>
            <p className="text-gray-700 mb-6">
              คุณกำลังจะลบ <strong>&quot;{studyToPurge.title}&quot;</strong> และข้อมูลผู้ตอบทั้งหมด
              ({studyToPurge.respondent_count || 0} คน) <span className="text-red-600 font-bold">อย่างถาวร</span>
              <br />
              <span className="text-red-600 font-semibold">การกระทำนี้ไม่สามารถย้อนกลับได้</span>
            </p>
            <div className="flex gap-4">
              <Button
                onClick={handlePurgeStudy}
                disabled={purgingId === studyToPurge.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
                data-testid="conjoint-confirm-purge-btn"
              >
                {purgingId === studyToPurge.id ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    กำลังลบ...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    ลบถาวร
                  </span>
                )}
              </Button>
              <Button
                onClick={() => {
                  setShowPurgeConfirm(false);
                  setStudyToPurge(null);
                }}
                disabled={purgingId === studyToPurge.id}
                variant="outline"
                className="flex-1 border-2 border-gray-400 hover:bg-gray-100 font-bold"
              >
                ยกเลิก
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ConjointAnalysisTool;

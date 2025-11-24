import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
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
  History
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
    product_category: ''
  });

  useEffect(() => {
    if (user && token) {
      loadStudies();
    }
  }, [user, token, statusFilter]);

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
      setNewStudy({ title: '', description: '', product_category: '' });
      
      // Navigate to qualitative phase
      navigate(`/research/conjoint/${response.data.study_id}/qualitative`);
    } catch (error) {
      console.error('Error creating study:', error);
      toast.error('ไม่สามารถสร้างการศึกษาได้');
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #E8ECF1 100%)' }}>
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#00A9CE]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-2">
                📊 Choice-Based Conjoint Analysis
              </h1>
              <p className="text-lg text-gray-600">
                วิเคราะห์ความสำคัญของคุณสมบัติผลิตภัณฑ์ และจำลองส่วนแบ่งตลาด
              </p>
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-gradient-to-r from-[#007B9A] to-[#00A9CE] hover:from-[#005A73] hover:to-[#008FB5] text-white font-bold shadow-lg"
            >
              <Plus className="w-5 h-5 mr-2" />
              สร้างการศึกษาใหม่
            </Button>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-500 rounded-lg">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-blue-900 mb-1">Phase 1: Qualitative</h3>
                <p className="text-sm text-blue-700">ใช้ LLM วิเคราะห์หา Attributes และ Levels</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-purple-500 rounded-lg">
                <Settings className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-purple-900 mb-1">Phase 2: Design</h3>
                <p className="text-sm text-purple-700">D-Optimal Design + AI Image Generation</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-500 rounded-lg">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-green-900 mb-1">Phase 3: Analysis</h3>
                <p className="text-sm text-green-700">Part-Worth Utilities + Market Simulation</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Studies List */}
        <Card className="p-6 bg-white/95 border-2 border-gray-300 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-gray-900">การศึกษาของคุณ</h2>
            
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-600">กรอง:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
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
                  className="p-6 bg-gray-50 rounded-lg border-2 border-gray-200 hover:border-[#00A9CE] hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-900">{study.title}</h3>
                        {getStatusBadge(study)}
                        {user?.role === 'admin' && study.creator_id !== user?.id && (
                          <span className="px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
                            👤 {study.creator_name || 'Unknown'}
                          </span>
                        )}
                      </div>
                      
                      {study.description && (
                        <p className="text-gray-600 mb-3">{study.description}</p>
                      )}

                      <div className="flex items-center gap-6 text-sm text-gray-500">
                        {study.product_category && (
                          <div className="flex items-center gap-1">
                            <Tag className="w-4 h-4" />
                            <span>{study.product_category}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(study.created_at).toLocaleDateString('th-TH')}</span>
                        </div>

                        {(study.respondent_count > 0 || study.respondent_count === undefined) && (
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            <span>{study.respondent_count || 0} ผู้ตอบ</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Menu */}
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleStudyAction(study, 'edit')}
                        variant="outline"
                        size="sm"
                        className="border-2 border-blue-500 text-blue-700 hover:bg-blue-50"
                      >
                        <Settings className="w-4 h-4 mr-1" />
                        แก้ไข
                      </Button>
                      
                      {study.respondent_count > 0 && (
                        <Button
                          onClick={() => handleStudyAction(study, 'view')}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <BarChart3 className="w-4 h-4 mr-1" />
                          ดูรายงาน
                        </Button>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
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
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
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
    </div>
  );
};

export default ConjointAnalysisTool;

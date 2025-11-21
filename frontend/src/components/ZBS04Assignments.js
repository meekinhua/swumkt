import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { CheckCircle, Circle, Users, FileText, TrendingUp, Map, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

const ZBS04Assignments = () => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const assignmentInfo = {
    customer_behavior_analysis: {
      title: 'Customer Behavior Analysis',
      titleTh: 'การวิเคราะห์พฤติกรรมลูกค้า',
      icon: TrendingUp,
      color: 'from-blue-500 to-blue-600',
      path: '/market-research',
      toolName: 'Customer Behavior Analysis'
    },
    customer_perception_analysis: {
      title: 'Customer Perception Analysis',
      titleTh: 'การวิเคราะห์การรับรู้ของลูกค้า',
      icon: Eye,
      color: 'from-purple-500 to-purple-600',
      path: '/market-research',
      toolName: 'Customer Perception Analysis'
    },
    competitor_analysis: {
      title: 'Competitor Analysis',
      titleTh: 'การวิเคราะห์คู่แข่ง',
      icon: Users,
      color: 'from-orange-500 to-orange-600',
      path: '/market-research',
      toolName: 'Competitor Analysis'
    },
    customer_journey_map: {
      title: 'Customer Journey Map',
      titleTh: 'แผนที่เส้นทางลูกค้า',
      icon: Map,
      color: 'from-green-500 to-green-600',
      path: '/market-research',
      toolName: 'Customer Journey Mapping'
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, []);

  const fetchAssignments = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/api/zbs04/assignments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAssignments(response.data);
    } catch (error) {
      console.error('Error fetching ZBS04 assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 mb-6 bg-gradient-to-r from-[#00A9CE]/10 to-[#33BCDA]/10 border-2 border-[#00A9CE]/30">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-300 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-300 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 mb-6 bg-gradient-to-r from-[#00A9CE]/10 to-[#33BCDA]/10 border-2 border-[#00A9CE]/30">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-xl bg-gradient-to-br from-[#005A73] to-[#00A9CE]">
          <FileText className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-900">งานที่ต้องส่งในวิชา ZBS04</h2>
          <p className="text-sm text-gray-600">ติดตามสถานะการส่งงานของคุณ</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {assignments.map((assignment) => {
          const info = assignmentInfo[assignment.type];
          if (!info) return null;

          const Icon = info.icon;
          const isSubmitted = assignment.submitted;

          return (
            <Card
              key={assignment.type}
              className={`p-4 border-2 ${
                isSubmitted
                  ? 'bg-green-50 border-green-200'
                  : 'bg-white border-gray-200'
              } hover:shadow-lg transition-all cursor-pointer`}
              onClick={() => {
                if (isSubmitted && assignment.content_id) {
                  navigate(`/content/${assignment.content_id}`);
                } else {
                  navigate(info.path);
                }
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${info.color}`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">{info.titleTh}</h3>
                    <p className="text-xs text-gray-500">{info.title}</p>
                  </div>
                </div>
                {isSubmitted ? (
                  <CheckCircle className="w-6 h-6 text-green-600" />
                ) : (
                  <Circle className="w-6 h-6 text-gray-400" />
                )}
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                  {isSubmitted ? (
                    <>
                      <span className="text-xs font-bold text-green-600">✓ ส่งแล้ว</span>
                      {assignment.group_members && assignment.group_members.length > 0 && (
                        <span className="text-xs text-gray-500">
                          • {assignment.group_members.length} คน
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs font-medium text-orange-600">ยังไม่ส่ง</span>
                  )}
                </div>
                <Button
                  size="sm"
                  className={`text-xs ${
                    isSubmitted
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-gradient-to-r from-[#005A73] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5]'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isSubmitted && assignment.content_id) {
                      navigate(`/content/${assignment.content_id}`);
                    } else {
                      navigate(info.path);
                    }
                  }}
                >
                  {isSubmitted ? 'ดูงาน' : 'เริ่มทำ'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </Card>
  );
};

export default ZBS04Assignments;

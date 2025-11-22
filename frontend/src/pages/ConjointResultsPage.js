import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { API } from '@/App';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Download,
  BarChart3,
  TrendingUp,
  Users,
  AlertCircle
} from 'lucide-react';

const ConjointResultsPage = () => {
  const navigate = useNavigate();
  const { studyId } = useParams();
  const { user, token } = useAuth();
  
  const [study, setStudy] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && token && studyId) {
      loadResults();
    }
  }, [user, token, studyId]);

  const loadResults = async () => {
    try {
      const [studyRes, resultsRes] = await Promise.all([
        axios.get(`${API}/conjoint/studies/${studyId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/conjoint/studies/${studyId}/results`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      setStudy(studyRes.data);
      setResults(resultsRes.data);
    } catch (error) {
      console.error('Error loading results:', error);
      toast.error('ไม่สามารถโหลดผลการวิเคราะห์ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!results || !results.responses) return;
    
    // Create CSV content
    const headers = ['Respondent ID', 'Email', 'Submitted At', 'Choices'];
    const rows = results.responses.map(resp => [
      resp.respondent_id,
      resp.respondent_email || 'N/A',
      new Date(resp.submitted_at).toLocaleString('th-TH'),
      JSON.stringify(resp.responses)
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    // Download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `conjoint_responses_${studyId}.csv`;
    link.click();
    
    toast.success('ดาวน์โหลด CSV สำเร็จ');
  };

  const handleExportResults = () => {
    if (!results) return;
    
    const data = {
      study: study,
      results: results,
      exported_at: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `conjoint_analysis_${studyId}.json`;
    link.click();
    
    toast.success('ดาวน์โหลดผลการวิเคราะห์สำเร็จ');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #E8ECF1 100%)' }}>
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#00A9CE]"></div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #E8ECF1 100%)' }}>
        <Navigation />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card className="p-8 text-center">
            <p className="text-gray-700">ไม่พบข้อมูลผลการวิเคราะห์</p>
          </Card>
        </div>
      </div>
    );
  }

  const insufficientData = results.status === 'insufficient_data';

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/market-research/conjoint-analysis')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับ
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-black text-gray-900 mb-2">
                ผลการวิเคราะห์
              </h1>
              <p className="text-lg text-gray-600 mb-2">
                {study?.title}
              </p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>{results.respondent_count} respondents</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={handleExportCSV}
                variant="outline"
                disabled={!results.responses || results.responses.length === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button
                onClick={handleExportResults}
                className="bg-gradient-to-r from-[#007B9A] to-[#00A9CE] text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Analysis
              </Button>
            </div>
          </div>
        </div>

        {/* Insufficient Data Warning */}
        {insufficientData && (
          <Card className="p-6 mb-6 bg-yellow-50 border-2 border-yellow-300">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-yellow-700 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-yellow-900 mb-2">
                  ข้อมูลยังไม่เพียงพอสำหรับการวิเคราะห์
                </h3>
                <p className="text-yellow-800 text-sm">
                  {results.message}
                  <br />
                  ปัจจุบันมี <strong>{results.respondent_count} responses</strong> - ต้องการอย่างน้อย <strong>30 responses</strong>
                </p>
              </div>
            </div>
          </Card>
        )}

        {!insufficientData && (
          <>
            {/* Attribute Importance */}
            <Card className="p-6 mb-6 bg-white border-2 border-gray-300">
              <div className="flex items-center gap-3 mb-6">
                <TrendingUp className="w-6 h-6 text-[#00A9CE]" />
                <h2 className="text-2xl font-black text-gray-900">
                  Attribute Importance
                </h2>
              </div>

              <div className="space-y-4">
                {results.importance_scores && Object.entries(results.importance_scores)
                  .sort((a, b) => b[1].importance - a[1].importance)
                  .map(([attrId, data]) => (
                    <div key={attrId}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-gray-900">{data.name}</span>
                        <span className="text-lg font-black text-[#00A9CE]">
                          {data.importance}%
                        </span>
                      </div>
                      <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#007B9A] to-[#00A9CE] transition-all"
                          style={{ width: `${data.importance}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>

            {/* Part-Worth Utilities */}
            <Card className="p-6 bg-white border-2 border-gray-300">
              <div className="flex items-center gap-3 mb-6">
                <BarChart3 className="w-6 h-6 text-[#00A9CE]" />
                <h2 className="text-2xl font-black text-gray-900">
                  Part-Worth Utilities
                </h2>
              </div>

              <div className="space-y-8">
                {results.part_worths && Object.entries(results.part_worths).map(([attrId, attrData]) => (
                  <div key={attrId}>
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                      {attrData.name}
                    </h3>
                    
                    <div className="space-y-3">
                      {Object.entries(attrData.levels)
                        .sort((a, b) => b[1].utility - a[1].utility)
                        .map(([levelId, levelData]) => (
                          <div key={levelId} className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-gray-900">
                                {levelData.value}
                              </span>
                              <div className="text-right">
                                <div className="text-lg font-black text-[#00A9CE]">
                                  {levelData.utility.toFixed(2)}
                                </div>
                                <div className="text-xs text-gray-600">
                                  {levelData.selection_count} selections
                                </div>
                              </div>
                            </div>
                            
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all"
                                style={{ 
                                  width: `${Math.min(100, (levelData.utility / Math.max(...Object.values(attrData.levels).map(l => l.utility))) * 100)}%` 
                                }}
                              ></div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {/* Raw Responses Preview */}
        {results.responses && results.responses.length > 0 && (
          <Card className="p-6 mt-6 bg-white border-2 border-gray-300">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Response Data ({results.responses.length} responses)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left p-2 font-bold">Respondent ID</th>
                    <th className="text-left p-2 font-bold">Email</th>
                    <th className="text-left p-2 font-bold">Submitted</th>
                    <th className="text-left p-2 font-bold">Choices</th>
                  </tr>
                </thead>
                <tbody>
                  {results.responses.slice(0, 10).map((resp, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="p-2 font-mono text-xs">{resp.respondent_id.substring(0, 8)}...</td>
                      <td className="p-2">{resp.respondent_email || '-'}</td>
                      <td className="p-2">{new Date(resp.submitted_at).toLocaleDateString('th-TH')}</td>
                      <td className="p-2">{resp.responses.length} choices</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.responses.length > 10 && (
                <p className="text-xs text-gray-600 mt-2 text-center">
                  แสดง 10 รายการแรก จากทั้งหมด {results.responses.length} responses
                </p>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ConjointResultsPage;

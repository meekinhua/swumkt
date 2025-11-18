import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Navigation from '@/components/Navigation';
import { Plus, FileText, Eye, Edit, Trash2, Send, Lock, CheckCircle, XCircle, BookTemplate } from 'lucide-react';
import { toast } from 'sonner';
import SurveyTemplateModal from '@/components/SurveyTemplateModal';

const API = process.env.REACT_APP_BACKEND_URL || 'https://customer-path-tool.preview.emergentagent.com';

const SurveyListPage = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, draft, published, closed
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  useEffect(() => {
    loadSurveys();
  }, [filter]);

  const loadSurveys = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filter !== 'all') {
        params.status = filter;
      }
      
      const response = await axios.get(`${API}/api/surveys`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setSurveys(response.data);
    } catch (error) {
      console.error('Failed to load surveys:', error);
      toast.error('Failed to load surveys');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (surveyId) => {
    if (!window.confirm('Are you sure you want to delete this survey? All responses will be deleted.')) {
      return;
    }

    try {
      await axios.delete(`${API}/api/surveys/${surveyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Survey deleted successfully');
      loadSurveys();
    } catch (error) {
      toast.error('Failed to delete survey');
    }
  };

  const handlePublish = async (surveyId) => {
    try {
      await axios.post(`${API}/api/surveys/${surveyId}/publish`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Survey published successfully');
      loadSurveys();
    } catch (error) {
      toast.error('Failed to publish survey');
    }
  };

  const handleClose = async (surveyId) => {
    try {
      await axios.post(`${API}/api/surveys/${surveyId}/close`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Survey closed successfully');
      loadSurveys();
    } catch (error) {
      toast.error('Failed to close survey');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      draft: { color: 'bg-gray-100 text-gray-700 border-gray-300', icon: Edit, label: 'Draft' },
      published: { color: 'bg-green-100 text-green-700 border-green-300', icon: CheckCircle, label: 'Published' },
      closed: { color: 'bg-red-100 text-red-700 border-red-300', icon: XCircle, label: 'Closed' }
    };
    
    const badge = badges[status] || badges.draft;
    const Icon = badge.icon;
    
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold border-2 ${badge.color}`}>
        <Icon className="w-4 h-4" />
        {badge.label}
      </span>
    );
  };

  const getSurveyTypeLabel = (type) => {
    const labels = {
      market_segmentation: 'Market Segmentation',
      perception: 'Perception Analysis',
      competitor: 'Competitor Analysis',
      behavior: 'Behavior Analysis',
      conjoint: 'Conjoint Analysis',
      custom: 'Custom Survey'
    };
    return labels[type] || 'Custom';
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FAFBFC 0%, #F5F7FA 50%, #E8ECF1 100%)' }}>
      <Navigation showMarketResearchButton={true} showContentButton={true} showProfileButton={true} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-black text-gray-900 mb-2">Survey Management</h1>
            <p className="text-gray-600 font-medium">Create, manage, and analyze your surveys</p>
          </div>
          <Button
            onClick={() => navigate('/surveys/create')}
            className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold shadow-xl"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Survey
          </Button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {['all', 'draft', 'published', 'closed'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                filter === status
                  ? 'bg-[#00A9CE] text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border-2 border-gray-300'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Survey List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00A9CE] mx-auto"></div>
            <p className="mt-4 text-gray-600 font-medium">Loading surveys...</p>
          </div>
        ) : surveys.length === 0 ? (
          <Card className="p-12 text-center bg-white/98 border-2 border-gray-300">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No surveys found</h3>
            <p className="text-gray-600 mb-6">Create your first survey to get started</p>
            <Button
              onClick={() => navigate('/surveys/create')}
              className="bg-gradient-to-r from-[#005A73] to-[#00A9CE] hover:from-[#004A5F] hover:to-[#008FB5] text-white font-bold"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Survey
            </Button>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {surveys.map(survey => (
              <Card key={survey.id} className="p-6 bg-white/98 border-2 border-gray-300 hover:shadow-xl transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-black text-gray-900 mb-2">{survey.title}</h3>
                    <p className="text-sm text-gray-600 mb-2">{getSurveyTypeLabel(survey.survey_type)}</p>
                  </div>
                  {getStatusBadge(survey.status)}
                </div>

                {survey.description && (
                  <p className="text-gray-700 text-sm mb-4 line-clamp-2">{survey.description}</p>
                )}

                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                  <FileText className="w-4 h-4" />
                  <span>{survey.sections?.length || 0} sections</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {survey.status === 'draft' && survey.created_by === user?.id && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/surveys/${survey.id}/edit`)}
                        className="flex-1"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handlePublish(survey.id)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Send className="w-4 h-4 mr-1" />
                        Publish
                      </Button>
                    </>
                  )}

                  {survey.status === 'published' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/surveys/${survey.id}/take`)}
                        className="flex-1"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                      {survey.created_by === user?.id && (
                        <Button
                          size="sm"
                          onClick={() => navigate(`/surveys/${survey.id}/responses`)}
                          className="flex-1 bg-[#00A9CE] hover:bg-[#008FB5] text-white"
                        >
                          Responses
                        </Button>
                      )}
                    </>
                  )}

                  {survey.status === 'closed' && survey.created_by === user?.id && (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/surveys/${survey.id}/responses`)}
                      className="flex-1 bg-[#00A9CE] hover:bg-[#008FB5] text-white"
                    >
                      View Results
                    </Button>
                  )}

                  {(survey.status === 'published' || survey.status === 'closed') && survey.created_by === user?.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => survey.status === 'published' ? handleClose(survey.id) : null}
                      disabled={survey.status === 'closed'}
                    >
                      <Lock className="w-4 h-4" />
                    </Button>
                  )}

                  {survey.status === 'draft' && survey.created_by === user?.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(survey.id)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SurveyListPage;

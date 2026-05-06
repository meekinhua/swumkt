import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SWU_LOGO_URL } from '@/pages/brand-equity/be-components';
import '@/pages/brand-equity/brand-equity-styles.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { API } from '@/App';
import axios from 'axios';
import { toast } from 'sonner';
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Send
} from 'lucide-react';

const ConjointSurveyPage = () => {
  const { studyId } = useParams();
  
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [selections, setSelections] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [respondentEmail, setRespondentEmail] = useState('');

  useEffect(() => {
    loadSurvey();
  }, [studyId]);

  const loadSurvey = async (retryCount = 0) => {
    try {
      console.log(`[Survey] Loading survey: ${studyId}, attempt: ${retryCount + 1}`);
      
      const response = await axios.get(`${API}/conjoint/survey/${studyId}`, {
        timeout: 30000, // 30 seconds timeout
        maxContentLength: 50 * 1024 * 1024, // 50MB
        maxBodyLength: 50 * 1024 * 1024
      });
      
      console.log('[Survey] Successfully loaded survey:', response.data?.study_id);
      setSurvey(response.data);
    } catch (error) {
      console.error('[Survey] Error loading survey:', error);
      console.error('[Survey] Error response:', error.response?.data);
      console.error('[Survey] Error status:', error.response?.status);
      
      // Retry logic for timeout or network errors
      if (retryCount < 2 && (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK')) {
        console.log(`[Survey] Retrying... attempt ${retryCount + 1}`);
        setTimeout(() => loadSurvey(retryCount + 1), 2000);
        return;
      }
      
      // Show specific error messages
      const errorDetail = error.response?.data?.detail || '';
      
      if (error.response?.status === 404) {
        console.error('[Survey] 404 - Study not found');
        toast.error('ไม่พบแบบสอบถาม: ID ไม่ถูกต้องหรือถูกลบแล้ว');
      } else if (error.response?.status === 400) {
        console.error('[Survey] 400 - Study not active:', errorDetail);
        toast.error(errorDetail || 'แบบสอบถามยังไม่เปิดรับคำตอบ กรุณารอเจ้าของแบบสอบถามเปิดการเก็บข้อมูล');
      } else if (error.code === 'ECONNABORTED') {
        console.error('[Survey] Timeout');
        toast.error('การโหลดใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง');
      } else {
        console.error('[Survey] Unknown error:', error.message);
        toast.error('ไม่สามารถโหลดแบบสอบถามได้ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (choiceSetId, profileId) => {
    setSelections({
      ...selections,
      [choiceSetId]: profileId
    });
  };

  const handleNext = () => {
    const currentSet = survey.choice_sets[currentSetIndex];
    if (!selections[currentSet.id]) {
      toast.error('กรุณาเลือกคำตอบก่อนดำเนินการต่อ');
      return;
    }
    setCurrentSetIndex(currentSetIndex + 1);
  };

  const handlePrevious = () => {
    setCurrentSetIndex(currentSetIndex - 1);
  };

  const handleSubmit = async () => {
    if (Object.keys(selections).length !== survey.choice_sets.length) {
      toast.error('กรุณาตอบคำถามให้ครบทุกข้อ');
      return;
    }

    setSubmitting(true);
    try {
      const responses = survey.choice_sets.map(set => ({
        choice_set_id: set.id,
        selected_profile_id: selections[set.id]
      }));

      await axios.post(`${API}/conjoint/survey/${studyId}/response`, {
        study_id: studyId,
        respondent_email: respondentEmail || undefined,
        responses: responses
      });

      setSubmitted(true);
      toast.success('ส่งคำตอบสำเร็จ! ขอบคุณที่ร่วมตอบแบบสอบถาม');
    } catch (error) {
      console.error('Error submitting:', error);
      toast.error('ไม่สามารถส่งคำตอบได้');
    } finally {
      setSubmitting(false);
    }
  };

  const getAttributeValue = (profile, attrId) => {
    const levelId = profile.attribute_levels[attrId];
    const attr = survey.attributes.find(a => a.id === attrId);
    const level = attr?.levels.find(l => l.id === levelId);
    return level;
  };

  // Public top bar — keeps the Conjoint survey visually anchored to the SWU MKT system
  const PublicTopbar = () => (
    <div className="be-public-topbar" data-testid="conjoint-resp-topbar">
      <div className="be-public-brand">
        <img src={SWU_LOGO_URL} alt="SWUMKT Logo" className="be-public-logo"/>
        <span className="be-public-text">
          <span className="be-public-name">SWU · Marketing Research</span>
          <span className="be-public-sub be-mono">CONJOINT ANALYSIS · ANONYMOUS</span>
        </span>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="be-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.18em' }}>LOADING SURVEY…</div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="be-root">
        <PublicTopbar/>
        <div className="be-conjoint-page" style={{ maxWidth: 640, paddingTop: 60 }}>
          <div className="be-card" style={{ padding: 40, textAlign: 'center' }}>
            <div className="be-eyebrow" style={{ marginBottom: 14, justifyContent: 'center' }}>
              <span className="be-dot-sm" style={{ background: 'var(--be-red)' }}/>SURVEY NOT FOUND
            </div>
            <h2 className="be-h2" style={{ fontSize: 22, marginBottom: 16, fontFamily: 'IBM Plex Serif' }}>
              ไม่พบแบบสอบถาม
            </h2>
            <div className="be-mono be-tiny be-muted" style={{ marginBottom: 16 }}>
              STUDY ID · {studyId}
            </div>
            <div className="be-small be-muted" style={{ textAlign: 'left', lineHeight: 1.7, marginBottom: 16 }}>
              <strong>สาเหตุที่เป็นไปได้:</strong>
              <ul style={{ listStyle: 'disc', paddingLeft: 22, marginTop: 6 }}>
                <li>แบบสอบถามยังไม่เปิดรับคำตอบ</li>
                <li>Study ID ไม่ถูกต้อง</li>
                <li>แบบสอบถามถูกลบหรือถูกปิดไปแล้ว</li>
                <li>ปัญหาการเชื่อมต่อเครือข่าย</li>
              </ul>
            </div>
            <button onClick={() => window.location.reload()} className="be-btn be-btn-primary">
              ลองใหม่อีกครั้ง
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="be-root">
        <PublicTopbar/>
        <div className="be-conjoint-page" style={{ maxWidth: 560, paddingTop: 80 }}>
          <div className="be-card" style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, margin: '0 auto 18px', background: 'var(--be-green)',
                          color: '#fff', display: 'grid', placeItems: 'center', fontSize: 32 }}>
              <CheckCircle className="w-10 h-10"/>
            </div>
            <div className="be-eyebrow" style={{ marginBottom: 12, justifyContent: 'center' }}>
              <span className="be-dot-sm" style={{ background: 'var(--be-green)' }}/>RESPONSE SAVED
            </div>
            <h1 className="be-h1" style={{ fontSize: 30, marginBottom: 10, fontFamily: 'IBM Plex Serif' }}>
              ขอบคุณ!
            </h1>
            <p className="be-muted be-small">
              คำตอบของคุณจะถูกนำไปวิเคราะห์เพื่อประโยชน์ในการวิจัย
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currentSet = survey.choice_sets[currentSetIndex];
  const progress = ((currentSetIndex + 1) / survey.choice_sets.length) * 100;
  const isLastSet = currentSetIndex === survey.choice_sets.length - 1;

  return (
    <div className="be-root">
      <PublicTopbar/>
      <div className="be-conjoint-page" style={{ maxWidth: 1200 }}>
        {/* Header */}
        <Card className="p-6 mb-6 bg-white border-2 border-blue-300">
          <h1 className="text-3xl font-black text-gray-900 mb-2">
            {survey.title}
          </h1>
          {survey.description && (
            <p className="text-gray-700 mb-4">{survey.description}</p>
          )}
          
          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="be-mono be-tiny" style={{ color: 'var(--ink-2)', letterSpacing: '0.10em' }}>
                ข้อ {currentSetIndex + 1} จาก {survey.choice_sets.length}
              </span>
              <span className="be-mono be-tiny" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                {Math.round(progress)}%
              </span>
            </div>
            <div style={{ width: '100%', height: 8, background: 'var(--rule)',
                          border: '1px solid var(--rule-strong)' }}>
              <div
                data-testid="conjoint-survey-progress-fill"
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'var(--ink)',
                  transition: 'width 300ms ease-out',
                }}
              ></div>
            </div>
          </div>
        </Card>

        {/* Question */}
        <Card className="p-6 mb-6 bg-white border-2 border-gray-300">
          <h2 className="text-xl font-black text-gray-900 mb-6">
            หากคุณมีทางเลือกต่อไปนี้ คุณจะเลือกแบบไหน?
          </h2>

          <div className={`grid gap-4 ${
            currentSet.profiles.length === 4
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
              : currentSet.profiles.length === 3
              ? 'grid-cols-1 md:grid-cols-3'
              : currentSet.profiles.length === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1'
          }`}>
            {currentSet.profiles.map((profile, idx) => {
              const isSelected = selections[currentSet.id] === profile.id;
              const hasProfileImage = profile.profile_image_url;
              
              return (
                <button
                  key={profile.id}
                  onClick={() => handleSelect(currentSet.id, profile.id)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 shadow-lg'
                      : 'border-gray-300 hover:border-blue-400 bg-white'
                  }`}
                >
                  <div className="font-bold text-gray-900 mb-4 text-center">
                    ตัวเลือก {String.fromCharCode(65 + idx)}
                  </div>
                  
                  {/* Show Profile Image if available */}
                  {hasProfileImage ? (
                    <div className="mb-4 w-full aspect-square">
                      <img
                        src={profile.profile_image_url}
                        alt={`Profile ${String.fromCharCode(65 + idx)}`}
                        className="w-full h-full object-cover rounded border-2 border-gray-200"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  ) : null}
                  
                  {/* Attribute details */}
                  <div className="space-y-3">
                    {survey.attributes.map((attr) => {
                      const level = getAttributeValue(profile, attr.id);
                      const levelImageUrl = profile.images?.[attr.id] || level?.image_url;
                      
                      return (
                        <div key={attr.id}>
                          <div className="text-xs font-bold text-gray-600 mb-1">
                            {attr.name}
                          </div>
                          
                          {/* Show individual level image only if no profile image */}
                          {!hasProfileImage && levelImageUrl && (
                            <div className="w-full aspect-square mb-2">
                              <img
                                src={levelImageUrl}
                                alt={level?.value || attr.name}
                                className="w-full h-full object-cover rounded"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          
                          <div className="text-sm font-bold text-gray-900">
                            {level?.value}
                          </div>
                          
                          {level?.description && (
                            <div className="text-xs text-gray-600 mt-1">
                              {level.description}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {isSelected && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-blue-600 font-bold">
                      <CheckCircle className="w-5 h-5" />
                      เลือกตัวเลือกนี้
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            onClick={handlePrevious}
            disabled={currentSetIndex === 0}
            variant="outline"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            ย้อนกลับ
          </Button>

          {isLastSet ? (
            <div className="flex-1 max-w-md mx-4">
              <input
                type="email"
                value={respondentEmail}
                onChange={(e) => setRespondentEmail(e.target.value)}
                placeholder="อีเมล (ถ้าต้องการ)"
                className="w-full p-2 border-2 border-gray-300 rounded-lg mb-2 text-sm"
              />
              <Button
                onClick={handleSubmit}
                disabled={submitting || !selections[currentSet.id]}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    กำลังส่ง...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    ส่งคำตอบ
                  </>
                )}
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!selections[currentSet.id]}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold"
            >
              ถัดไป
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConjointSurveyPage;

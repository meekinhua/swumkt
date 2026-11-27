import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import Navigation from '@/components/Navigation';
import { BeTopbar, Icon } from '@/pages/brand-equity/be-components';
import { copyToClipboard } from '@/lib/clipboard';
import '@/pages/brand-equity/brand-equity-styles.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { API } from '@/App';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Download,
  Users,
  TrendingUp,
  Star,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  PieChart as PieChartIcon,
  BarChart3,
  GraduationCap,
  Share2,
  Lock,
  Unlock,
  Copy,
  FileText,
  Trash2,
  Network
} from 'lucide-react';
import ShareConjointModal from '@/components/ShareConjointModal';
import ExternalAiWorkflowModal from '@/components/ExternalAiWorkflowModal';
import ConjointCompareMethods from '@/pages/conjoint/ConjointCompareMethods';
import ConjointSegmentCompare from '@/pages/conjoint/ConjointSegmentCompare';
import HBIndividualInsights from '@/pages/conjoint/HBIndividualInsights';
import { BeFilterBar } from '@/pages/brand-equity/BeFilterBar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine
} from 'recharts';

const ConjointResultsPage = () => {
  const navigate = useNavigate();
  const { studyId } = useParams();
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [study, setStudy] = useState(null);
  const [results, setResults] = useState(null);
  const [aiInterpretation, setAiInterpretation] = useState(null);
  const [generatedPrompt, setGeneratedPrompt] = useState(null);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingAI, setLoadingAI] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'academic', or 'advanced'
  const [advancedTechnique, setAdvancedTechnique] = useState('nca'); // 'nca', 'fsqca', or 'ipma'
  const [ncaResults, setNcaResults] = useState(null);
  const [loadingNCA, setLoadingNCA] = useState(false);
  const [fsqcaResults, setFsqcaResults] = useState(null);
  const [loadingFsQCA, setLoadingFsQCA] = useState(false);
  const [statisticalData, setStatisticalData] = useState(null);
  const [loadingStatistical, setLoadingStatistical] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('mnl'); // counting, mnl, mixed_logit, hierarchical_bayes, linear_regression
  const [currentResults, setCurrentResults] = useState(null); // Results to display (either from counting or statistical)
  const [aiAnalysisMode, setAiAnalysisMode] = useState('single'); // 'single' or 'compare_all'

  // ---------- Filter state (time + demographic segments) ----------
  // Mirrors the BrandEquity dashboard. Changing this re-fetches all method
  // results so the whole page (overview, academic, compare) re-aggregates
  // against the same slice.
  const [filter, setFilter] = useState({ from: '', to: '', segments: {} });
  const [compareFilter, setCompareFilter] = useState(null); // Wave B; null = compare disabled
  const [segmentsAvailable, setSegmentsAvailable] = useState({});
  const [demographicsToCapture, setDemographicsToCapture] = useState([]);
  const [totalRespondentCount, setTotalRespondentCount] = useState(0);

  const buildFilterQuery = useCallback(() => {
    const parts = [];
    if (filter.from) parts.push(`from=${encodeURIComponent(filter.from)}`);
    if (filter.to) parts.push(`to=${encodeURIComponent(filter.to)}`);
    const segs = Object.fromEntries(
      Object.entries(filter.segments || {}).filter(([, vs]) => Array.isArray(vs) && vs.length > 0)
    );
    if (Object.keys(segs).length > 0) {
      parts.push(`segments=${encodeURIComponent(JSON.stringify(segs))}`);
    }
    return parts.length > 0 ? `?${parts.join('&')}` : '';
  }, [filter.from, filter.to, filter.segments]);
  
  // Product Image Generator states
  const [productImagePrompt, setProductImagePrompt] = useState('');
  const [productImage, setProductImage] = useState(null);
  const [loadingProductImage, setLoadingProductImage] = useState(false);
  const [selectedReferenceIndices, setSelectedReferenceIndices] = useState([]);
  
  // Shelf Simulation states
  const [environmentType, setEnvironmentType] = useState('auto');
  const [customEnvironment, setCustomEnvironment] = useState('');
  const [shelfStyle, setShelfStyle] = useState('eye_level');
  const [customShelfStyle, setCustomShelfStyle] = useState('');
  const [shelfPrompt, setShelfPrompt] = useState('');
  const [shelfImage, setShelfImage] = useState(null);
  const [loadingShelfImage, setLoadingShelfImage] = useState(false);
  
  // Public sharing states
  const [isPublicResult, setIsPublicResult] = useState(false);
  const [isOwnerOrAdmin, setIsOwnerOrAdmin] = useState(false);
  const [togglingPublic, setTogglingPublic] = useState(false);
  
  // Content sharing states
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingContent, setSharingContent] = useState(false);
  
  // Delete states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Thesis export states
  const [loadingThesis, setLoadingThesis] = useState(false);
  const [thesisProgress, setThesisProgress] = useState(''); // '', 'generating', 'downloading'
  const [showThesisModal, setShowThesisModal] = useState(false);
  const [thesisMethod, setThesisMethod] = useState('mnl');
  const [thesisMethods, setThesisMethods] = useState(['mnl']);
  const [thesisChapters, setThesisChapters] = useState([3, 4, 5]);
  const [extraPrompt, setExtraPrompt] = useState('');
  const [simProducts, setSimProducts] = useState([]);
  const [externalAiInterpOpen, setExternalAiInterpOpen] = useState(false);

  const fetchConjointInterpPrompt = useCallback(async () => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await axios.post(
      `${API}/conjoint/studies/${studyId}/generate-prompt${buildFilterQuery()}`,
      { method: selectedMethod, compare_all: aiAnalysisMode === 'compare_all' },
      { headers }
    );
    return res.data;
  }, [studyId, token, selectedMethod, aiAnalysisMode, buildFilterQuery]);

  const validateConjointInterp = useCallback(async (rawText) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await axios.post(
      `${API}/conjoint/studies/${studyId}/import-ai-interpretation${buildFilterQuery()}`,
      { raw_text: rawText, method: selectedMethod, compare_all: aiAnalysisMode === 'compare_all', dry_run: true },
      { headers }
    );
    return res.data;
  }, [studyId, token, selectedMethod, aiAnalysisMode, buildFilterQuery]);

  const applyConjointInterp = useCallback(async (rawText) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await axios.post(
      `${API}/conjoint/studies/${studyId}/import-ai-interpretation${buildFilterQuery()}`,
      { raw_text: rawText, method: selectedMethod, compare_all: aiAnalysisMode === 'compare_all', dry_run: false },
      { headers }
    );
    setAiInterpretation(res.data);
    setGeneratedPrompt(null);
    toast.success('บันทึกผลวิเคราะห์จาก AI ภายนอกลงระบบเรียบร้อย!');
  }, [studyId, token, selectedMethod, aiAnalysisMode, buildFilterQuery]);

  const aiPollRef = useRef(null);
  const thesisPollRef = useRef(null);
  const filterKey = `${filter.from}|${filter.to}|${JSON.stringify(filter.segments || {})}`;
  const prevFilterKeyRef = useRef(filterKey);
  const hasActiveFilter = Boolean(
    filter.from || filter.to || Object.values(filter.segments || {}).some(vs => (vs || []).length > 0)
  );

  // Clean up any active background job pollers on unmount
  useEffect(() => {
    return () => {
      if (aiPollRef.current) clearInterval(aiPollRef.current);
      if (thesisPollRef.current) clearInterval(thesisPollRef.current);
    };
  }, []);

  // Auto-seed What-If Market Share Simulator once study attributes & part-worths load
  useEffect(() => {
    const attrs = study?.attributes || [];
    const pws = currentResults?.part_worths || {};
    if (!attrs.length || !Object.keys(pws).length) return;
    setSimProducts((prev) => {
      if (prev.length >= 2) {
        const valid = prev.every((p) => attrs.every((a) => p.choices?.[a.id]));
        if (valid) return prev;
      }
      const best = {};
      const worst = {};
      attrs.forEach((a) => {
        const lvls = Object.entries(pws[a.id]?.levels || {}).map(([lid, d]) => ({
          id: lid,
          u: Number(d?.utility ?? 0),
        }));
        lvls.sort((x, y) => y.u - x.u);
        best[a.id] = lvls[0]?.id || a.levels?.[0]?.id || '';
        worst[a.id] = lvls[lvls.length - 1]?.id || a.levels?.[0]?.id || '';
      });
      return [
        { id: 'sim-a', name: 'สินค้าแนะนำ (Optimal)', choices: best },
        { id: 'sim-b', name: 'คู่แข่ง / ทางเลือกเปรียบเทียบ', choices: worst },
      ];
    });
  }, [study, currentResults]);

  // Single deduplicated fetch effect on mount & when filter changes
  useEffect(() => {
    if (!studyId) return;
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      setStatisticalData(null);
      setNcaResults(null);
      setFsqcaResults(null);
      setAiInterpretation(null);
      setGeneratedPrompt(null);
    }
    loadResults();
  }, [studyId, filterKey]); // eslint-disable-line

  // Build filter query string used by all analysis endpoints.
  const buildFilterQs = () => {
    const parts = [];
    if (filter.from) parts.push(`from=${encodeURIComponent(filter.from)}`);
    if (filter.to)   parts.push(`to=${encodeURIComponent(filter.to)}`);
    const segs = Object.fromEntries(
      Object.entries(filter.segments || {}).filter(([, vs]) => (vs || []).length)
    );
    if (Object.keys(segs).length) {
      parts.push(`segments=${encodeURIComponent(JSON.stringify(segs))}`);
    }
    return parts.length ? `&${parts.join('&')}` : '';
  };

  const loadResults = async () => {
    try {
      // Prepare headers (with token if authenticated, without if public)
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const qs = buildFilterQs();

      const [studyRes, resultsRes] = await Promise.all([
        axios.get(`${API}/conjoint/studies/${studyId}?view=summary`, { headers }),
        axios.get(`${API}/conjoint/studies/${studyId}/results?_=1${qs}`, { headers })
      ]);
      
      setStudy(studyRes.data);
      setResults(resultsRes.data);
      // Set as fallback display first; MNL will overwrite this when it loads.
      setCurrentResults(resultsRes.data);

      // Segment filter metadata for the filter bar.
      setSegmentsAvailable(resultsRes.data.segments_available || {});
      setDemographicsToCapture(resultsRes.data.demographics_to_capture || []);
      setTotalRespondentCount(resultsRes.data.total_respondent_count ?? resultsRes.data.respondent_count ?? 0);

      // Set public sharing states
      setIsPublicResult(studyRes.data.is_public_result || false);
      setIsOwnerOrAdmin(studyRes.data.is_owner_or_admin || false);

      // Auto-load default method (MNL) deterministically right after results
      // arrive. This avoids the race where a stray re-render reset the display
      // to counting before MNL finished.
      // Skip if we already have statisticalData (e.g., user navigated back).
      const hasEnoughResponses = (resultsRes.data?.respondent_count ?? 0) >= 30;
      if (selectedMethod === 'mnl' && hasEnoughResponses) {
        // Fire and forget; loadStatisticalAnalysis handles its own loading state.
        loadStatisticalAnalysis('mnl');
      }
    } catch (error) {
      console.error('Error loading results:', error);
      if (error.response?.status === 401) {
        toast.error('กรุณา login เพื่อดูผลการวิจัยนี้');
        navigate('/login');
      } else {
        toast.error('ไม่สามารถโหลดผลการวิเคราะห์ได้');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadStatisticalAnalysis = async (method) => {
    setLoadingStatistical(true);
    try {
      if (method === 'counting') {
        setCurrentResults(results);
        setStatisticalData(null);
        toast.success('แสดงผลแบบ Counting Method');
      } else {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const qs = buildFilterQs();
        const response = await axios.get(
          `${API}/conjoint/studies/${studyId}/statistical-analysis?method=${method}${qs}`,
          { headers }
        );
        setStatisticalData(response.data);
        setCurrentResults(response.data.results);
        const wasCached = response.data.cached;
        toast.success(`${getMethodName(method)} ${wasCached ? '(จาก cache)' : 'คำนวณสำเร็จ!'}`);
      }
    } catch (error) {
      console.error('Error loading statistical analysis:', error);
      toast.error('ไม่สามารถวิเคราะห์ได้');
    } finally {
      setLoadingStatistical(false);
    }
  };

  const getMethodName = (method) => {
    const names = {
      'counting': 'Counting Method (นับความถี่)',
      'mnl': 'Multinomial Logit (MNL)',
      'mixed_logit': 'Mixed Logit',
      'hierarchical_bayes': 'Hierarchical Bayes',
      'linear_regression': 'Linear Regression (OLS)'
    };
    return names[method] || method;
  };

  const loadAIInterpretation = async () => {
    setLoadingAI(true);
    try {
      const requestBody = {
        method: selectedMethod,
        compare_all: aiAnalysisMode === 'compare_all'
      };
      
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/ai-interpretation`,
        requestBody,
        { headers }
      );

      // If cached, result comes back immediately
      if (response.data.status === 'ready') {
        setAiInterpretation(response.data);
        setGeneratedPrompt(null);
        const wasCached = response.data.cached;
        if (aiAnalysisMode === 'compare_all') {
          toast.success(`วิเคราะห์ทุกวิธีสำเร็จ${wasCached ? ' (จาก cache)' : ''}!`);
        } else {
          toast.success(`${getMethodName(selectedMethod)} ${wasCached ? '(จาก cache)' : 'สำเร็จ'}!`);
        }
        setLoadingAI(false);
        return;
      }

      // Background job started — poll for result
      const job_id = response.data.job_id;
      toast.info('AI กำลังวิเคราะห์... รอสักครู่');
      let attempts = 0;
      const maxAttempts = 40; // ~2 minutes at 3s intervals
      let resolved = false;

      if (aiPollRef.current) clearInterval(aiPollRef.current);
      aiPollRef.current = setInterval(async () => {
        if (resolved) return;
        attempts++;
        try {
          const pollRes = await axios.get(
            `${API}/conjoint/studies/${studyId}/ai-interpretation-status/${job_id}`,
            { headers }
          );

          if (pollRes.data.status === 'ready' && !resolved) {
            resolved = true;
            clearInterval(aiPollRef.current);
            aiPollRef.current = null;
            setAiInterpretation(pollRes.data);
            setGeneratedPrompt(null);
            setLoadingAI(false);
            if (aiAnalysisMode === 'compare_all') {
              toast.success('วิเคราะห์ทุกวิธีสำเร็จ!');
            } else {
              toast.success(`${getMethodName(selectedMethod)} สำเร็จ!`);
            }
          } else if (pollRes.data.status === 'failed' && !resolved) {
            resolved = true;
            clearInterval(aiPollRef.current);
            aiPollRef.current = null;
            setLoadingAI(false);
            toast.error(pollRes.data.error || 'AI วิเคราะห์ไม่สำเร็จ — กำลังสร้าง Prompt ให้คัดลอกไปใช้เอง...');
            await loadGeneratedPrompt();
          } else if (attempts >= maxAttempts && !resolved) {
            resolved = true;
            clearInterval(aiPollRef.current);
            aiPollRef.current = null;
            setLoadingAI(false);
            toast.error('AI ใช้เวลานานเกินไป — กำลังสร้าง Prompt ให้คัดลอกไปใช้เอง...');
            await loadGeneratedPrompt();
          }
        } catch (pollErr) {
          console.error('Poll error:', pollErr);
        }
      }, 3000);

    } catch (error) {
      console.error('Error generating AI interpretation:', error);
      toast.error('AI วิเคราะห์ไม่สำเร็จ — กำลังสร้าง Prompt ให้คัดลอกไปใช้เอง...');
      // Auto-generate prompt as fallback
      await loadGeneratedPrompt();
      setLoadingAI(false);
    }
  };

  const loadGeneratedPrompt = async () => {
    setLoadingPrompt(true);
    try {
      const requestBody = {
        method: selectedMethod,
        compare_all: aiAnalysisMode === 'compare_all'
      };
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/generate-prompt${buildFilterQuery()}`,
        requestBody,
        { headers }
      );
      setGeneratedPrompt(response.data.prompt);
      setPromptCopied(false);
    } catch (err) {
      console.error('Error generating prompt:', err);
      toast.error('ไม่สามารถสร้าง Prompt ได้');
    } finally {
      setLoadingPrompt(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (!generatedPrompt) return;
    const ok = await copyToClipboard(generatedPrompt, {
      successMessage: 'คัดลอก Prompt แล้ว! นำไปวางใน ChatGPT / Claude / Gemini ได้เลย',
    });
    if (ok) {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 3000);
    }
  };


  const handleGenerateProductImage = async () => {
    setLoadingProductImage(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/generate-product-from-results`,
        {
          additional_prompt: productImagePrompt || undefined,
          reference_image_indices: selectedReferenceIndices.length > 0 ? selectedReferenceIndices : undefined
        },
        { headers }
      );
      
      setProductImage(response.data);
      toast.success('สร้างภาพผลิตภัณฑ์สำเร็จ!');
    } catch (error) {
      console.error('Error generating product image:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถสร้างภาพผลิตภัณฑ์ได้');
    } finally {
      setLoadingProductImage(false);
    }
  };

  const handleGenerateShelfSimulation = async () => {
    if (!productImage || !productImage.image_url) {
      toast.error('กรุณาสร้างภาพผลิตภัณฑ์ก่อน');
      return;
    }
    
    // Validate custom inputs
    if (environmentType === 'custom' && !customEnvironment.trim()) {
      toast.error('กรุณากรอกคำอธิบายสภาพแวดล้อมแบบกำหนดเอง');
      return;
    }
    
    if (shelfStyle === 'custom' && !customShelfStyle.trim()) {
      toast.error('กรุณากรอกคำอธิบายสไตล์การจัดวางแบบกำหนดเอง');
      return;
    }
    
    setLoadingShelfImage(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/generate-shelf-simulation`,
        {
          product_image_url: productImage.image_url,
          environment_type: environmentType,
          custom_environment: environmentType === 'custom' ? customEnvironment : undefined,
          shelf_style: shelfStyle,
          custom_shelf_style: shelfStyle === 'custom' ? customShelfStyle : undefined,
          additional_prompt: shelfPrompt || undefined
        },
        { headers }
      );
      
      setShelfImage(response.data);
      toast.success('สร้างภาพจำลองชั้นวางสำเร็จ!');
    } catch (error) {
      console.error('Error generating shelf simulation:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถสร้างภาพจำลองได้');
    } finally {
      setLoadingShelfImage(false);
    }
  };

  const handleTogglePublicResult = async () => {
    setTogglingPublic(true);
    try {
      const response = await axios.put(
        `${API}/conjoint/studies/${studyId}/public-result`,
        { is_public: !isPublicResult },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setIsPublicResult(response.data.is_public_result);
      toast.success(
        response.data.is_public_result 
          ? '✅ เปิดแชร์ผลการวิจัยสำเร็จ - ทุกคนสามารถดูได้แล้ว!' 
          : '🔒 ปิดแชร์ผลการวิจัยสำเร็จ - เฉพาะเจ้าของเท่านั้นที่ดูได้'
      );
    } catch (error) {
      console.error('Error toggling public result:', error);
      toast.error('ไม่สามารถเปลี่ยนสถานะการแชร์ได้');
    } finally {
      setTogglingPublic(false);
    }
  };

  const handleCopyShareLink = () => {
    const shareUrl = `${window.location.origin}/conjoint/results/${studyId}`;
    copyToClipboard(shareUrl, { successMessage: 'คัดลอกลิงก์แชร์สำเร็จ!' });
  };

  const handleShareAsContent = async (formData) => {
    setSharingContent(true);
    try {
      // Check if AI interpretation exists, if not generate it first
      let interpretationText = aiInterpretation?.interpretation || null;
      
      if (!interpretationText && isAdmin && results?.respondent_count >= 30) {
        toast.info('⏳ กำลังสร้างการวิเคราะห์ด้วย AI...');
        
        try {
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const aiResponse = await axios.post(
            `${API}/conjoint/studies/${studyId}/ai-interpretation`,
            {
              method: selectedMethod,
              compare_all: false
            },
            { headers }
          );
          
          if (aiResponse.data.status === 'ready') {
            interpretationText = aiResponse.data.interpretation;
            setAiInterpretation(aiResponse.data);
            toast.success('✅ สร้างการวิเคราะห์ด้วย AI สำเร็จ!');
          } else if (aiResponse.data.job_id) {
            // Poll and wait for background job
            const jobId = aiResponse.data.job_id;
            for (let i = 0; i < 30; i++) {
              await new Promise(r => setTimeout(r, 3000));
              const pollRes = await axios.get(
                `${API}/conjoint/studies/${studyId}/ai-interpretation-status/${jobId}`,
                { headers }
              );
              if (pollRes.data.status === 'ready') {
                interpretationText = pollRes.data.interpretation;
                setAiInterpretation(pollRes.data);
                toast.success('✅ สร้างการวิเคราะห์ด้วย AI สำเร็จ!');
                break;
              } else if (pollRes.data.status === 'failed') {
                throw new Error(pollRes.data.error || 'AI failed');
              }
            }
          }
        } catch (aiError) {
          console.error('Error generating AI interpretation:', aiError);
          toast.warning('⚠️ ไม่สามารถสร้างการวิเคราะห์ AI ได้ แต่จะดำเนินการแชร์ต่อ');
        }
      }
      
      // Prepare data for sharing
      const shareData = {
        title: formData.title,
        research_type: formData.researchType,
        sample_size: formData.sampleSize || null,
        data_source: formData.dataSource,
        collection_method: formData.collectionMethod,
        research_date: formData.researchDate || null,
        additional_notes: formData.additionalNotes || null,
        study_id: studyId,
        respondent_count: results?.respondent_count || 0,
        statistical_method: selectedMethod === 'counting' ? 'Counting Method' : getMethodName(selectedMethod),
        importance_scores: currentResults?.importance_scores || {},
        part_worths: currentResults?.part_worths || {},
        ai_interpretation: interpretationText
      };

      toast.info('📊 กำลังสร้าง charts และเนื้อหา...');
      
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/share-content`,
        shareData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('✅ แชร์เป็นเนื้อหาสำเร็จ! พร้อมกราฟและการวิเคราะห์ AI');
      setShowShareModal(false);
      
      // Optional: redirect to content page
      // navigate(`/content/${response.data.content_id}`);
    } catch (error) {
      console.error('Error sharing as content:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถแชร์เป็นเนื้อหาได้');
    } finally {
      setSharingContent(false);
    }
  };



  const handleRunNCA = async () => {
    setLoadingNCA(true);
    try {
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/nca-analysis${buildFilterQuery()}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setNcaResults(response.data);
      toast.success('✅ วิเคราะห์ NCA เสร็จสมบูรณ์!');
    } catch (error) {
      console.error('Error running NCA:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถวิเคราะห์ NCA ได้');
    } finally {
      setLoadingNCA(false);
    }
  };

  const handleRunFsQCA = async () => {
    setLoadingFsQCA(true);
    try {
      const response = await axios.post(
        `${API}/conjoint/studies/${studyId}/fsqca-analysis${buildFilterQuery()}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setFsqcaResults(response.data);
      toast.success('✅ วิเคราะห์ fsQCA เสร็จสมบูรณ์!');
    } catch (error) {
      console.error('Error running fsQCA:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถวิเคราะห์ fsQCA ได้');
    } finally {
      setLoadingFsQCA(false);
    }
  };

  const escapeCsvCell = (cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`;

  const handleExportCSV = async () => {
    try {
      toast.info('กำลังดาวน์โหลดข้อมูล...');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API}/conjoint/studies/${studyId}/export-responses`, { headers });
      const responses = res.data?.responses || [];

      if (!responses.length) {
        toast.error('ไม่มีข้อมูลสำหรับ export');
        return;
      }

      const csvHeaders = ['Respondent ID', 'Email', 'Submitted At', 'Demographics', 'Choices'];
      const rows = responses.map(resp => [
        resp.respondent_id,
        resp.respondent_email || 'N/A',
        resp.submitted_at ? new Date(resp.submitted_at).toLocaleString('th-TH') : '',
        JSON.stringify(resp.demographics || {}),
        JSON.stringify(resp.responses || [])
      ]);

      const csvContent = [
        csvHeaders.map(escapeCsvCell).join(','),
        ...rows.map(row => row.map(escapeCsvCell).join(','))
      ].join('\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `conjoint_results_${studyId}.csv`;
      link.click();

      toast.success('ดาวน์โหลด Wide CSV สำเร็จ');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('ไม่สามารถ export ได้');
    }
  };

  const handleExportLongCSV = async () => {
    try {
      toast.info('กำลังเตรียมข้อมูล Long Format สำหรับ R / Stata / SPSS...');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`${API}/conjoint/studies/${studyId}/export-responses`, { headers });
      const responses = res.data?.responses || [];

      if (!responses.length) {
        toast.error('ไม่มีข้อมูลสำหรับ export');
        return;
      }

      const attrs = study?.attributes || [];
      const csMap = Object.fromEntries((study?.choice_sets || []).map(cs => [cs.id, cs]));
      const levelMaps = {};
      attrs.forEach(a => {
        levelMaps[a.id] = Object.fromEntries((a.levels || []).map(l => [l.id, l.value]));
      });
      const demoKeys = Array.from(new Set(responses.flatMap(r => Object.keys(r.demographics || {}))));

      const csvHeaders = [
        'respondent_id',
        'choice_set_id',
        'task_number',
        'profile_id',
        'chosen',
        ...attrs.map(a => a.name),
        ...demoKeys.map(k => `demo_${k}`),
        'submitted_at'
      ];

      const rows = [];
      responses.forEach(resp => {
        (resp.responses || []).forEach((ch, taskIdx) => {
          const cs = csMap[ch.choice_set_id];
          const chosenId = ch.selected_profile_id || ch.chosen_profile_id || ch.profile_id;
          const profiles = cs?.profiles || [];
          profiles.forEach(prof => {
            rows.push([
              resp.respondent_id,
              ch.choice_set_id,
              cs?.set_number ?? (taskIdx + 1),
              prof.id,
              prof.id === chosenId ? 1 : 0,
              ...attrs.map(a => {
                const lvlId = prof.attribute_levels?.[a.id];
                return levelMaps[a.id]?.[lvlId] ?? lvlId ?? '';
              }),
              ...demoKeys.map(k => resp.demographics?.[k] ?? ''),
              resp.submitted_at || ''
            ]);
          });
        });
      });

      const csvContent = [
        csvHeaders.map(escapeCsvCell).join(','),
        ...rows.map(row => row.map(escapeCsvCell).join(','))
      ].join('\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `conjoint_long_choice_${studyId}.csv`;
      link.click();

      toast.success(`ดาวน์โหลด Long-Format CSV (${rows.length} rows) สำเร็จ`);
    } catch (error) {
      console.error('Long CSV Export error:', error);
      toast.error('ไม่สามารถ export Long-Format CSV ได้');
    }
  };

  const handleExportThesis = () => {
    if (!token) {
      toast.error('กรุณาเข้าสู่ระบบก่อน');
      return;
    }
    setShowThesisModal(true);
  };

  const toggleThesisChapter = (ch) => {
    setThesisChapters(prev => 
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch].sort()
    );
  };

  const toggleThesisMethod = (m) => {
    setThesisMethods(prev => {
      if (prev.includes(m)) {
        if (prev.length === 1) return prev; // keep at least 1
        return prev.filter(x => x !== m);
      }
      return [...prev, m];
    });
  };

  const handleStartThesisExport = async () => {
    if (thesisChapters.length === 0) {
      toast.error('กรุณาเลือกอย่างน้อย 1 บท');
      return;
    }
    setShowThesisModal(false);
    setLoadingThesis(true);
    setThesisProgress('generating');
    const headers = { Authorization: `Bearer ${token}` };
    
    try {
      // Step 1: Start generation
      const startRes = await axios.post(
        `${API}/conjoint/studies/${studyId}/export-thesis`,
        { methods: thesisMethods, chapters: thesisChapters, extra_prompt: extraPrompt || '' },
        { headers }
      );
      
      const { status, job_id } = startRes.data;
      const cacheKey = startRes.data.cached ? job_id : null;
      
      if (status === 'ready') {
        // Already cached, download directly
        setThesisProgress('downloading');
        await downloadThesisFile(headers, cacheKey);
        return;
      }
      
      // Step 2: Poll for completion (with download guard)
      const chapterNames = thesisChapters.map(c => `บทที่ ${c}`).join(', ');
      toast.info(`AI กำลังสร้าง ${chapterNames}... อาจใช้เวลา 1-3 นาที`);
      let attempts = 0;
      const maxAttempts = 60;
      let downloaded = false;
      
      if (thesisPollRef.current) clearInterval(thesisPollRef.current);
      thesisPollRef.current = setInterval(async () => {
        if (downloaded) return;
        attempts++;
        try {
          const pollRes = await axios.get(
            `${API}/conjoint/studies/${studyId}/export-thesis-status/${job_id}`,
            { headers }
          );
          
          if (pollRes.data.status === 'ready' && !downloaded) {
            downloaded = true;
            clearInterval(thesisPollRef.current);
            thesisPollRef.current = null;
            setThesisProgress('downloading');
            await downloadThesisFile(headers);
          } else if (pollRes.data.status === 'failed') {
            downloaded = true;
            clearInterval(thesisPollRef.current);
            thesisPollRef.current = null;
            setLoadingThesis(false);
            setThesisProgress('');
            toast.error(pollRes.data.error || 'ไม่สามารถสร้างเนื้อหาได้ กรุณาลองใหม่');
          } else if (attempts >= maxAttempts) {
            downloaded = true;
            clearInterval(thesisPollRef.current);
            thesisPollRef.current = null;
            setLoadingThesis(false);
            setThesisProgress('');
            toast.error('ใช้เวลานานเกินไป กรุณาลองใหม่');
          }
        } catch (pollErr) {
          console.error('Poll error:', pollErr);
        }
      }, 3000);
      
    } catch (error) {
      console.error('Thesis export error:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถสร้างเอกสารได้');
      setLoadingThesis(false);
      setThesisProgress('');
    }
  };
  
  const downloadThesisFile = async (headers, cacheKey) => {
    try {
      const params = cacheKey ? `?cache_key=${encodeURIComponent(cacheKey)}` : '';
      const dlRes = await axios.get(
        `${API}/conjoint/studies/${studyId}/export-thesis-download${params}`,
        { headers, responseType: 'blob' }
      );
      
      const blob = new Blob([dlRes.data], { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      const chStr = thesisChapters.map(c => `Ch${c}`).join('_');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Conjoint_Thesis_${chStr}_${studyId.slice(0, 8)}.docx`;
      link.click();
      URL.revokeObjectURL(link.href);
      
      toast.success('ดาวน์โหลดเอกสารวิทยานิพนธ์สำเร็จ!');
    } catch (dlError) {
      console.error('Download error:', dlError);
      toast.error('ดาวน์โหลดไม่สำเร็จ');
    } finally {
      setLoadingThesis(false);
      setThesisProgress('');
    }
  };

  const handleDeleteStudy = async () => {
    setDeleting(true);
    try {
      await axios.delete(`${API}/conjoint/studies/${studyId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('ย้ายการศึกษาไปที่ถังขยะสำเร็จ');
      navigate('/market-research/conjoint-analysis');
    } catch (error) {
      console.error('Error deleting study:', error);
      toast.error(error.response?.data?.detail || 'ไม่สามารถลบการศึกษาได้');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="be-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
        <div className="be-mono be-tiny be-muted" style={{ letterSpacing: '0.18em' }}>LOADING ANALYSIS…</div>
      </div>
    );
  }

  if (!currentResults || currentResults.status === 'insufficient_data') {
    const filteredCount = currentResults?.respondent_count || 0;
    const isFilterEmpty = totalRespondentCount >= 30 && hasActiveFilter;
    const surveyLink = `${window.location.origin}/survey/conjoint/${studyId}`;
    return (
      <div className="be-root">
        <BeTopbar user={user} onLogo={() => navigate('/dashboard')}
                  subtitle="CONJOINT ANALYSIS" active="conjoint"/>
        <div className="be-conjoint-page" style={{ maxWidth: 880 }}>
          <button onClick={() => navigate('/market-research/conjoint-analysis')} className="be-btn" style={{ marginBottom: 18 }}>
            <Icon name="chevronL" size={11}/>กลับไปรายการโครงการ
          </button>

          {demographicsToCapture.length > 0 && totalRespondentCount >= 30 && (
            <div className="mb-5">
              <BeFilterBar
                mode="conjoint"
                value={filter}
                compareValue={compareFilter}
                segmentsAvailable={segmentsAvailable}
                responsesTotal={totalRespondentCount}
                responsesFiltered={filteredCount}
                onChange={(next) => setFilter(next)}
                onCompareChange={(next) => setCompareFilter(next)}
                isShowcase={!isOwnerOrAdmin}
              />
            </div>
          )}

          <div className="be-card" style={{ padding: 36, textAlign: 'center' }}>
            <div className="be-eyebrow" style={{ marginBottom: 14, justifyContent: 'center' }}>
              <span className="be-dot-sm" style={{ background: 'var(--be-gold)' }}/>
              {isFilterEmpty ? 'FILTERED SLICE TOO SMALL' : 'COLLECTING RESPONSES'}
            </div>
            <h2 className="be-h2" style={{ fontSize: 22, marginBottom: 10, fontFamily: 'IBM Plex Serif' }}>
              {isFilterEmpty
                ? `กลุ่มที่กรองมีข้อมูล ${filteredCount} คน (ต้องการอย่างน้อย 30 คนเพื่อประมาณค่าสถิติ)`
                : 'ข้อมูลยังไม่เพียงพอสำหรับการวิเคราะห์สถิติ'}
            </h2>
            <p className="be-muted be-small" style={{ marginBottom: 18, maxWidth: 560, marginInline: 'auto' }}>
              {isFilterEmpty
                ? `ข้อมูลรวมทั้งหมดของโครงการนี้มี ${totalRespondentCount} คน — ล้างตัวกรองหรือขยายกลุ่มตัวอย่างเพื่อดูผลวิเคราะห์`
                : 'เกณฑ์ขั้นต่ำของระบบคือ 30 คน (และแนะนำ ≥ 100 คนตามสูตร Orme สำหรับงานวิจัยเชิงลึก)'}
            </p>
            <div className="be-data" style={{ fontSize: 36, color: 'var(--be-blue)' }}>
              {filteredCount}
            </div>
            <div className="be-mono be-tiny be-muted" style={{ marginTop: 4, marginBottom: 22 }}>
              {isFilterEmpty
                ? `FROM TOTAL ${totalRespondentCount} RESPONSES`
                : `CURRENT RESPONSES · ต้องการอีก ${Math.max(0, 30 - filteredCount)} คน`}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              {isFilterEmpty ? (
                <Button
                  onClick={() => setFilter({ from: '', to: '', segments: {} })}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                  data-testid="conjoint-clear-filter-btn"
                >
                  ล้างตัวกรองทั้งหมด
                </Button>
              ) : (
                isOwnerOrAdmin && (
                  <>
                    <Button
                      onClick={async () => {
                        await copyToClipboard(surveyLink);
                        toast.success('คัดลอกลิงก์แบบสอบถามแล้ว');
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                      data-testid="conjoint-collect-copy-link"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      คัดลอกลิงก์แบบสอบถาม
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigate(`/research/conjoint/${studyId}/design`)}
                    >
                      ไปหน้าออกแบบ / เริ่มสำรวจ
                    </Button>
                    {filteredCount > 0 && (
                      <Button variant="outline" onClick={handleExportCSV}>
                        <Download className="w-4 h-4 mr-2" />
                        ดาวน์โหลด Pilot CSV ({filteredCount} คน)
                      </Button>
                    )}
                  </>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sort importance scores (use currentResults instead of results)
  const sortedImportance = Object.entries(currentResults?.importance_scores || {})
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.importance - a.importance);

  const topFeatures = sortedImportance; // Show all features

  // ---------------------------------------------------------------------------
  // Plain-language readout for users without a statistics background.
  //
  // `sampleAdequacy` replaces a status card that was hardcoded to "พร้อมวิเคราะห์ /
  // ข้อมูลเพียงพอแล้ว" no matter how many people had actually responded — a study
  // with 4 respondents was told it was ready to report. The rule used here is the
  // standard planning heuristic for choice-based conjoint (Orme, "Getting Started
  // with Conjoint Analysis", ch. 7):
  //
  //      n · t · a / c  ≥  500
  //
  // n = respondents, t = choice tasks each one saw, a = alternatives per task,
  // c = the largest level count of any single attribute (the attribute that needs
  // the most data). 500 is the minimum for main effects; 1000 is the comfortable
  // target. Expressing the gap as "how many more people" is what makes the number
  // actionable to someone who will never read a power calculation.
  // ---------------------------------------------------------------------------
  // NOTE: deliberately a plain IIFE, not `useMemo`. This runs BELOW the two
  // early returns above (`loading`, `insufficient_data`), so a hook here would
  // execute a different number of times per render and React would throw
  // "Rendered more hooks than during the previous render", taking the whole
  // Results page down the moment data finished loading. The computation is
  // O(attributes) — memoising it buys nothing.
  const sampleAdequacy = (() => {
    const n = currentResults?.respondent_count ?? results?.respondent_count ?? 0;
    // The summary view of a study omits `choice_sets` (it can be megabytes), so
    // prefer the scalar counts the API provides and fall back to the array only
    // when the full document is present. Reading the array alone made this whole
    // block return null on the Results page, leaving the card stuck on
    // "กำลังตรวจสอบ" forever — the exact state it was written to replace.
    const t = study?.num_choice_sets || study?.choice_sets?.length || 0;
    const a = study?.alternatives_per_set || study?.choice_sets?.[0]?.profiles?.length || 0;
    const levelCounts = (study?.attributes || []).map(x => (x.levels || []).length);
    const c = levelCounts.length ? Math.max(...levelCounts) : 0;
    if (!t || !a || !c) return null;

    const ratio = (n * t * a) / c;
    const peopleFor = (target) => Math.ceil((target * c) / (t * a));
    const needMin = peopleFor(500);
    const needGood = peopleFor(1000);

    // MNL cannot be estimated at all on a handful of respondents; the page also
    // gates auto-analysis at 30, so keep the two consistent.
    if (n < 30) {
      return {
        key: 'blocked', n, ratio, needMin, needGood,
        title: 'ยังวิเคราะห์ไม่ได้',
        detail: `มีผู้ตอบ ${n} คน — ต้องมีอย่างน้อย 30 คนก่อนจึงจะประมาณค่าแบบจำลองได้`,
        action: `ขออีก ${30 - n} คน`,
        tone: { card: 'from-red-50 to-white border-red-200', dot: 'bg-red-500', text: 'text-red-600' },
      };
    }
    if (ratio < 500) {
      return {
        key: 'weak', n, ratio, needMin, needGood,
        title: 'ดูแนวโน้มได้ แต่ยังไม่ควรสรุป',
        detail: `ตอนนี้ได้คะแนนความเพียงพอ ${Math.round(ratio)} จากเกณฑ์ขั้นต่ำ 500 — ตัวเลขจะยังแกว่ง`,
        action: `ขออีก ${Math.max(0, needMin - n)} คนเพื่อถึงเกณฑ์`,
        tone: { card: 'from-amber-50 to-white border-amber-200', dot: 'bg-amber-500', text: 'text-amber-600' },
      };
    }
    if (ratio < 1000) {
      return {
        key: 'ok', n, ratio, needMin, needGood,
        title: 'เพียงพอตามเกณฑ์ขั้นต่ำ',
        detail: `คะแนนความเพียงพอ ${Math.round(ratio)} (เกณฑ์ขั้นต่ำ 500) — สรุปผลรวมได้`,
        action: `ถ้าต้องการแยกดูรายกลุ่ม ควรมีราว ${needGood} คน`,
        tone: { card: 'from-lime-50 to-white border-lime-200', dot: 'bg-lime-500', text: 'text-lime-600' },
      };
    }
    return {
      key: 'strong', n, ratio, needMin, needGood,
      title: 'ข้อมูลเพียงพอ',
      detail: `คะแนนความเพียงพอ ${Math.round(ratio)} (เกณฑ์สบายๆ คือ 1000)`,
      action: 'แยกวิเคราะห์รายกลุ่มย่อยได้',
      tone: { card: 'from-green-50 to-white border-green-200', dot: 'bg-green-500', text: 'text-green-600' },
    };
  })();

  // A three-sentence answer to "แล้วมันแปลว่าอะไร" — the winning level of every
  // attribute, ordered by how much that attribute actually drove the choice.
  // Plain IIFE for the same reason as `sampleAdequacy` above.
  const plainSummary = (() => {
    if (!sortedImportance.length || !currentResults?.part_worths) return null;
    const rows = sortedImportance.map((feat) => {
      const levels = Object.values(currentResults.part_worths?.[feat.id]?.levels || {});
      if (!levels.length) return null;
      const best = levels.reduce((a, b) => (b.utility > a.utility ? b : a));
      const worst = levels.reduce((a, b) => (b.utility < a.utility ? b : a));
      return {
        id: feat.id,
        name: feat.name,
        importance: feat.importance,
        best: best.value,
        worst: worst.value,
        flat: Math.abs(best.utility - worst.utility) < 1e-9,
      };
    }).filter(Boolean);
    if (!rows.length) return null;
    const fit = statisticalData?.results?.pseudo_r_squared;
    return { rows, top: rows[0], fit };
  })();

  // Prepare data for Pie Chart
  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
  const pieData = sortedImportance.map((feature, index) => ({
    name: feature.name,
    value: parseFloat(feature.importance.toFixed(1)),
    color: COLORS[index % COLORS.length]
  }));

  // Custom label for pie chart
  const renderCustomLabel = (entry) => {
    return `${entry.value}%`;
  };

  return (
    <div className="be-root">
      <BeTopbar user={user} onLogo={() => navigate('/dashboard')}
                subtitle="CONJOINT ANALYSIS" active="conjoint"
                right={<button className="be-btn be-btn-ghost be-btn-sm" onClick={() => navigate('/market-research/conjoint-analysis')}>
                         <Icon name="chevronL" size={10}/>Studies
                       </button>}/>

      {/* Thesis Export Modal */}
      <Dialog open={showThesisModal} onOpenChange={setShowThesisModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col" data-testid="thesis-export-modal">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-emerald-600" />
              Export วิทยานิพนธ์ (Word)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2 overflow-y-auto flex-1 min-h-0 pr-1">
            {hasActiveFilter && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                ⚠️ การ Export วิทยานิพนธ์จะคำนวณจากข้อมูลทั้งหมดของโครงการ (Full Sample N={totalRespondentCount}) ไม่ใช่เฉพาะกลุ่มที่กรองอยู่
              </div>
            )}
            {/* Method Selection - Multi-select */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                วิธีวิเคราะห์ (เลือกได้หลายวิธี)
              </label>
              <div className="space-y-2">
                {[
                  { id: 'counting', name: 'Counting Method', desc: 'นับความถี่ Part-worth Utilities' },
                  { id: 'mnl', name: 'Multinomial Logit (MNL)', desc: 'Maximum Likelihood, Pseudo R², AIC' },
                  { id: 'linear_regression', name: 'Linear Regression (OLS)', desc: 'R², F-test, t-test' },
                  { id: 'mixed_logit', name: 'Mixed Logit', desc: 'Random Parameters, Preference Heterogeneity' },
                  { id: 'hierarchical_bayes', name: 'Hierarchical Bayes (HB)', desc: 'Empirical Bayes (Panel Mixed Logit SMLE)' }
                ].map(({ id, name, desc }) => (
                  <label
                    key={id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                      thesisMethods.includes(id)
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    data-testid={`thesis-method-${id}`}
                  >
                    <Checkbox
                      checked={thesisMethods.includes(id)}
                      onCheckedChange={() => toggleThesisMethod(id)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm text-gray-800">{name}</span>
                      <span className="text-xs text-gray-500 ml-2">{desc}</span>
                    </div>
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                {thesisMethods.length > 1
                  ? `เลือก ${thesisMethods.length} วิธี — บทที่ 4 จะเปรียบเทียบผลทุกวิธี`
                  : 'เลือก 1 วิธี — สมการและสถิติจะเขียนตามวิธีนี้'}
              </p>
            </div>

            {/* Chapter Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                เลือกบทที่ต้องการ
              </label>
              <div className="space-y-3">
                {[
                  { ch: 3, title: 'บทที่ 3 — ระเบียบวิธีวิจัย (Methodology)', desc: 'Research design, สูตรสมการ, เกณฑ์ทดสอบ, สมมติฐานของแบบจำลอง' },
                  { ch: 4, title: 'บทที่ 4 — ผลการศึกษา (Results)', desc: 'Coefficients, Importance Scores, Model Fit, ตาราง, การทดสอบสมมติฐาน' },
                  { ch: 5, title: 'บทที่ 5 — สรุป อภิปราย ข้อเสนอแนะ (Discussion)', desc: 'สรุปผล, เปรียบเทียบทฤษฎี, ข้อเสนอแนะเชิงกลยุทธ์' }
                ].map(({ ch, title, desc }) => (
                  <label
                    key={ch}
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      thesisChapters.includes(ch)
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    data-testid={`thesis-chapter-${ch}`}
                  >
                    <Checkbox
                      checked={thesisChapters.includes(ch)}
                      onCheckedChange={() => toggleThesisChapter(ch)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-semibold text-sm text-gray-800">{title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

          {/* Extra Prompt */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              คำสั่งเพิ่มเติม (Extra Prompt) — ไม่บังคับ
            </label>
            <textarea
              value={extraPrompt}
              onChange={(e) => setExtraPrompt(e.target.value)}
              placeholder="เช่น: เน้นเรื่องกลยุทธ์ราคา, เพิ่มรายละเอียดเรื่อง Brand Positioning, ใช้ภาษาทางการมากขึ้น..."
              className="w-full min-h-[80px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-y"
              data-testid="thesis-extra-prompt"
            />
            <p className="mt-1 text-xs text-gray-400">
              AI จะนำคำสั่งนี้ไปใช้ประกอบการเขียนเนื้อหาวิทยานิพนธ์
            </p>
          </div>
          </div>

          <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0 pt-2 border-t">
            <Button variant="outline" onClick={() => setShowThesisModal(false)}>
              ยกเลิก
            </Button>
            <Button
              onClick={handleStartThesisExport}
              disabled={thesisChapters.length === 0 || thesisMethods.length === 0}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
              data-testid="thesis-confirm-export-btn"
            >
              <GraduationCap className="w-4 h-4 mr-2" />
              สร้างเอกสาร ({thesisMethods.length} วิธี, {thesisChapters.length} บท)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-3 sm:mb-4 text-sm sm:text-base">
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับ
          </Button>

          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2 leading-tight">
                📊 ผลการวิเคราะห์
              </h1>
              <p className="text-base sm:text-lg text-gray-600 break-words">{study?.title}</p>
              
              {/* Public Share Status Badge */}
              {isOwnerOrAdmin && (
                <div className="mt-2 flex items-center gap-2">
                  {isPublicResult ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-green-100 text-green-700 border border-green-300">
                      <Unlock className="w-3 h-3" />
                      กำลังแชร์สาธารณะ
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700 border border-gray-300">
                      <Lock className="w-3 h-3" />
                      เฉพาะเจ้าของ
                    </span>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              {/* Public Share Toggle Button (Owner/Admin only) */}
              {isOwnerOrAdmin && (
                <>
                  <Button
                    onClick={handleTogglePublicResult}
                    disabled={togglingPublic}
                    variant="outline"
                    className={`w-full sm:w-auto text-sm ${
                      isPublicResult 
                        ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100' 
                        : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {togglingPublic ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                    ) : (
                      <Share2 className="w-4 h-4 mr-2" />
                    )}
                    {isPublicResult ? 'ปิดแชร์' : 'เปิดแชร์ผล'}
                  </Button>
                  
                  {isPublicResult && (
                    <Button
                      onClick={handleCopyShareLink}
                      variant="outline"
                      className="w-full sm:w-auto text-sm bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      คัดลอกลิงก์
                    </Button>
                  )}
                </>
              )}
              
              {isOwnerOrAdmin && (
                <>
                  <Button
                    onClick={() => setShowShareModal(true)}
                    className="w-full sm:w-auto text-sm bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    แชร์เป็นเนื้อหา
                  </Button>

                  <Button
                    onClick={handleExportCSV}
                    className="w-full sm:w-auto text-sm bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    ดาวน์โหลดข้อมูล (CSV)
                  </Button>

                  <Button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full sm:w-auto text-sm bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    ลบการศึกษา
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Statistical Method Selector — every option carries the reason you
            would pick it, so the choice does not require knowing what the
            acronyms expand to. MNL stays the default. */}
        <div className="mb-4 sm:mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 sm:p-4 shadow-sm border-2 border-blue-200">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
              <label className="text-xs sm:text-sm font-bold text-gray-700">เลือกวิธีการวิเคราะห์:</label>
            </div>
            <select
              value={selectedMethod}
              onChange={(e) => {
                setSelectedMethod(e.target.value);
                loadStatisticalAnalysis(e.target.value);
              }}
              className="w-full sm:w-auto px-3 sm:px-4 py-2 border-2 border-blue-300 rounded-lg bg-white text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
            >
              <option value="mnl">⭐ แนะนำ — ใช้วิธีมาตรฐาน (MNL)</option>
              <option value="counting">📊 ดูแบบง่ายที่สุด: นับความถี่ (Counting)</option>
              <option value="mixed_logit">🔀 เมื่อคนแต่ละกลุ่มชอบไม่เหมือนกัน (Mixed Logit)</option>
              <option value="hierarchical_bayes">🎯 เมื่อต้องการผลรายบุคคล (Hierarchical Bayes)</option>
              <option value="linear_regression">📈 baseline เชิงพรรณนา (OLS)</option>
            </select>
            {loadingStatistical && (
              <div className="flex items-center gap-2 text-blue-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-xs sm:text-sm">กำลังคำนวณ...</span>
              </div>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-2 pl-1">
            ไม่แน่ใจว่าเลือกอันไหน? ใช้ค่าตั้งต้น <b>MNL</b> ได้เลย — เป็นวิธีที่งานวิจัยส่วนใหญ่รายงาน
            หรือเปิดแท็บ <b>เปรียบเทียบวิธี</b> เพื่อให้ระบบบอกว่าควรใช้อันไหนกับข้อมูลชุดนี้
          </p>
          {(() => {
            const activeN = currentResults?.respondent_count ?? currentResults?.n_respondents ?? results?.respondent_count ?? 0;
            return ['mixed_logit', 'hierarchical_bayes'].includes(selectedMethod) && activeN < 100 && (
              <div className="mt-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                ⚠️ <strong>หมายเหตุขนาดตัวอย่าง (Small-N Notice):</strong> ปัจจุบันมีผู้ตอบ {activeN} คน (&lt; 100 คน) — ค่าประมาณการความแตกต่างรายบุคคลของ Mixed Logit / HB อาจยังไม่เสถียร แนะนำใช้วิธีมาตรฐาน <strong>MNL</strong> ควบคู่ในการอ้างอิง
              </div>
            );
          })()}
        </div>

        {/* Filter Bar — time + demographic segments (shows segment chips
            only for fields actually collected from respondents) */}
        {demographicsToCapture.length > 0 && (
          <div className="mb-4 sm:mb-6" data-testid="conjoint-filter-bar-wrap">
            <BeFilterBar
              mode="conjoint"
              value={filter}
              compareValue={compareFilter}
              segmentsAvailable={segmentsAvailable}
              responsesTotal={totalRespondentCount}
              responsesFiltered={results?.respondent_count ?? totalRespondentCount}
              onChange={(next) => setFilter(next)}
              onCompareChange={(next) => setCompareFilter(next)}
              isShowcase={!isOwnerOrAdmin}
            />
          </div>
        )}

        {/* Segment Compare Panel — only renders when compare wave is active */}
        {compareFilter && (
          <div className="mb-6" data-testid="conjoint-segment-compare-wrap">
            <ConjointSegmentCompare
              studyId={studyId}
              study={study}
              token={token}
              filterA={filter}
              filterB={compareFilter}
            />
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4 sm:mb-6 bg-white rounded-lg p-2 shadow-sm">
          <button
            onClick={() => setActiveTab('overview')}
            data-testid="tab-overview"
            className={`flex-1 px-3 sm:px-6 py-2 sm:py-3 rounded-md font-bold transition-all text-sm sm:text-base ${
              activeTab === 'overview'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <PieChartIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>ภาพรวมและคำแนะนำ</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('academic')}
            data-testid="tab-academic"
            className={`flex-1 px-3 sm:px-6 py-2 sm:py-3 rounded-md font-bold transition-all text-sm sm:text-base ${
              activeTab === 'academic'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>เชิงวิชาการและสถิติ</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('advanced')}
            data-testid="tab-advanced"
            className={`flex-1 px-3 sm:px-6 py-2 sm:py-3 rounded-md font-bold transition-all text-sm sm:text-base ${
              activeTab === 'advanced'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>เทคนิคขั้นสูง</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('compare')}
            data-testid="tab-compare-methods"
            className={`flex-1 px-3 sm:px-6 py-2 sm:py-3 rounded-md font-bold transition-all text-sm sm:text-base ${
              activeTab === 'compare'
                ? 'bg-gradient-to-r from-slate-800 to-slate-600 text-white shadow-lg'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>เปรียบเทียบวิธี</span>
            </div>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>
            {/* Plain-language answer first. Everything below this card is the
                evidence for it; a reader who stops here should still leave with
                the correct conclusion. */}
            {plainSummary && (
              <Card className="p-4 sm:p-6 mb-6 bg-white border-2 border-blue-300" data-testid="conjoint-plain-summary">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">สรุปผลแบบอ่านง่าย</h2>
                  <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                    ไม่ต้องรู้สถิติก็อ่านได้
                  </span>
                </div>

                <p className="text-sm sm:text-base text-gray-800 leading-relaxed mb-4">
                  สิ่งที่ผู้ตอบให้ความสำคัญมากที่สุดคือ{' '}
                  <b className="text-blue-700">{plainSummary.top.name}</b>{' '}
                  (คิดเป็น {plainSummary.top.importance?.toFixed(1)}% ของการตัดสินใจทั้งหมด)
                  {plainSummary.rows.length > 1 && (
                    <> รองลงมาคือ <b>{plainSummary.rows[1].name}</b> ที่ {plainSummary.rows[1].importance?.toFixed(1)}%</>
                  )}
                </p>

                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-600 flex justify-between">
                    <span>ถ้าจะออกแบบสินค้าให้ถูกใจที่สุด ควรเลือก</span>
                    <span>ความสำคัญ</span>
                  </div>
                  {plainSummary.rows.map((r, i) => (
                    <div key={r.id}
                         className={`px-4 py-3 flex items-center justify-between gap-3 text-sm ${i % 2 ? 'bg-gray-50/60' : 'bg-white'}`}>
                      <div className="min-w-0">
                        <span className="text-gray-600">{r.name}:</span>{' '}
                        {r.flat ? (
                          <span className="text-gray-400">ไม่ต่างกันอย่างมีนัย — เลือกแบบไหนก็ได้</span>
                        ) : (
                          <>
                            <b className="text-emerald-700">{r.best}</b>
                            <span className="text-gray-400 text-xs"> (แทนที่จะเป็น {r.worst})</span>
                          </>
                        )}
                      </div>
                      <span className="font-mono text-xs text-gray-500 flex-shrink-0">
                        {r.importance?.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t text-xs text-gray-600 space-y-1">
                  <p>
                    <b>เชื่อผลนี้ได้แค่ไหน?</b>{' '}
                    {sampleAdequacy?.key === 'strong' || sampleAdequacy?.key === 'ok'
                      ? 'จำนวนผู้ตอบผ่านเกณฑ์แล้ว '
                      : 'จำนวนผู้ตอบยังไม่ผ่านเกณฑ์ ตัวเลขอาจเปลี่ยนได้เมื่อมีคนตอบเพิ่ม '}
                    {typeof plainSummary.fit === 'number' && (
                      <>· ความแม่นของแบบจำลอง (McFadden ρ²) = <b>{plainSummary.fit.toFixed(3)}</b>{' '}
                        {plainSummary.fit < 0.1
                          ? '— ค่อนข้างต่ำ แปลว่าผู้ตอบอาจเลือกเกือบสุ่ม หรือปัจจัยที่วัดยังไม่ใช่ตัวหลัก'
                          : plainSummary.fit < 0.2 ? '— พอใช้' : '— อยู่ในเกณฑ์ดี'}
                      </>
                    )}
                  </p>
                  <p className="text-gray-500">
                    ตัวเลข &quot;ความสำคัญ&quot; บอกว่าปัจจัยนั้นทำให้คนเปลี่ยนใจได้มากแค่ไหน เมื่อเทียบกับปัจจัยอื่นในแบบสอบถามนี้
                    — รวมกันทุกปัจจัยได้ 100%
                  </p>
                </div>
              </Card>
            )}

            {/* What-If Market Share Simulator (Business & Academic Interactive Tool) */}
            {study?.attributes?.length >= 2 && simProducts.length >= 2 && currentResults?.part_worths && (() => {
              const pws = currentResults.part_worths;
              const rawUtils = simProducts.map((prod) =>
                study.attributes.reduce((sum, attr) => {
                  const lvlId = prod.choices?.[attr.id];
                  return sum + Number(pws[attr.id]?.levels?.[lvlId]?.utility ?? 0);
                }, 0)
              );
              const maxU = Math.max(...rawUtils);
              const exps = rawUtils.map((u) => Math.exp(u - maxU));
              const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
              const shares = exps.map((e) => (e / sumExp) * 100);
              const barPalette = ['bg-blue-600', 'bg-emerald-600', 'bg-purple-600', 'bg-amber-500'];

              return (
                <Card className="p-4 sm:p-6 mb-6 bg-white border-2 border-emerald-200" data-testid="conjoint-whatif-simulator">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-600" />
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                          จำลองส่วนแบ่งตลาด (What-If Market Simulator)
                        </h2>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        ทดลองปรับสเปกและราคาสินค้า 2–4 แบบเพื่อดูโอกาสที่ลูกค้าจะเลือกซื้อ (Logit Share of Preference จากผล {getMethodName(selectedMethod)})
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {simProducts.length < 4 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const nextIdx = simProducts.length + 1;
                            const baseChoices = { ...simProducts[0].choices };
                            setSimProducts([...simProducts, { id: `sim-${Date.now()}`, name: `ทางเลือกที่ ${nextIdx}`, choices: baseChoices }]);
                          }}
                        >
                          + เพิ่มคู่แข่ง / ทางเลือก
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSimProducts([])}
                      >
                        รีเซ็ต (แนะนำ vs คู่แข่ง)
                      </Button>
                    </div>
                  </div>

                  {selectedMethod === 'counting' && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      💡 ขณะนี้ใช้สเกล Counting — แนะนำสลับวิธีวิเคราะห์ด้านบนเป็น <strong>MNL</strong> หรือ <strong>HB</strong> เพื่อคำนวณส่วนแบ่งตลาดตามแบบจำลอง Logit ได้แม่นยำขึ้น
                    </div>
                  )}

                  {/* Estimated Share Bars */}
                  <div className="space-y-3 mb-5 p-4 rounded-xl bg-gray-50 border border-gray-200">
                    {simProducts.map((prod, pIdx) => (
                      <div key={prod.id}>
                        <div className="flex items-center justify-between text-xs sm:text-sm font-semibold mb-1">
                          <span className="text-gray-800">{prod.name}</span>
                          <span className="font-mono text-gray-900">
                            {shares[pIdx].toFixed(1)}% <span className="text-[11px] font-normal text-gray-500">(U = {rawUtils[pIdx].toFixed(2)})</span>
                          </span>
                        </div>
                        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${barPalette[pIdx % barPalette.length]}`}
                            style={{ width: `${shares[pIdx]}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Scenario Pickers */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {simProducts.map((prod, pIdx) => (
                      <div key={prod.id} className="p-3 rounded-lg border border-gray-200 bg-white space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={prod.name}
                            onChange={(e) => {
                              const next = [...simProducts];
                              next[pIdx] = { ...next[pIdx], name: e.target.value };
                              setSimProducts(next);
                            }}
                            className="text-xs font-bold text-gray-900 bg-transparent border-b border-gray-300 focus:border-emerald-500 focus:outline-none w-full py-0.5"
                          />
                          {simProducts.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setSimProducts(simProducts.filter((_, idx) => idx !== pIdx))}
                              className="text-xs text-red-500 hover:text-red-700 px-1"
                              title="ลบทางเลือกนี้"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        {study.attributes.map((attr) => (
                          <div key={attr.id}>
                            <label className="block text-[11px] text-gray-500 mb-0.5">{attr.name}</label>
                            <select
                              value={prod.choices?.[attr.id] || ''}
                              onChange={(e) => {
                                const next = [...simProducts];
                                next[pIdx] = {
                                  ...next[pIdx],
                                  choices: { ...next[pIdx].choices, [attr.id]: e.target.value },
                                };
                                setSimProducts(next);
                              }}
                              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:border-emerald-500"
                            >
                              {(attr.levels || []).map((lvl) => (
                                <option key={lvl.id} value={lvl.id}>
                                  {lvl.value}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })()}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="p-4 sm:p-6 bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-gray-600">จำนวนผู้ตอบ</p>
                <p className="text-2xl sm:text-3xl font-black text-blue-600">{currentResults?.respondent_count || results?.respondent_count || 0}</p>
                <p className="text-xs text-gray-500">คน</p>
              </div>
            </div>
          </Card>

          {/* Sample adequacy — computed, not assumed. See `sampleAdequacy`. */}
          <Card
            className={`p-4 sm:p-6 bg-gradient-to-br border-2 ${sampleAdequacy?.tone.card || 'from-gray-50 to-white border-gray-200'}`}
            data-testid="conjoint-sample-adequacy"
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 ${sampleAdequacy?.tone.dot || 'bg-gray-400'}`}>
                {sampleAdequacy?.key === 'blocked' || sampleAdequacy?.key === 'weak'
                  ? <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  : <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-gray-600">ข้อมูลพอหรือยัง</p>
                <p className={`text-lg sm:text-xl font-bold ${sampleAdequacy?.tone.text || 'text-gray-600'}`}>
                  {sampleAdequacy?.title || 'กำลังตรวจสอบ'}
                </p>
                <p className="text-xs text-gray-500">{sampleAdequacy?.detail || '—'}</p>
                {sampleAdequacy?.action && (
                  <p className="text-xs font-semibold text-gray-700 mt-1">→ {sampleAdequacy.action}</p>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-6 bg-gradient-to-br from-purple-50 to-white border-2 border-purple-200">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-gray-600">คุณลักษณะ</p>
                <p className="text-2xl sm:text-3xl font-black text-purple-600">{sortedImportance.length}</p>
                <p className="text-xs text-gray-500">รายการ</p>
              </div>
            </div>
          </Card>
        </div>

        {/* AI Interpretation Section */}
        <Card className="p-4 sm:p-6 mb-6 sm:mb-8 bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-300">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 mb-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                AI ตีความผลและข้อเสนอแนะ
              </h2>
            </div>
            
            {/* AI Analysis Mode Selector */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white px-3 sm:px-4 py-2 rounded-lg border-2 border-indigo-200">
              <label className="text-xs sm:text-sm font-semibold text-gray-700">โหมดวิเคราะห์:</label>
              <select
                value={aiAnalysisMode}
                onChange={(e) => {
                  setAiAnalysisMode(e.target.value);
                  setAiInterpretation(null); // Reset AI interpretation when mode changes
                }}
                className="text-xs sm:text-sm border-2 border-indigo-300 rounded px-2 sm:px-3 py-1 font-medium text-gray-800 focus:outline-none focus:border-indigo-500"
              >
                <option value="single">วิธีเดียว ({getMethodName(selectedMethod)})</option>
                <option value="compare_all">เปรียบเทียบทุกวิธี</option>
              </select>
            </div>
          </div>

          <div className="mb-4 space-y-2">
            {hasActiveFilter && (
              <p className="text-xs text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded border border-indigo-200">
                🔍 กำลังวิเคราะห์เฉพาะกลุ่มที่กรองอยู่ (N={results?.respondent_count || 0}) — Prompt และผลจาก AI ภายนอกจะอ้างอิงและบันทึกแยกตามตัวกรองนี้
              </p>
            )}
            {aiAnalysisMode === 'single' ? (
              <p className="text-sm text-indigo-700 bg-indigo-100 px-4 py-2 rounded-lg border border-indigo-200">
                📊 <strong>วิธีเดียว:</strong> AI จะวิเคราะห์ผลจาก <strong>{getMethodName(selectedMethod)}</strong> ที่กำลังแสดงอยู่บน UI
              </p>
            ) : (
              <p className="text-sm text-purple-700 bg-purple-100 px-4 py-2 rounded-lg border border-purple-200">
                🔬 <strong>เปรียบเทียบทุกวิธี:</strong> AI จะวิเคราะห์และเปรียบเทียบผลจาก 5 วิธี (Counting, Linear Regression, MNL, Mixed Logit, Hierarchical Bayes) เพื่อให้ข้อมูลที่ครอบคลุมและแม่นยำยิ่งขึ้น
              </p>
            )}
          </div>

          {!aiInterpretation ? (
            <div className="text-center py-6 sm:py-8">
              <p className="text-sm sm:text-base text-gray-600 mb-4">
                ใช้ AI ภายนอกฟรี (ChatGPT / Claude / Gemini) ช่วยวิเคราะห์และแปลผลเชิงธุรกิจโดยอิงจากข้อมูลจริง
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {isOwnerOrAdmin && (
                  <Button
                    onClick={() => setExternalAiInterpOpen(true)}
                    disabled={loadingAI || loadingPrompt}
                    className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-sm sm:text-base"
                    data-testid="conjoint-interp-external-ai-btn"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    ใช้ AI ภายนอก (ฟรี · Prompt → วางผล)
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    onClick={loadAIInterpretation}
                    disabled={loadingAI || loadingPrompt}
                    variant="outline"
                    className="w-full sm:w-auto border-2 border-indigo-400 text-indigo-800 bg-white hover:bg-indigo-50 font-bold text-sm sm:text-base"
                    data-testid="ai-interpret-btn"
                  >
                    {loadingAI ? (
                      <>
                        <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2" />
                        กำลังวิเคราะห์...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        {aiAnalysisMode === 'compare_all' ? 'วิเคราะห์ทุกวิธี (Admin)' : 'วิเคราะห์ด้วย AI (Admin)'}
                      </>
                    )}
                  </Button>
                )}
                <Button
                  onClick={loadGeneratedPrompt}
                  disabled={loadingPrompt || loadingAI}
                  variant="outline"
                  className="w-full sm:w-auto border-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50 font-bold text-sm sm:text-base"
                  data-testid="generate-prompt-btn"
                >
                  {loadingPrompt ? (
                    <>
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2" />
                      กำลังสร้าง Prompt...
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      ดู Prompt แบบด่วน
                    </>
                  )}
                </Button>
                {isOwnerOrAdmin && (
                <Button
                  onClick={handleExportThesis}
                  disabled={loadingThesis || loadingAI || loadingPrompt}
                  className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-sm sm:text-base"
                  data-testid="export-thesis-btn"
                >
                  {loadingThesis ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      {thesisProgress === 'downloading' ? 'กำลังดาวน์โหลด...' : 'AI กำลังเขียน...'}
                    </>
                  ) : (
                    <>
                      <GraduationCap className="w-4 h-4 mr-2" />
                      Export วิทยานิพนธ์ (Word)
                    </>
                  )}
                </Button>
                )}
              </div>
              {generatedPrompt && !aiInterpretation && (
                <div className="mt-6 text-left" data-testid="generated-prompt-section">
                  <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0" />
                      <p className="text-sm font-bold text-amber-800">
                        Prompt พร้อมข้อมูลจริง — คัดลอกไปใช้กับ AI ของคุณ
                      </p>
                    </div>
                    <p className="text-xs text-amber-700 mb-3">
                      คัดลอก Prompt ด้านล่างไปวางใน ChatGPT, Claude, Gemini หรือ AI อื่นๆ เพื่อให้วิเคราะห์ผลให้
                    </p>
                    <Button
                      onClick={handleCopyPrompt}
                      className={`w-full sm:w-auto font-bold text-sm ${
                        promptCopied
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-amber-600 hover:bg-amber-700 text-white'
                      }`}
                      data-testid="copy-prompt-btn"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {promptCopied ? 'คัดลอกแล้ว!' : 'คัดลอก Prompt'}
                    </Button>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                      {generatedPrompt}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg p-4 sm:p-6 border-2 border-indigo-200">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
                  <Sparkles className="w-4 h-4" />
                  {aiInterpretation.summary_data?.mode === 'compare_all' 
                    ? `ผลการวิเคราะห์จากทุกวิธี (${Object.keys(aiInterpretation.summary_data?.methods || {}).length} วิธี)`
                    : `ผลการวิเคราะห์จาก ${getMethodName(aiInterpretation.summary_data?.method || selectedMethod)}`
                  }
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {isOwnerOrAdmin && (
                    <Button
                      onClick={() => setExternalAiInterpOpen(true)}
                      size="sm"
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold"
                      data-testid="conjoint-interp-external-ai-after-btn"
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      อัปเดตด้วย AI ภายนอก (ฟรี)
                    </Button>
                  )}
                  <Button
                    onClick={async () => {
                      await loadGeneratedPrompt();
                    }}
                    disabled={loadingPrompt}
                    variant="outline"
                    size="sm"
                    className="border-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                    data-testid="copy-prompt-after-ai-btn"
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    {loadingPrompt ? 'กำลังสร้าง...' : 'ดู Prompt แบบด่วน'}
                  </Button>
                  {isAdmin && (
                    <Button
                      onClick={loadAIInterpretation}
                      disabled={loadingAI}
                      variant="outline"
                      size="sm"
                      className="border-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                      data-testid="ai-reanalyze-btn"
                    >
                      {loadingAI ? (
                        <>
                          <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2" />
                          กำลังวิเคราะห์...
                        </>
                      ) : (
                        <>
                          วิเคราะห์ใหม่ (Admin)
                        </>
                      )}
                    </Button>
                  )}
                  {isOwnerOrAdmin && (
                  <Button
                    onClick={handleExportThesis}
                    disabled={loadingThesis}
                    size="sm"
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
                    data-testid="export-thesis-after-ai-btn"
                  >
                    {loadingThesis ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                        {thesisProgress === 'downloading' ? 'ดาวน์โหลด...' : 'กำลังสร้าง...'}
                      </>
                    ) : (
                      <>
                        <GraduationCap className="w-3 h-3 mr-1" />
                        Export วิทยานิพนธ์
                      </>
                    )}
                  </Button>
                  )}
                </div>
              </div>
              <div className="prose max-w-none">
                <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                  {aiInterpretation.interpretation}
                </div>
              </div>

              {/* Show prompt section if generated */}
              {generatedPrompt && (
                <div className="mt-4 border-t-2 border-amber-200 pt-4" data-testid="prompt-after-ai-section">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-amber-800 flex items-center gap-2">
                      <Copy className="w-4 h-4" />
                      Prompt พร้อมข้อมูลจริง
                    </p>
                    <Button
                      onClick={handleCopyPrompt}
                      size="sm"
                      className={`font-bold text-xs ${
                        promptCopied
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-amber-600 hover:bg-amber-700 text-white'
                      }`}
                      data-testid="copy-prompt-btn-2"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      {promptCopied ? 'คัดลอกแล้ว!' : 'คัดลอก Prompt'}
                    </Button>
                  </div>
                  <p className="text-xs text-amber-700 mb-2">
                    คัดลอกไปวางใน ChatGPT, Claude, Gemini หรือ AI ตัวอื่นได้เลย
                  </p>
                  <div className="bg-gray-900 rounded-lg p-3 max-h-64 overflow-y-auto">
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                      {generatedPrompt}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>


        {/* Product Image Generator - Only show if AI interpretation is available */}
        {aiInterpretation && (
          <Card className="p-6 mb-8 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                🎨 เครื่องมือสร้างภาพผลิตภัณฑ์ตามผลการวิจัย
              </h2>
            </div>
            
            <p className="text-sm text-green-700 mb-4">
              สร้างภาพผลิตภัณฑ์ที่เหมาะสมที่สุดตามผลการวิจัย Conjoint Analysis (คุณสมบัติที่ผู้บริโภคต้องการมากที่สุด)
            </p>

            {!productImage ? (
              <div className="space-y-4">
                {/* Reference Images Management (Owner/Admin only for upload/delete) */}
                <div className="p-4 bg-white rounded-lg border-2 border-green-200">
                  <h3 className="font-bold text-gray-900 mb-3">📷 รูปอ้างอิง (Reference Images)</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    {isOwnerOrAdmin 
                      ? 'อัพโหลดรูปภาพเพื่อเป็นแนวทางในการสร้างภาพผลิตภัณฑ์ (สูงสุด 5 รูป)'
                      : 'รูปภาพอ้างอิงที่ใช้ในการสร้างผลิตภัณฑ์'
                    }
                  </p>
                  
                  {study?.reference_images && study.reference_images.length > 0 ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {study.reference_images.map((img, idx) => (
                          <div key={idx} className="relative group">
                            <div
                              onClick={() => {
                                if (isOwnerOrAdmin) {
                                  setSelectedReferenceIndices(prev =>
                                    prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                                  );
                                }
                              }}
                              className={`${isOwnerOrAdmin ? 'cursor-pointer' : ''} border-2 rounded-lg overflow-hidden transition-all ${
                                selectedReferenceIndices.includes(idx)
                                  ? 'border-green-500 ring-2 ring-green-300'
                                  : 'border-gray-300 hover:border-green-400'
                              }`}
                            >
                              <img
                                src={img}
                                alt={`Reference ${idx + 1}`}
                                className="w-full h-20 object-cover"
                              />
                              {selectedReferenceIndices.includes(idx) && (
                                <div className="absolute top-1 left-1 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow">
                                  ✓
                                </div>
                              )}
                            </div>
                            {isOwnerOrAdmin && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await axios.delete(
                                      `${API}/conjoint/studies/${studyId}/reference-images/${idx}`,
                                      { headers: { Authorization: `Bearer ${token}` } }
                                    );
                                    loadResults();
                                    toast.success('ลบรูปอ้างอิงสำเร็จ');
                                  } catch (error) {
                                    toast.error('ไม่สามารถลบรูปได้');
                                  }
                                }}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs shadow"
                                title="ลบรูปอ้างอิง"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {isOwnerOrAdmin && (
                        <p className="text-xs text-green-700">
                          คลิกเพื่อเลือกรูปที่ต้องการใช้อ้างอิง (เลือกได้หลายรูป)
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">ยังไม่มีรูปอ้างอิง</p>
                  )}
                  
                  {isOwnerOrAdmin && (!study?.reference_images || study.reference_images.length < 5) && (
                    <div className="mt-3">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length === 0) return;
                          
                          const currentCount = study?.reference_images?.length || 0;
                          if (currentCount + files.length > 5) {
                            toast.error(`สามารถอัพโหลดได้สูงสุด 5 รูป (ปัจจุบันมี ${currentCount} รูป)`);
                            return;
                          }
                          
                          try {
                            const imageUrls = await Promise.all(
                              files.map(file => {
                                return new Promise((resolve) => {
                                  const reader = new FileReader();
                                  reader.onloadend = () => resolve(reader.result);
                                  reader.readAsDataURL(file);
                                });
                              })
                            );
                            
                            const existingImages = study?.reference_images || [];
                            await axios.post(
                              `${API}/conjoint/studies/${studyId}/reference-images`,
                              { image_urls: [...existingImages, ...imageUrls] },
                              { headers: { Authorization: `Bearer ${token}` } }
                            );
                            
                            loadResults();
                            toast.success(`อัพโหลด ${files.length} รูปสำเร็จ`);
                            e.target.value = '';
                          } catch (error) {
                            toast.error('ไม่สามารถอัพโหลดรูปได้');
                          }
                        }}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                      />
                    </div>
                  )}
                </div>

                {/* Additional Prompt */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Prompt เพิ่มเติม (ไม่บังคับ) - จะถูกใส่ไว้ด้านหน้าของ prompt
                  </label>
                  <textarea
                    value={productImagePrompt}
                    onChange={(e) => setProductImagePrompt(e.target.value)}
                    placeholder="เช่น: สไตล์โมเดิร์น, โทนสีอบอุ่น, แพคเกจสีฟ้า..."
                    rows={2}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                  <p className="text-xs text-green-700 mt-1">
                    💡 Prompt นี้จะถูกเพิ่มไว้ด้านหน้าของ prompt ที่ AI สร้าง
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold"
                    data-testid="conjoint-copy-product-image-prompt"
                    onClick={async () => {
                      const optimalSpecs = (topFeatures || []).map((f) => {
                        const lvls = Object.values(currentResults?.part_worths?.[f.id]?.levels || {}).sort((a, b) => b.utility - a.utility);
                        return `${f.name}: ${lvls[0]?.value || '-'}`;
                      }).join(', ');
                      const prompt = `${productImagePrompt ? `${productImagePrompt.trim()}. ` : ''}Commercial studio product photography for "${study?.title || 'Product'}" (${study?.product_category || 'consumer product'}). Optimal customer-preferred configuration: ${optimalSpecs}. Clean studio lighting, crisp packaging detail, photorealistic 4K advertisement shot.`;
                      await copyToClipboard(prompt, { successMessage: 'คัดลอก Prompt สร้างภาพสินค้าแล้ว! นำไปวางใน ChatGPT / Gemini / Midjourney ได้เลย' });
                    }}
                  >
                    <Copy className="w-4 h-4 mr-1.5" />
                    คัดลอก Prompt ไปสร้างภาพเอง (ฟรี)
                  </Button>
                  {isAdmin && (
                    <Button
                      onClick={handleGenerateProductImage}
                      disabled={loadingProductImage}
                      variant="outline"
                      className="border-2 border-green-400 text-green-800 hover:bg-green-50 font-semibold"
                    >
                      {loadingProductImage ? (
                        <>
                          <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin mr-2" />
                          กำลังสร้างภาพ...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          สร้างภาพผลิตภัณฑ์ (Admin)
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 border-2 border-green-200">
                  <img
                    src={productImage.image_url}
                    alt="Generated Product"
                    className="w-full max-w-md mx-auto rounded-lg shadow-lg"
                  />
                  
                  {productImage.optimal_features && (
                    <div className="mt-4 p-3 bg-green-50 rounded-lg">
                      <h4 className="font-semibold text-green-900 mb-2">คุณสมบัติที่แนะนำ:</h4>
                      <ul className="text-sm text-green-800 space-y-1">
                        {productImage.optimal_features.map((feature, idx) => (
                          <li key={idx}>• {feature}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {productImage.prompt_used && (
                    <div className="mt-3 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                      <strong>Prompt ที่ใช้:</strong> {productImage.prompt_used}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => setProductImage(null)}
                    variant="outline"
                    className="flex-1"
                  >
                    🔄 สร้างใหม่
                  </Button>
                  <Button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = productImage.image_url;
                      link.download = `product-${studyId}.png`;
                      link.click();
                      toast.success('ดาวน์โหลดรูปภาพสำเร็จ');
                    }}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    📥 ดาวน์โหลด
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Shelf Simulation - Only show if product image is generated */}
        {productImage && (
          <Card className="p-6 mb-8 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                🏪 จำลองภาพสินค้าบนชั้นวาง (On-Shelf Simulation)
              </h2>
            </div>
            
            <p className="text-sm text-amber-700 mb-4">
              สร้างภาพจำลองสินค้าของคุณในสภาพแวดล้อมจริง เพื่อดูว่าจะดึงดูดความสนใจในตลาดได้มากแค่ไหน
            </p>

            {!shelfImage ? (
              <div className="space-y-4">
                {/* Environment Type */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    ประเภทสภาพแวดล้อม
                  </label>
                  <select
                    value={environmentType}
                    onChange={(e) => {
                      setEnvironmentType(e.target.value);
                      if (e.target.value !== 'custom') setCustomEnvironment('');
                    }}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-amber-500 focus:outline-none"
                  >
                    <option value="auto">🤖 ให้ AI เลือกอัตโนมัติ (จากประเภทสินค้า)</option>
                    <option value="cosmetics_store">💄 ร้านเครื่องสำอาง (Boots, Watson)</option>
                    <option value="convenience_store">🏪 ร้านสะดวกซื้อ (7-11, ตู้แช่)</option>
                    <option value="supermarket">🛒 ซูเปอร์มาร์เก็ต (Lotus&apos;s, Big C)</option>
                    <option value="mall">🏬 ห้างสรรพสินค้า (Mall)</option>
                    <option value="custom">✏️ กำหนดเอง (Custom)</option>
                  </select>
                  
                  {environmentType === 'custom' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        value={customEnvironment}
                        onChange={(e) => setCustomEnvironment(e.target.value)}
                        placeholder="เช่น: ร้านกาแฟสไตล์โมเดิร์น, ตลาดนัด, ออนไลน์มาร์เก็ตเพลส..."
                        className="w-full p-3 border-2 border-amber-300 rounded-lg focus:border-amber-500 focus:outline-none bg-amber-50"
                      />
                      <p className="text-xs text-amber-700 mt-1">
                        💡 AI จะสร้าง prompt ตามคำอธิบายของคุณ
                      </p>
                    </div>
                  )}
                </div>

                {/* Shelf Style */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    สไตล์การจัดวาง
                  </label>
                  <select
                    value={shelfStyle}
                    onChange={(e) => {
                      setShelfStyle(e.target.value);
                      if (e.target.value !== 'custom') setCustomShelfStyle('');
                    }}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-amber-500 focus:outline-none"
                  >
                    <option value="eye_level">👁️ ระดับสายตา (Eye Level) - เด่นชัด</option>
                    <option value="shelf_view">📦 มุมชั้นวาง (Shelf View) - กับสินค้าอื่น</option>
                    <option value="aisle_view">🛤️ มุมทางเดิน (Aisle View) - บริบทร้านค้า</option>
                    <option value="custom">✏️ กำหนดเอง (Custom)</option>
                  </select>
                  
                  {shelfStyle === 'custom' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        value={customShelfStyle}
                        onChange={(e) => setCustomShelfStyle(e.target.value)}
                        placeholder="เช่น: มุมบนโต๊ะกาแฟ, ในตะกร้าสินค้า, บนมือลูกค้า..."
                        className="w-full p-3 border-2 border-amber-300 rounded-lg focus:border-amber-500 focus:outline-none bg-amber-50"
                      />
                      <p className="text-xs text-amber-700 mt-1">
                        💡 AI จะสร้าง prompt ตามคำอธิบายของคุณ
                      </p>
                    </div>
                  )}
                </div>

                {/* Additional Prompt */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    ปรับแต่งเพิ่มเติม (ไม่บังคับ) - จะถูกใส่ไว้ด้านหน้าของ prompt
                  </label>
                  <textarea
                    value={shelfPrompt}
                    onChange={(e) => setShelfPrompt(e.target.value)}
                    placeholder="เช่น: แสงสว่างมาก, มีป้ายโปรโมชั่น, สินค้าคู่แข่งเยอะ..."
                    rows={2}
                    className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-xs text-amber-700 mt-1">
                    💡 Prompt นี้จะถูกเพิ่มไว้ด้านหน้าของ prompt ที่ AI สร้าง
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="flex-1 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold"
                    data-testid="conjoint-copy-shelf-image-prompt"
                    onClick={async () => {
                      const envDesc = environmentType === 'custom' ? customEnvironment : environmentType;
                      const styleDesc = shelfStyle === 'custom' ? customShelfStyle : shelfStyle;
                      const prompt = `${shelfPrompt ? `${shelfPrompt.trim()}. ` : ''}Realistic retail shelf photography placing the winning "${study?.title || 'Product'}" product in environment: ${envDesc}, camera angle/placement: ${styleDesc}, surrounded by competing brands, crisp shelf pricing labels, natural retail store lighting.`;
                      await copyToClipboard(prompt, { successMessage: 'คัดลอก Prompt จำลองชั้นวางแล้ว! นำไปวางใน AI สร้างภาพได้เลย' });
                    }}
                  >
                    <Copy className="w-4 h-4 mr-1.5" />
                    คัดลอก Prompt ชั้นวาง (ฟรี)
                  </Button>
                  {isAdmin && (
                    <Button
                      onClick={handleGenerateShelfSimulation}
                      disabled={loadingShelfImage}
                      variant="outline"
                      className="border-2 border-amber-400 text-amber-800 hover:bg-amber-50 font-semibold"
                    >
                      {loadingShelfImage ? (
                        <>
                          <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mr-2" />
                          กำลังสร้างภาพจำลอง...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          สร้างภาพจำลองชั้นวาง (Admin)
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 border-2 border-amber-200">
                  <img
                    src={shelfImage.image_url}
                    alt="Shelf Simulation"
                    className="w-full rounded-lg shadow-lg"
                  />
                  
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 bg-amber-50 rounded">
                      <strong className="text-amber-900">สภาพแวดล้อม:</strong>
                      <p className="text-amber-700">{shelfImage.environment_type?.replace('_', ' ')}</p>
                    </div>
                    <div className="p-2 bg-amber-50 rounded">
                      <strong className="text-amber-900">สไตล์:</strong>
                      <p className="text-amber-700">{shelfImage.shelf_style?.replace('_', ' ')}</p>
                    </div>
                  </div>
                  
                  {shelfImage.prompt_used && (
                    <div className="mt-3 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                      <strong>Prompt ที่ใช้:</strong> {shelfImage.prompt_used}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => setShelfImage(null)}
                    variant="outline"
                    className="flex-1"
                  >
                    🔄 สร้างใหม่
                  </Button>
                  <Button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = shelfImage.image_url;
                      link.download = `shelf-simulation-${studyId}.png`;
                      link.click();
                      toast.success('ดาวน์โหลดรูปภาพสำเร็จ');
                    }}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    📥 ดาวน์โหลด
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}


        {/* Pie Chart */}
        <Card className="p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <PieChartIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                สัดส่วนความสำคัญของแต่ละคุณลักษณะ
              </h2>
              <p className="text-sm text-gray-600">
                แผนภูมิวงกลมแสดงสัดส่วนความสำคัญ (% จาก 100%) <br/>
                <span className="text-xs text-blue-600 font-medium">
                  📊 วิธีการคำนวณปัจจุบัน: {getMethodName(selectedMethod)}
                </span>
                <br/>
                {currentResults?.utility_interpretation && (
                  <span className="text-xs text-gray-500 italic">
                    {currentResults.utility_interpretation}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6">
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius="72%"
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => `${value}%`}
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '2px solid #E5E7EB',
                    borderRadius: '8px',
                    padding: '8px'
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value) => <span className="text-sm font-medium">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Feature Importance */}
        <Card className="p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                <Star className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  คุณลักษณะที่ผู้บริโภคให้ความสำคัญ
                </h2>
                <p className="text-sm text-gray-600">
                  ตัวเลขแสดงระดับความสำคัญ (% จาก 100%)
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {topFeatures.map((feature, index) => (
              <div key={feature.id} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                      index === 0 ? 'bg-yellow-500' :
                      index === 1 ? 'bg-gray-400' :
                      index === 2 ? 'bg-orange-400' : 'bg-gray-300'
                    }`}>
                      {index + 1}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{feature.name}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-blue-600">
                      {feature.importance.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500">ความสำคัญ</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      index === 0 ? 'bg-gradient-to-r from-yellow-400 to-orange-500' :
                      index === 1 ? 'bg-gradient-to-r from-gray-400 to-gray-500' :
                      index === 2 ? 'bg-gradient-to-r from-orange-400 to-red-500' :
                      'bg-gradient-to-r from-blue-400 to-blue-500'
                    }`}
                    style={{ width: `${feature.importance}%` }}
                  ></div>
                </div>

                {/* Bar Chart for Levels */}
                {currentResults?.part_worths?.[feature.id] && (() => {
                  const sortedChartLevels = Object.values(currentResults?.part_worths?.[feature.id]?.levels || {})
                    .sort((a, b) => b.utility - a.utility);
                  const bestVal = sortedChartLevels[0]?.value;
                  return (
                  <div className="mt-4 sm:pl-11">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-gray-600" />
                        <p className="text-xs text-gray-600 font-semibold">เปรียบเทียบ Utility ของแต่ละระดับ:</p>
                      </div>
                      {bestVal && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-800">
                          ⭐ ดีที่สุด: {bestVal}
                        </span>
                      )}
                    </div>
                    <div className="bg-white rounded-lg p-4 border-2 border-gray-200">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart
                          data={sortedChartLevels.map(level => ({
                            name: level.value === bestVal ? `⭐ ${level.value}` : level.value,
                            utility: parseFloat(level.utility.toFixed(3)),
                            count: level.selection_count
                          }))}
                          margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <ReferenceLine y={0} stroke="#64748B" strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="name" 
                            tick={{ fontSize: 12 }}
                            angle={-15}
                            textAnchor="end"
                            height={60}
                          />
                          <YAxis 
                            tick={{ fontSize: 12 }}
                            label={{ value: 'Utility', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                          />
                          <Tooltip 
                            formatter={(value, name, props) => {
                              if (name === 'utility') return [`${value}`, 'Utility'];
                              return [value, name];
                            }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-white p-3 border-2 border-gray-200 rounded-lg shadow-lg">
                                    <p className="font-bold text-gray-900">{payload[0].payload.name}</p>
                                    <p className="text-blue-600">Utility: {payload[0].value}</p>
                                    <p className="text-green-600 text-sm">เลือก {payload[0].payload.count} ครั้ง</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar 
                            dataKey="utility" 
                            fill={COLORS[index % COLORS.length]}
                            radius={[8, 8, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-gray-500 text-center mt-2">
                        💡 แท่งสูง = ผู้บริโภคชอบมากกว่า · เส้นประ 0 = ระดับอ้างอิง (Reference Level)
                      </p>
                    </div>
                  </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </Card>

            {/* Tips */}
            <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-gray-900 mb-2">💡 วิธีอ่านผลการวิเคราะห์</h3>
              <ul className="text-sm text-gray-700 space-y-2">
                <li>• <strong>ความสำคัญ (%):</strong> ยิ่งสูง = ผู้บริโภคให้ความสำคัญมากกว่า เช่น 40% หมายถึงคุณลักษณะนี้มีอิทธิพล 40% ต่อการตัดสินใจซื้อ</li>
                <li>• <strong>ระดับที่ชอบ:</strong> ระดับที่มี ⭐ คือสิ่งที่ผู้บริโภคต้องการมากที่สุด</li>
                <li>• <strong>ตัวเลข Utility:</strong> ยิ่งสูง = ผู้บริโภคชอบมากกว่า (0 คือระดับอ้างอิงในแบบจำลอง Logit/OLS ใช้เปรียบเทียบภายในปัจจัยเดียวกัน ไม่ใช่ร้อยละ)</li>
                <li>• <strong>คำแนะนำ:</strong> ใช้ตาราง &quot;จำลองส่วนแบ่งตลาด&quot; ด้านบน หรือปุ่ม &quot;วิเคราะห์ด้วย AI&quot; เพื่อประกอบการตัดสินใจเชิงธุรกิจ</li>
              </ul>
            </div>
          </div>
        </Card>
          </>
        )}

        {/* Academic Tab */}
        {activeTab === 'academic' && (
          <>
            {/* Relative Importance Table */}
            <Card className="p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                  <Star className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Relative Importance Scores</h2>
                  <p className="text-sm text-gray-600">
                    ความสำคัญสัมพัทธ์ของแต่ละคุณลักษณะ (คำนวณจาก Range ของ Utility)
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gradient-to-r from-orange-100 to-yellow-100">
                      <th className="border-2 border-orange-300 px-4 py-3 text-center font-bold text-gray-900">
                        อันดับ
                      </th>
                      <th className="border-2 border-orange-300 px-4 py-3 text-left font-bold text-gray-900">
                        คุณลักษณะ
                      </th>
                      <th className="border-2 border-orange-300 px-4 py-3 text-right font-bold text-gray-900">
                        Range (Max - Min)
                      </th>
                      <th className="border-2 border-orange-300 px-4 py-3 text-right font-bold text-gray-900">
                        Relative Importance (%)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedImportance.map((feature, index) => {
                      const levels = Object.values(currentResults?.part_worths?.[feature.id]?.levels || {});
                      const utilities = levels.map(l => l.utility);
                      const range = utilities.length > 0 ? Math.max(...utilities) - Math.min(...utilities) : 0;
                      
                      return (
                        <tr key={feature.id} className="hover:bg-orange-50">
                          <td className="border-2 border-orange-200 px-4 py-3 text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-white ${
                              index === 0 ? 'bg-yellow-500' :
                              index === 1 ? 'bg-gray-400' :
                              index === 2 ? 'bg-orange-400' : 'bg-gray-300'
                            }`}>
                              {index + 1}
                            </span>
                          </td>
                          <td className="border-2 border-orange-200 px-4 py-3 font-bold text-gray-900">
                            {feature.name}
                          </td>
                          <td className="border-2 border-orange-200 px-4 py-3 text-right font-mono text-gray-700">
                            {range.toFixed(3)}
                          </td>
                          <td className="border-2 border-orange-200 px-4 py-3 text-right">
                            <span className="text-2xl font-black text-orange-600">
                              {feature.importance.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-orange-100 font-bold">
                      <td colSpan="3" className="border-2 border-orange-300 px-4 py-3 text-right">
                        รวม:
                      </td>
                      <td className="border-2 border-orange-300 px-4 py-3 text-right text-orange-600">
                        100.00%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-4 p-4 bg-orange-50 rounded-lg border-2 border-orange-200">
                <p className="text-sm text-gray-700 mb-2">
                  <strong>📐 สูตรการคำนวณ ({getMethodName(selectedMethod)}):</strong>
                </p>
                <div className="font-mono text-xs bg-white p-3 rounded border border-orange-300">
                  {selectedMethod === 'counting' && (
                    <>
                      <p>Selection%<sub>i</sub> = (Count<sub>i</sub> / Total Count) × 100%</p>
                      <p className="mt-2">Importance<sub>i</sub> = (Range<sub>i</sub> / Σ Range<sub>all</sub>) × 100%</p>
                      <p className="mt-2 text-gray-600">หมายเหตุ: นับจำนวนครั้งที่แต่ละ level ถูกเลือก</p>
                    </>
                  )}
                  {selectedMethod === 'mnl' && (
                    <>
                      <p>β<sub>i</sub> = Logit coefficient จาก MNL model</p>
                      <p className="mt-2">Range<sub>i</sub> = Max(β<sub>i</sub>) - Min(β<sub>i</sub>)</p>
                      <p className="mt-2">Importance<sub>i</sub> = (Range<sub>i</sub> / Σ Range<sub>all</sub>) × 100%</p>
                      <p className="mt-2 text-gray-600">หมายเหตุ: reference level มี β = 0</p>
                    </>
                  )}
                  {selectedMethod === 'linear_regression' && (
                    <>
                      <p>β<sub>i</sub> = OLS regression coefficient</p>
                      <p className="mt-2">Range<sub>i</sub> = Max(β<sub>i</sub>) - Min(β<sub>i</sub>)</p>
                      <p className="mt-2">Importance<sub>i</sub> = (Range<sub>i</sub> / Σ Range<sub>all</sub>) × 100%</p>
                      <p className="mt-2 text-gray-600">หมายเหตุ: reference level มี β = 0</p>
                    </>
                  )}
                  {selectedMethod === 'mixed_logit' && (
                    <>
                      <p>β<sub>i</sub> = Mean coefficient จาก Mixed Logit model</p>
                      <p className="mt-2">Range<sub>i</sub> = Max(β<sub>i</sub>) - Min(β<sub>i</sub>)</p>
                      <p className="mt-2">Importance<sub>i</sub> = (Range<sub>i</sub> / Σ Range<sub>all</sub>) × 100%</p>
                      <p className="mt-2 text-gray-600">หมายเหตุ: แสดง heterogeneity ของ preferences</p>
                    </>
                  )}
                  {selectedMethod === 'hierarchical_bayes' && (
                    <>
                      <p>β<sub>i</sub> = Population mean จาก HB model</p>
                      <p className="mt-2">Range<sub>i</sub> = Max(β<sub>i</sub>) - Min(β<sub>i</sub>)</p>
                      <p className="mt-2">Importance<sub>i</sub> = (Range<sub>i</sub> / Σ Range<sub>all</sub>) × 100%</p>
                      <p className="mt-2 text-gray-600">หมายเหตุ: Individual-level estimates aggregated</p>
                    </>
                  )}
                </div>
              </div>
            </Card>

            {/* Part-Worth Utilities Table */}
            <Card className="p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Part-Worth Utilities</h2>
                  <p className="text-sm text-gray-600">
                    ค่า Utility ของแต่ละระดับ (คะแนนความพึงพอใจที่ผู้บริโภคให้)
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gradient-to-r from-purple-100 to-pink-100">
                      <th className="border-2 border-purple-300 px-4 py-3 text-left font-bold text-gray-900">
                        คุณลักษณะ
                      </th>
                      <th className="border-2 border-purple-300 px-4 py-3 text-left font-bold text-gray-900">
                        ระดับ
                      </th>
                      <th className="border-2 border-purple-300 px-4 py-3 text-right font-bold text-gray-900">
                        Utility
                      </th>
                      <th className="border-2 border-purple-300 px-4 py-3 text-right font-bold text-gray-900">
                        จำนวนครั้งที่เลือก
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedImportance.map((feature, attrIdx) => {
                      const levels = currentResults?.part_worths?.[feature.id]?.levels || {};
                      const sortedLevels = Object.values(levels).sort((a, b) => b.utility - a.utility);
                      
                      return sortedLevels.map((level, levelIdx) => (
                        <tr key={`${feature.id}-${levelIdx}`} className="hover:bg-purple-50">
                          {levelIdx === 0 && (
                            <td
                              className="border-2 border-purple-200 px-4 py-3 font-bold text-gray-900 bg-purple-50"
                              rowSpan={sortedLevels.length}
                            >
                              {feature.name}
                            </td>
                          )}
                          <td className="border-2 border-purple-200 px-4 py-3 text-gray-700">
                            {levelIdx === 0 && '⭐ '}{level.value}
                            {(level.is_reference || (selectedMethod !== 'counting' && Math.abs(level.utility) < 1e-9)) && (
                              <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-600 rounded">
                                อ้างอิง
                              </span>
                            )}
                          </td>
                          {(() => {
                            const isRef = level.is_reference || (selectedMethod !== 'counting' && Math.abs(level.utility) < 1e-9);
                            return (
                              <td className={`border-2 border-purple-200 px-4 py-3 text-right font-mono font-bold ${
                                isRef ? 'text-gray-500' : level.utility > 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {isRef ? '0.000' : `${level.utility > 0 ? '+' : ''}${level.utility.toFixed(3)}`}
                              </td>
                            );
                          })()}
                          <td className="border-2 border-purple-200 px-4 py-3 text-right text-gray-600">
                            {level.selection_count}
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
                <p className="text-sm text-gray-700">
                  {selectedMethod === 'counting' ? (
                    <>
                      <strong>💡 คำอธิบาย (Counting Scale):</strong> Utility แสดงส่วนต่างของสัดส่วนการเลือกเทียบกับโอกาสเฉลี่ยต่อตัวเลือก ค่า<strong className="text-green-600"> บวก (+)</strong> = ถูกเลือกบ่อยกว่าค่าเฉลี่ย
                    </>
                  ) : (
                    <>
                      <strong>💡 คำอธิบาย (Dummy Coding — ระดับอ้างอิง β = 0):</strong> ค่า <strong className="text-gray-700">0.000 (อ้างอิง)</strong> คือระดับฐานที่ใช้เปรียบเทียบ; ค่า<strong className="text-green-600"> บวก (+)</strong> = ผู้บริโภคชอบมากกว่าระดับอ้างอิง และค่า<strong className="text-red-600"> ลบ (-)</strong> = ชอบน้อยกว่าระดับอ้างอิง (สามารถเทียบความแตกต่างระหว่างระดับได้โดยดูผลต่างภายในปัจจัยเดียวกัน)
                    </>
                  )}
                </p>
              </div>
            </Card>

            {/* Statistical Analysis — synced cleanly with top Method Selector */}
            <Card className="p-6 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">การวิเคราะห์ทางสถิติ (Statistical Analysis)</h2>
                    <p className="text-sm text-gray-600">
                      กำลังแสดงผลจากวิธี: <strong className="text-indigo-700">{getMethodName(selectedMethod)}</strong>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {['mnl', 'mixed_logit', 'hierarchical_bayes', 'linear_regression'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={loadingStatistical}
                      onClick={() => {
                        setSelectedMethod(m);
                        loadStatisticalAnalysis(m);
                      }}
                      data-testid={`academic-method-pill-${m}`}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        selectedMethod === m
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                      }`}
                    >
                      {m === 'mnl' ? 'MNL ⭐' : m === 'mixed_logit' ? 'Mixed Logit' : m === 'hierarchical_bayes' ? 'HB (SMLE)' : 'OLS'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Method Descriptions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                  <p className="text-xs font-bold text-indigo-900 mb-1">⭐ Multinomial Logit (MNL)</p>
                  <p className="text-xs text-gray-600">มาตรฐานวิชาการ, มี p-values, Log-likelihood, Pseudo R²</p>
                  <p className="text-xs text-indigo-700 mt-1">📊 Utility: Logit coefficients (อิทธิพลต่อการตัดสินใจ)</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-xs font-bold text-purple-900 mb-1">Mixed Logit</p>
                  <p className="text-xs text-gray-600">แสดงความแตกต่างของความชอบระหว่างผู้ตอบแต่ละคน</p>
                  <p className="text-xs text-purple-700 mt-1">📊 Utility: Mean & Std of preferences</p>
                </div>
                <div className="p-3 bg-pink-50 rounded-lg border border-pink-200">
                  <p className="text-xs font-bold text-pink-900 mb-1">Hierarchical Bayes</p>
                  <p className="text-xs text-gray-600">วิเคราะห์ทั้งระดับบุคคลและประชากร (Empirical Bayes)</p>
                  <p className="text-xs text-pink-700 mt-1">📊 Utility: Individual-level estimates</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs font-bold text-blue-900 mb-1">Linear Regression</p>
                  <p className="text-xs text-gray-600">วิธีพื้นฐาน OLS Regression พร้อม R² และ coefficients</p>
                  <p className="text-xs text-blue-700 mt-1">📊 Utility: OLS coefficients (linear relationship)</p>
                </div>
              </div>

              {!statisticalData ? (
                <div className="text-center py-8 bg-indigo-50 rounded-lg border-2 border-indigo-200">
                  <p className="text-gray-600 mb-4">
                    คลิกปุ่มด้านบนเพื่อคำนวณผลการวิเคราะห์ทางสถิติ
                  </p>
                  <p className="text-xs text-gray-500">
                    เลือกวิธีที่ต้องการแล้วกดปุ่ม "คำนวณ"
                  </p>
                </div>
              ) : (
                <>
                  {/* ===== MODEL FIT DIAGNOSTICS (shared MNL/Mixed/HB) ===== */}
                  {['mnl','mixed_logit','hierarchical_bayes','hb'].includes(statisticalData.method) && (() => {
                    const r = statisticalData.results || {};
                    const rho = r.pseudo_r_squared;
                    const lab = r.fit_label || (
                      rho == null ? 'n/a' :
                      rho < 0 ? 'underfit' :
                      rho < 0.10 ? 'poor' :
                      rho < 0.20 ? 'fair' :
                      rho < 0.30 ? 'good' :
                      rho < 0.40 ? 'excellent' : 'exceptional'
                    );
                    const colorMap = {
                      'underfit': 'bg-red-100 text-red-800 border-red-300',
                      'poor':     'bg-red-50 text-red-700 border-red-200',
                      'fair':     'bg-amber-50 text-amber-800 border-amber-200',
                      'good':     'bg-emerald-50 text-emerald-800 border-emerald-200',
                      'excellent':'bg-emerald-100 text-emerald-900 border-emerald-400',
                      'exceptional':'bg-violet-100 text-violet-900 border-violet-400',
                      'n/a':      'bg-gray-100 text-gray-600 border-gray-200',
                    };
                    const labelTh = {
                      'underfit': 'ฟิตแย่กว่า null (มีปัญหา)',
                      'poor':     'ฟิตต่ำ (ρ²<0.10)',
                      'fair':     'ฟิตพอใช้ (ρ² 0.10-0.20)',
                      'good':     'ฟิตดี (ρ² 0.20-0.30)',
                      'excellent':'ฟิตดีเยี่ยม (ρ² 0.30-0.40)',
                      'exceptional':'ฟิตยอดเยี่ยมหายาก (ρ²>0.40)',
                      'n/a':      'ไม่มีข้อมูล',
                    };
                    const lrStat = r.lr_statistic;
                    const lrDf = r.lr_df;
                    const lrP = r.lr_p_value;
                    const sigVerdict = (lrP != null && lrP < 0.05)
                      ? { txt: 'Model ดีกว่า null อย่างมีนัยสำคัญ (p<0.05)', cls: 'text-emerald-700' }
                      : (lrP != null)
                      ? { txt: 'Model ไม่ดีกว่า null อย่างมีนัยสำคัญ', cls: 'text-red-700' }
                      : { txt: '—', cls: 'text-gray-500' };
                    return (
                      <div className="mb-6 p-5 bg-white border-2 border-slate-200 rounded-xl shadow-sm" data-testid="model-fit-diagnostics">
                        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                          <div>
                            <p className="text-xs uppercase tracking-wider text-slate-500 font-mono">Model Fit Diagnostics</p>
                            <h4 className="text-lg font-bold text-slate-800 font-serif">การประเมินคุณภาพของโมเดล</h4>
                          </div>
                          <div className={`px-4 py-2 rounded-full border-2 font-bold text-sm uppercase tracking-wide ${colorMap[lab] || colorMap['n/a']}`} data-testid="fit-label-badge">
                            ρ² {rho != null ? rho.toFixed(3) : '—'} · {labelTh[lab] || lab}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-xs text-slate-500 font-mono">LR statistic (χ²)</p>
                            <p className="text-xl font-bold text-slate-800">{lrStat != null ? lrStat.toFixed(2) : '—'}</p>
                            <p className="text-xs text-slate-500">df = {lrDf ?? '—'}</p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-xs text-slate-500 font-mono">LR test p-value</p>
                            <p className="text-xl font-bold text-slate-800">{lrP != null ? (lrP < 0.001 ? '<0.001' : lrP.toFixed(3)) : '—'}</p>
                            <p className={`text-xs font-medium ${sigVerdict.cls}`}>{sigVerdict.txt}</p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="text-xs text-slate-500 font-mono">McFadden Scale</p>
                            <p className="text-[11px] text-slate-700 leading-relaxed">
                              <b>0-0.1</b> poor · <b>0.1-0.2</b> fair · <b>0.2-0.3</b> good · <b>0.3-0.4</b> excellent · <b>{'>'}0.4</b> exceptional
                            </p>
                          </div>
                        </div>
                        {r.fit_description && (
                          <p className="mt-3 text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded border-l-4 border-slate-300" data-testid="fit-description">
                            {r.fit_description}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* ===== METHOD-SPECIFIC MODEL SUMMARY ===== */}

                  {/* --- MNL Summary --- */}
                  {statisticalData.method === 'mnl' && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                      <div className="p-4 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg border-2 border-indigo-200">
                        <p className="text-xs text-gray-600 mb-1">Pseudo R² (McFadden ρ²)</p>
                        <p className="text-2xl font-black text-indigo-600">
                          {(statisticalData.results?.pseudo_r_squared ?? 0).toFixed(3)}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">
                          {(statisticalData.results?.pseudo_r_squared || 0) > 0.2 ? 'Good fit' :
                           (statisticalData.results?.pseudo_r_squared || 0) > 0.1 ? 'Acceptable' : 'Low fit'}
                        </p>
                      </div>
                      <div className="p-4 bg-gradient-to-br from-emerald-50 to-green-50 rounded-lg border-2 border-emerald-200">
                        <p className="text-xs text-gray-600 mb-1">Log-Likelihood</p>
                        <p className="text-2xl font-black text-emerald-600">
                          {(statisticalData.results?.log_likelihood || 0).toFixed(1)}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">ยิ่งใกล้ 0 ยิ่งดี</p>
                      </div>
                      <div className="p-4 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-lg border-2 border-amber-200">
                        <p className="text-xs text-gray-600 mb-1">AIC</p>
                        <p className="text-2xl font-black text-amber-600">
                          {(statisticalData.results?.aic || 0).toFixed(1)}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">ยิ่งต่ำยิ่งดี (เทียบระหว่างโมเดล)</p>
                      </div>
                      <div className="p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-lg border-2 border-slate-200">
                        <p className="text-xs text-gray-600 mb-1">Observations</p>
                        <p className="text-2xl font-black text-slate-600">
                          {statisticalData.results?.n_observations?.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">{statisticalData.respondent_count} respondents</p>
                      </div>
                    </div>
                  )}

                  {/* --- Mixed Logit Summary --- */}
                  {statisticalData.method === 'mixed_logit' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                      <div className="p-4 bg-gradient-to-br from-purple-50 to-fuchsia-50 rounded-lg border-2 border-purple-200">
                        <p className="text-xs text-gray-600 mb-1">Respondents Analyzed</p>
                        <p className="text-2xl font-black text-purple-600">
                          {statisticalData.results?.n_respondents?.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">Individual-level analysis</p>
                      </div>
                      <div className="p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-lg border-2 border-slate-200">
                        <p className="text-xs text-gray-600 mb-1">Observations</p>
                        <p className="text-2xl font-black text-slate-600">
                          {statisticalData.results?.n_observations?.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">Total choice records</p>
                      </div>
                      <div className="p-4 bg-gradient-to-br from-rose-50 to-pink-50 rounded-lg border-2 border-rose-200">
                        <p className="text-xs text-gray-600 mb-1">Preference Heterogeneity</p>
                        <p className="text-2xl font-black text-rose-600">
                          {Object.keys(statisticalData.results?.std_coefficients || {}).length > 0 ? 'Detected' : 'Low'}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">Variation across respondents</p>
                      </div>
                    </div>
                  )}

                  {/* --- HB Summary --- */}
                  {statisticalData.method === 'hierarchical_bayes' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                      <div className="p-4 bg-gradient-to-br from-pink-50 to-rose-50 rounded-lg border-2 border-pink-200">
                        <p className="text-xs text-gray-600 mb-1">Respondents Estimated</p>
                        <p className="text-2xl font-black text-pink-600">
                          {statisticalData.results?.n_respondents?.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">Empirical Bayes estimates</p>
                      </div>
                      <div className="p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-lg border-2 border-slate-200">
                        <p className="text-xs text-gray-600 mb-1">Observations</p>
                        <p className="text-2xl font-black text-slate-600">
                          {statisticalData.results?.n_observations?.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">Total data points</p>
                      </div>
                      <div className="p-4 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg border-2 border-teal-200">
                        <p className="text-xs text-gray-600 mb-1">Utility Scale</p>
                        <p className="text-2xl font-black text-teal-600">
                          Logit (β)
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">Empirical Bayes (ref β = 0)</p>
                      </div>
                    </div>
                  )}

                  {/* --- OLS Summary --- */}
                  {statisticalData.method === 'linear_regression' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                      <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200">
                        <p className="text-xs text-gray-600 mb-1">R² (Coefficient of Determination)</p>
                        <p className="text-2xl font-black text-blue-600">
                          {((statisticalData.results?.r_squared || 0) * 100).toFixed(2)}%
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">
                          {(statisticalData.results?.r_squared || 0) > 0.3 ? 'Good fit' : 'Moderate fit'}
                        </p>
                      </div>
                      <div className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 rounded-lg border-2 border-violet-200">
                        <p className="text-xs text-gray-600 mb-1">Intercept (β₀)</p>
                        <p className="text-2xl font-black text-violet-600">
                          {(statisticalData.results?.intercept || 0).toFixed(4)}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">Baseline probability</p>
                      </div>
                      <div className="p-4 bg-gradient-to-br from-slate-50 to-gray-50 rounded-lg border-2 border-slate-200">
                        <p className="text-xs text-gray-600 mb-1">Observations</p>
                        <p className="text-2xl font-black text-slate-600">
                          {statisticalData.results?.n_observations?.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">Total data points</p>
                      </div>
                    </div>
                  )}

                  {/* ===== MODEL SPECIFICATION (fields from the 2026-08 audit) ===== */}
                  {(() => {
                    const r = statisticalData.results || {};
                    const hasAny = [
                      r.pseudo_r_squared_adj, r.n_choice_situations, r.n_parameters,
                      r.random_vars, r.fixed_vars, r.reference_levels, r.excluded_levels,
                    ].some(v => v !== undefined && v !== null);
                    if (!hasAny) return null;
                    const refPairs = Object.entries(r.reference_levels || {});
                    const excluded = r.excluded_levels || [];
                    const pw = r.part_worths || {};
                    const attrName = (aid) => pw[aid]?.name || aid;
                    const levelName = (aid, lid) => pw[aid]?.levels?.[lid]?.value || lid;
                    return (
                      <div className="mb-6 p-5 bg-white border-2 border-slate-200 rounded-xl" data-testid="model-specification-card">
                        <p className="text-xs uppercase tracking-wider text-slate-500 font-mono">Model Specification</p>
                        <h4 className="text-lg font-bold text-slate-800 mb-4">รายละเอียดโมเดลที่ประมาณค่า</h4>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200" data-testid="spec-rho-adj">
                            <p className="text-xs text-slate-500 font-mono">Adjusted ρ²</p>
                            <p className="text-xl font-bold text-slate-800">
                              {r.pseudo_r_squared_adj != null ? Number(r.pseudo_r_squared_adj).toFixed(3) : '—'}
                            </p>
                            <p className="text-[11px] text-slate-500">ปรับตามจำนวนพารามิเตอร์</p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200" data-testid="spec-situations">
                            <p className="text-xs text-slate-500 font-mono">Choice situations</p>
                            <p className="text-xl font-bold text-slate-800">
                              {r.n_choice_situations != null ? Number(r.n_choice_situations).toLocaleString() : '—'}
                            </p>
                            <p className="text-[11px] text-slate-500">ฐานคำนวณ AIC/BIC</p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200" data-testid="spec-parameters">
                            <p className="text-xs text-slate-500 font-mono">Parameters (K)</p>
                            <p className="text-xl font-bold text-slate-800">
                              {r.n_parameters != null ? Number(r.n_parameters).toLocaleString() : '—'}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {r.ic_sample_basis ? `basis: ${r.ic_sample_basis}` : 'ค่าที่ถูกลงโทษใน BIC'}
                            </p>
                          </div>
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200" data-testid="spec-random-fixed">
                            <p className="text-xs text-slate-500 font-mono">Random / Fixed</p>
                            <p className="text-xl font-bold text-slate-800">
                              {r.random_vars ? `${r.random_vars.length} / ${(r.fixed_vars || []).length}` : '—'}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {r.random_vars ? 'สัมประสิทธิ์ที่ยอมให้แตกต่างรายบุคคล' : 'ไม่ใช้กับวิธีนี้'}
                            </p>
                          </div>
                        </div>

                        {r.random_vars && r.random_vars.length > 0 && (
                          <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg" data-testid="spec-random-list">
                            <p className="text-xs font-bold text-purple-900 mb-1">Random coefficients</p>
                            <p className="text-xs text-gray-700 break-words">{r.random_vars.join(', ')}</p>
                            {(r.fixed_vars || []).length > 0 && (
                              <>
                                <p className="text-xs font-bold text-purple-900 mt-2 mb-1">
                                  Fixed (taste SD ไม่มีนัยสำคัญ จึงตรึงไว้)
                                </p>
                                <p className="text-xs text-gray-700 break-words">{r.fixed_vars.join(', ')}</p>
                              </>
                            )}
                          </div>
                        )}

                        {refPairs.length > 0 && (
                          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg" data-testid="spec-reference-levels">
                            <p className="text-xs font-bold text-blue-900 mb-1">Reference levels (β = 0)</p>
                            <ul className="text-xs text-gray-700 space-y-0.5">
                              {refPairs.map(([attr, lvl]) => (
                                <li key={attr}>• <b>{attrName(attr)}</b>: {levelName(attr, lvl)}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {excluded.length > 0 && (
                          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg" data-testid="spec-excluded-levels">
                            <p className="text-xs font-bold text-amber-900 mb-1">
                              Levels ที่ประมาณค่าไม่ได้ ({excluded.length})
                            </p>
                            <ul className="text-xs text-gray-700 space-y-0.5">
                              {excluded.map((e, i) => (
                                <li key={i}>
                                  • <b>{attrName(e.attribute_id)}</b>: {levelName(e.attribute_id, e.level_id)}
                                  {e.reason === 'never_shown' ? ' (ไม่เคยถูกแสดง)' : ' (ไม่มีความแปรผัน)'}
                                </li>
                              ))}
                            </ul>
                            <p className="text-[11px] text-amber-800 mt-1">
                              เกิดจากไม่มีความแปรผันภายใน choice set หรือไม่เคยถูกแสดงให้ผู้ตอบเห็น
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Utility Scale Info */}
                  {statisticalData.results?.utility_interpretation && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-blue-900 mb-1">
                            วิธีการคำนวณ Utility ({statisticalData.results?.method || getMethodName(statisticalData.method)}):
                          </p>
                          <p className="text-xs text-gray-700">
                            {statisticalData.results.utility_interpretation}
                          </p>
                          {statisticalData.results?.note && (
                            <p className="text-xs text-gray-500 mt-1 italic">
                              {statisticalData.results.note}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ===== COEFFICIENTS TABLE (adaptive columns) ===== */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" data-testid="statistical-coefficients-table">
                      <thead>
                        <tr className="bg-gradient-to-r from-indigo-100 to-purple-100">
                          <th className="border-2 border-indigo-300 px-4 py-3 text-left font-bold text-gray-900">
                            คุณลักษณะ
                          </th>
                          <th className="border-2 border-indigo-300 px-4 py-3 text-left font-bold text-gray-900">
                            ระดับ
                          </th>
                          <th className="border-2 border-indigo-300 px-4 py-3 text-right font-bold text-gray-900">
                            {statisticalData.method === 'linear_regression' ? 'Coefficient (β)' :
                             statisticalData.method === 'mnl' ? 'Logit Coef.' :
                             'Utility'}
                          </th>
                          {/* MNL: show p-value column */}
                          {statisticalData.method === 'mnl' && statisticalData.results?.p_values && (
                            <>
                              <th className="border-2 border-indigo-300 px-4 py-3 text-right font-bold text-gray-900">
                                Std. Error
                              </th>
                              <th className="border-2 border-indigo-300 px-4 py-3 text-right font-bold text-gray-900">
                                z-value
                              </th>
                              <th className="border-2 border-indigo-300 px-4 py-3 text-center font-bold text-gray-900">
                                p-value
                              </th>
                            </>
                          )}
                          {/* Mixed Logit: show Std Dev column */}
                          {statisticalData.method === 'mixed_logit' && (
                            <th className="border-2 border-indigo-300 px-4 py-3 text-right font-bold text-gray-900">
                              Std. Dev.
                            </th>
                          )}
                          {/* HB: show Population Std column */}
                          {statisticalData.method === 'hierarchical_bayes' && (
                            <th className="border-2 border-indigo-300 px-4 py-3 text-right font-bold text-gray-900">
                              Population Std.
                            </th>
                          )}
                          <th className="border-2 border-indigo-300 px-4 py-3 text-center font-bold text-gray-900">
                            สถานะ
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(statisticalData.results?.part_worths || {}).map(([attrId, attrData]) => {
                          const levels = Object.values(attrData.levels || {});
                          const pValues = statisticalData.results?.p_values || {};
                          const stdErrors = statisticalData.results?.std_errors || {};
                          const zValues = statisticalData.results?.z_values || {};
                          const stdCoefs = statisticalData.results?.std_coefficients || {};
                          const popStd = statisticalData.results?.population_std || {};

                          return levels.map((level, levelIdx) => {
                            const colKey = `${attrData.name}_${level.value}`;
                            const pVal = pValues[colKey];
                            const seVal = stdErrors[colKey];
                            const zVal = zValues[colKey];
                            const sdVal = stdCoefs[colKey];
                            const popSdVal = popStd[colKey];
                            const utilVal = level.utility ?? level.coefficient ?? 0;
                            // Prefer the explicit flags the backend now sends.
                            // Inferring "reference" from utility === 0 is wrong in
                            // both directions: a level that could not be estimated
                            // also reports 0, and a genuinely estimated coefficient
                            // can legitimately be 0. Keep the old heuristic only as
                            // a fallback for methods that do not send the flags.
                            const isExcluded = level.is_excluded === true;
                            const isRef = level.is_reference !== undefined
                              ? level.is_reference === true
                              : (utilVal === 0 && !pVal);

                            return (
                              <tr key={`${attrId}-${levelIdx}`} className="hover:bg-indigo-50">
                                {levelIdx === 0 && (
                                  <td className="border-2 border-indigo-200 px-4 py-3 font-bold text-gray-900 bg-indigo-50" rowSpan={levels.length}>
                                    {attrData.name}
                                  </td>
                                )}
                                <td className="border-2 border-indigo-200 px-4 py-3 text-gray-700">{level.value}</td>
                                <td className={`border-2 border-indigo-200 px-4 py-3 text-right font-mono font-bold ${
                                  isRef ? 'text-gray-400' : utilVal > 0 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {isRef ? '0.0000 (ref)' : (utilVal > 0 ? '+' : '') + utilVal.toFixed(4)}
                                </td>

                                {/* MNL extra columns */}
                                {statisticalData.method === 'mnl' && statisticalData.results?.p_values && (
                                  <>
                                    <td className="border-2 border-indigo-200 px-4 py-3 text-right font-mono text-sm text-gray-600">
                                      {isRef ? '-' : (seVal != null ? seVal.toFixed(4) : '-')}
                                    </td>
                                    <td className="border-2 border-indigo-200 px-4 py-3 text-right font-mono text-sm text-gray-600">
                                      {isRef ? '-' : (zVal != null ? zVal.toFixed(3) : '-')}
                                    </td>
                                    <td className="border-2 border-indigo-200 px-4 py-3 text-center">
                                      {isRef ? (
                                        <span className="text-gray-400">-</span>
                                      ) : pVal != null ? (
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                          pVal < 0.001 ? 'bg-green-100 text-green-800' :
                                          pVal < 0.01 ? 'bg-green-50 text-green-700' :
                                          pVal < 0.05 ? 'bg-yellow-50 text-yellow-700' :
                                          'bg-red-50 text-red-600'
                                        }`}>
                                          {pVal < 0.001 ? '< 0.001 ***' :
                                           pVal < 0.01 ? `${pVal.toFixed(3)} **` :
                                           pVal < 0.05 ? `${pVal.toFixed(3)} *` :
                                           pVal.toFixed(3)}
                                        </span>
                                      ) : '-'}
                                    </td>
                                  </>
                                )}

                                {/* Mixed Logit: Std Dev */}
                                {statisticalData.method === 'mixed_logit' && (
                                  <td className="border-2 border-indigo-200 px-4 py-3 text-right font-mono text-sm text-gray-600">
                                    {isRef ? '-' : (sdVal != null ? `\u00B1 ${sdVal.toFixed(4)}` : '-')}
                                  </td>
                                )}

                                {/* HB: Population Std */}
                                {statisticalData.method === 'hierarchical_bayes' && (
                                  <td className="border-2 border-indigo-200 px-4 py-3 text-right font-mono text-sm text-gray-600">
                                    {isRef ? '-' : (popSdVal != null ? `\u00B1 ${popSdVal.toFixed(4)}` : '-')}
                                  </td>
                                )}

                                <td className="border-2 border-indigo-200 px-4 py-3 text-center">
                                  {isExcluded ? (
                                    <span
                                      className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-bold"
                                      title="ระดับนี้ไม่เคยถูกแสดงให้ผู้ตอบเห็น จึงประมาณค่าไม่ได้ — ค่า 0 ที่แสดงไม่ใช่ผลการประมาณ"
                                    >
                                      ประมาณค่าไม่ได้
                                    </span>
                                  ) : isRef ? (
                                    <span className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs font-bold">Reference</span>
                                  ) : statisticalData.method === 'mnl' && pVal != null ? (
                                    pVal < 0.05 ? (
                                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">Sig.</span>
                                    ) : (
                                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">N.S.</span>
                                    )
                                  ) : Math.abs(utilVal) > 0.01 ? (
                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">Active</span>
                                  ) : (
                                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">Low</span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* ===== METHOD-SPECIFIC INTERPRETATION ===== */}
                  <div className="mt-4 p-4 bg-indigo-50 rounded-lg border-2 border-indigo-200">
                    <p className="text-sm text-gray-700 mb-2"><strong>คำอธิบาย ({getMethodName(statisticalData.method)}):</strong></p>
                    <ul className="text-sm text-gray-700 space-y-1 ml-4">
                      {statisticalData.method === 'mnl' && (
                        <>
                          <li>• <strong>Logit Coef.:</strong> ค่าสัมประสิทธิ์จาก Conditional Logit — บวก = เพิ่มโอกาสถูกเลือก, ลบ = ลดโอกาส</li>
                          <li>• <strong>p-value:</strong> *** = p{'<'}0.001, ** = p{'<'}0.01, * = p{'<'}0.05 (มีนัยสำคัญทางสถิติ)</li>
                          <li>• <strong>Pseudo R² (McFadden ρ²):</strong> {(statisticalData.results?.pseudo_r_squared || 0).toFixed(3)} — เกณฑ์แบบจำลองทางเลือก: 0.20–0.40 ถือว่าแม่นยำดีมาก (ไม่ใช่ค่าร้อยละของ R² แบบ OLS)</li>
                          <li>• <strong>AIC:</strong> {(statisticalData.results?.aic || 0).toFixed(1)} — ใช้เปรียบเทียบระหว่างโมเดล (ยิ่งต่ำยิ่งดี)</li>
                        </>
                      )}
                      {statisticalData.method === 'mixed_logit' && (
                        <>
                          <li>• <strong>Utility (Mean):</strong> ค่าเฉลี่ยความชอบจากผู้ตอบทุกคน</li>
                          <li>• <strong>Std. Dev.:</strong> ค่าเบี่ยงเบน — ยิ่งสูง = ผู้ตอบมีความเห็นแตกต่างกันมาก</li>
                          <li>• ใช้ตรวจสอบว่าตลาดมี segment ที่ชอบต่างกันหรือไม่</li>
                        </>
                      )}
                      {statisticalData.method === 'hierarchical_bayes' && (
                        <>
                          <li>• <strong>Utility:</strong> ค่าเฉลี่ยสัมประสิทธิ์ Logit ระดับประชากร (Population Mean β) รอบระดับอ้างอิง = 0</li>
                          <li>• <strong>Population Std.:</strong> ค่าเบี่ยงเบนระดับประชากร — สะท้อนความหลากหลายของผู้บริโภค</li>
                          <li>• ประมาณค่าแบบ Empirical Bayes Posterior Shrinkage ต่อเนื่องจาก Panel Mixed Logit</li>
                        </>
                      )}
                      {statisticalData.method === 'linear_regression' && (
                        <>
                          <li>• <strong>Coefficient (β):</strong> ค่าสัมประสิทธิ์ OLS — บวก = เพิ่มโอกาสถูกเลือก, ลบ = ลดโอกาส</li>
                          <li>• <strong>Reference Level:</strong> ระดับอ้างอิง (β=0) ใช้เปรียบเทียบกับระดับอื่น</li>
                          <li>• <strong>R²:</strong> อธิบายความแปรปรวนได้ {((statisticalData.results?.r_squared || 0) * 100).toFixed(1)}%
                            ({(statisticalData.results?.r_squared || 0) > 0.3 ? 'Good' : 'Moderate'})</li>
                        </>
                      )}
                    </ul>
                  </div>

                  {/* Model Equation — only for OLS & MNL */}
                  {(statisticalData.method === 'linear_regression' || statisticalData.method === 'mnl') && (
                    <div className="mt-4 p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
                      <p className="text-sm font-bold text-gray-900 mb-2">
                        {statisticalData.method === 'mnl' ? 'Logit Model (V = \u03A3 \u03B2\u2099X\u2099):' : 'OLS Regression Model:'}
                      </p>
                      <div className="font-mono text-xs bg-white p-3 rounded border border-purple-300 overflow-x-auto">
                        {statisticalData.method === 'linear_regression' && (
                          <p>P(Choice) = {(statisticalData.results?.intercept || 0).toFixed(4)}</p>
                        )}
                        {statisticalData.method === 'mnl' && (
                          <p>V(alternative) =</p>
                        )}
                        {Object.entries(statisticalData.results?.part_worths || {}).map(([attrId, attrData]) => {
                          return Object.values(attrData.levels || {})
                            .filter(level => (level.utility ?? level.coefficient ?? 0) !== 0)
                            .map((level, idx) => {
                              const val = level.utility ?? level.coefficient ?? 0;
                              return (
                                <p key={`eq-${attrId}-${idx}`}>
                                  &nbsp;&nbsp;&nbsp;&nbsp;{val > 0 ? '+' : ''}{val.toFixed(4)} × [{attrData.name}_{level.value}]
                                </p>
                              );
                            });
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>

            {/* Statistical Summary */}
            <Card className="p-6 mb-8" data-testid="research-statistics-card">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">สถิติการวิจัย</h2>
                  <p className="text-sm text-gray-600">
                    ข้อมูลสถิติพื้นฐานของการศึกษา
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200">
                  <p className="text-sm text-gray-600 mb-1">จำนวนผู้ตอบแบบสอบถาม</p>
                  <p className="text-3xl font-black text-blue-600">{currentResults?.respondent_count || results?.respondent_count || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">respondents</p>
                </div>

                <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
                  <p className="text-sm text-gray-600 mb-1">จำนวนคุณลักษณะ</p>
                  <p className="text-3xl font-black text-green-600">{sortedImportance.length}</p>
                  <p className="text-xs text-gray-500 mt-1">attributes</p>
                </div>

                <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
                  <p className="text-sm text-gray-600 mb-1">จำนวนระดับทั้งหมด</p>
                  <p className="text-3xl font-black text-purple-600">
                    {sortedImportance.reduce((sum, f) => {
                      return sum + Object.keys(currentResults?.part_worths?.[f.id]?.levels || {}).length;
                    }, 0)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">levels</p>
                </div>

                <div className="p-4 bg-gradient-to-br from-orange-50 to-yellow-50 rounded-lg border-2 border-orange-200">
                  <p className="text-sm text-gray-600 mb-1">วิธีการวิเคราะห์</p>
                  <p className="text-lg font-bold text-orange-600">Choice-Based</p>
                  <p className="text-xs text-gray-500 mt-1">Conjoint Analysis</p>
                </div>
              </div>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                <h3 className="font-bold text-gray-900 mb-3">📚 ระเบียบวิธีทางสถิติที่กำลังแสดง ({getMethodName(selectedMethod)})</h3>
                <ul className="text-sm text-gray-700 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600">•</span>
                    <span>
                      <strong>แบบจำลองหลัก:</strong>{' '}
                      {selectedMethod === 'mnl' && 'Conditional / Multinomial Logit (MLE) — มาตรฐานสากลสำหรับ Choice-Based Conjoint (McFadden 1974)'}
                      {selectedMethod === 'mixed_logit' && 'Panel Mixed Logit (SMLE with Halton draws) — อนุญาตให้ความชอบแตกต่างกันในแต่ละผู้ตอบ'}
                      {selectedMethod === 'hierarchical_bayes' && 'Empirical Bayes Individual Posteriors — ต่อเนื่องจาก Panel Mixed Logit เพื่อหาค่าความชอบรายบุคคล'}
                      {selectedMethod === 'linear_regression' && 'OLS Linear Probability Regression — ใช้เป็น baseline เชิงพรรณนา'}
                      {selectedMethod === 'counting' && 'Counting-based approach — นับความถี่ที่แต่ละระดับถูกเลือก'}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600">•</span>
                    <span><strong>การเข้ารหัสระดับ (Coding):</strong> {selectedMethod === 'counting' ? 'เทียบสัดส่วนการเลือกกับโอกาสเฉลี่ยต่อตัวเลือก' : 'Dummy Coding โดยให้ 1 ระดับเป็นฐานอ้างอิง (Reference Level, β = 0)'}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600">•</span>
                    <span><strong>Relative importance:</strong> คำนวณจากพิสัย (max − min) ของค่า Part-Worth Utility ในแต่ละปัจจัย แล้วปรับสัดส่วนรวมเป็น 100%</span>
                  </li>
                </ul>
              </div>
            </Card>

            {/* Raw Data Export Info */}
            <Card className="p-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200">
              <div className="flex items-start gap-3">
                <Download className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">📥 ดาวน์โหลดข้อมูลดิบ (Raw Data Export)</h3>
                  {isOwnerOrAdmin ? (
                    <>
                      <p className="text-sm text-gray-700 mb-3">
                        เลือกโหลดไฟล์ CSV แบบ Wide (สรุป 1 แถว/คน) หรือ Long-Format Choice Matrix (1 แถว/ทางเลือก/ข้อ พร้อมใช้งานใน R, Stata, SPSS, Python)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={handleExportLongCSV}
                          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold"
                          data-testid="conjoint-export-long-csv"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          ดาวน์โหลด Long-Format CSV (งานวิจัย R / SPSS / Stata)
                        </Button>
                        <Button
                          onClick={handleExportCSV}
                          variant="outline"
                          className="border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                          data-testid="conjoint-export-wide-csv"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          ดาวน์โหลด Wide CSV
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Long-Format ประกอบด้วย: respondent_id, choice_set_id, profile_id, chosen (1/0), ชื่อคุณลักษณะทุกคอลัมน์ และข้อมูลประชากร
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-600">
                      เฉพาะเจ้าของโครงการหรือผู้ดูแลระบบเท่านั้นที่สามารถดาวน์โหลดข้อมูลรายบุคคล (Raw Responses) ได้ เพื่อคุ้มครองความเป็นส่วนตัวของผู้ตอบ
                    </p>
                  )}
                </div>
              </div>
            </Card>

            {/* Individual-level posteriors — only shows when HB is the
                active method, surfacing the heterogeneity insights that
                only Hierarchical Bayes can deliver. */}
            {selectedMethod === 'hierarchical_bayes' && statisticalData?.results?.individual_quantiles && (
              <HBIndividualInsights hbResult={statisticalData.results} study={study}/>
            )}
          </>
        )}

        {/* Compare Methods Tab */}
        {activeTab === 'compare' && (
          <ConjointCompareMethods
            studyId={studyId}
            study={study}
            token={token}
            countingResults={results}
            filter={filter}
          />
        )}


        {/* Advanced Analytics Tab */}
        {activeTab === 'advanced' && (
          <>
            {/* Technique Selector */}
            <Card className="p-4 sm:p-6 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-300 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="w-6 h-6 text-purple-600" />
                <h2 className="text-xl font-black text-gray-900">เลือกเทคนิคการวิเคราะห์ขั้นสูง</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => setAdvancedTechnique('nca')}
                  data-testid="conjoint-adv-tab-nca"
                  className={`p-4 rounded-lg border-2 transition-all ${
                    advancedTechnique === 'nca'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 border-purple-600 text-white shadow-lg'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400'
                  }`}
                >
                  <div className="text-left">
                    <div className="font-bold text-lg mb-1">NCA</div>
                    <div className={`text-sm ${advancedTechnique === 'nca' ? 'text-white' : 'text-gray-600'}`}>
                      Necessary Condition Analysis
                    </div>
                    <div className={`text-xs mt-2 ${advancedTechnique === 'nca' ? 'text-purple-100' : 'text-gray-500'}`}>
                      วิเคราะห์เงื่อนไขที่จำเป็น
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setAdvancedTechnique('fsqca')}
                  data-testid="conjoint-adv-tab-fsqca"
                  className={`p-4 rounded-lg border-2 transition-all ${
                    advancedTechnique === 'fsqca'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 border-purple-600 text-white shadow-lg'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400'
                  }`}
                >
                  <div className="text-left">
                    <div className="font-bold text-lg mb-1">fsQCA</div>
                    <div className={`text-sm ${advancedTechnique === 'fsqca' ? 'text-white' : 'text-gray-600'}`}>
                      Fuzzy-Set QCA
                    </div>
                    <div className={`text-xs mt-2 ${advancedTechnique === 'fsqca' ? 'text-purple-100' : 'text-gray-500'}`}>
                      วิเคราะห์ชุดเงื่อนไขร่วม (Sufficiency)
                    </div>
                  </div>
                </button>
              </div>
            </Card>

            {hasActiveFilter && (
              <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-xs text-purple-900">
                🔍 กำลังวิเคราะห์ขั้นสูง (NCA / fsQCA) เฉพาะกลุ่มที่กรองอยู่ (N={results?.respondent_count || 0}) — เปลี่ยนตัวกรองด้านบนได้ตลอดเวลา
              </div>
            )}

            {/* NCA Analysis */}
            {advancedTechnique === 'nca' && (
              <>
                {/* NCA Header */}
                <Card className="p-6 bg-gradient-to-r from-purple-100 to-pink-100 border-2 border-purple-300 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-purple-600 rounded-xl">
                      <BarChart3 className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl font-black text-gray-900 mb-2">
                        Necessary Condition Analysis (NCA)
                      </h2>
                      <p className="text-gray-700 text-sm sm:text-base">
                        วิเคราะห์เงื่อนไขที่จำเป็น (Necessary Conditions) สำหรับการบรรลุผลลัพธ์ที่ต้องการ
                        โดยพิจารณาว่าคุณลักษณะใดเป็น "ข้อกำหนดขั้นต่ำ" ที่ผลิตภัณฑ์ต้องมี
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Run NCA Analysis Button */}
                {!ncaResults && (
                  <Card className="p-6 text-center border-2 border-purple-200 mb-6">
                    <div className="mb-4">
                      <Sparkles className="w-16 h-16 text-purple-600 mx-auto mb-3" />
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        พร้อมวิเคราะห์ NCA
                      </h3>
                      <p className="text-gray-600 mb-6">
                        คลิกปุ่มด้านล่างเพื่อเริ่มวิเคราะห์เงื่อนไขที่จำเป็นจากข้อมูล Conjoint ของคุณ
                      </p>
                    </div>
                    <Button
                      onClick={handleRunNCA}
                      disabled={loadingNCA}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold px-8 py-3"
                    >
                      {loadingNCA ? (
                        <span className="flex items-center gap-2">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          กำลังวิเคราะห์...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5" />
                          เริ่มวิเคราะห์ NCA
                        </span>
                      )}
                    </Button>
                  </Card>
                )}

                {/* NCA Results Display */}
                {ncaResults && ncaResults.attributes && (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <Card className="p-4 bg-gradient-to-br from-purple-50 to-white border-2 border-purple-200">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center">
                            <BarChart3 className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">วิเคราะห์แล้ว</p>
                            <p className="text-2xl font-black text-purple-600">
                              {Object.keys(ncaResults.attributes).length}
                            </p>
                            <p className="text-xs text-gray-500">คุณลักษณะ</p>
                          </div>
                        </div>
                      </Card>
                      
                      <Card className="p-4 bg-gradient-to-br from-pink-50 to-white border-2 border-pink-200">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-pink-600 rounded-full flex items-center justify-center">
                            <Users className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">ข้อมูลจาก</p>
                            <p className="text-2xl font-black text-pink-600">
                              {ncaResults.respondent_count}
                            </p>
                            <p className="text-xs text-gray-500">ผู้ตอบ</p>
                          </div>
                        </div>
                      </Card>
                      
                      <Card className="p-4 bg-gradient-to-br from-indigo-50 to-white border-2 border-indigo-200">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center">
                            <TrendingUp className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">วิธีการ</p>
                            <p className="text-sm font-bold text-indigo-600">CE-FDH</p>
                            <p className="text-xs text-gray-500">Method</p>
                          </div>
                        </div>
                      </Card>
                    </div>

                    {/* NCA Results Table */}
                    <Card className="p-6 border-2 border-purple-200 mb-6">
                      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Star className="w-5 h-5 text-purple-600" />
                        Effect Size และระดับความจำเป็น
                      </h3>
                      
                      <div className="space-y-4">
                        {Object.entries(ncaResults.attributes).map(([attrId, attr], idx) => {
                          const attribute = study?.attributes?.find(a => a.id === attrId);
                          const colorMap = {
                            red: {
                              card: 'from-red-50 to-pink-50 border-red-200',
                              badge: 'bg-red-600',
                              bar: 'from-red-500 to-red-600',
                            },
                            orange: {
                              card: 'from-orange-50 to-yellow-50 border-orange-200',
                              badge: 'bg-orange-600',
                              bar: 'from-orange-500 to-orange-600',
                            },
                            blue: {
                              card: 'from-blue-50 to-cyan-50 border-blue-200',
                              badge: 'bg-blue-600',
                              bar: 'from-blue-500 to-blue-600',
                            },
                            gray: {
                              card: 'from-gray-50 to-slate-50 border-gray-200',
                              badge: 'bg-gray-600',
                              bar: 'from-gray-500 to-gray-600',
                            },
                          };
                          const palette = colorMap[attr.color] || colorMap.gray;

                          return (
                            <Card key={attrId} className={`p-4 bg-gradient-to-r ${palette.card} border-2`}>
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-lg font-bold text-gray-900">
                                      {idx + 1}. {attribute?.name || attrId}
                                    </span>
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${palette.badge} text-white`}>
                                      {attr.level}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-700 mb-2">{attr.interpretation}</p>
                                  {attr.recommendation && (
                                    <p className="text-xs text-gray-600 font-semibold bg-white px-2 py-1 rounded">
                                      {attr.recommendation}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right ml-4">
                                  <p className="text-xs text-gray-600">Effect Size</p>
                                  <p className="text-3xl font-black text-gray-900">
                                    {(attr.effect_size * 100).toFixed(1)}%
                                  </p>
                                </div>
                              </div>
                              
                              {/* Progress Bar */}
                              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                                <div
                                  className={`h-full bg-gradient-to-r ${palette.bar} transition-all duration-500`}
                                  style={{ width: `${attr.effect_size * 100}%` }}
                                />
                              </div>
                              
                              {/* Attribute Details */}
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="p-2 bg-white rounded border border-gray-200">
                                  <span className="text-gray-600">Importance:</span>
                                  <span className="ml-1 font-bold">{attr.attribute_importance.toFixed(1)}%</span>
                                </div>
                                <div className="p-2 bg-white rounded border border-gray-200">
                                  <span className="text-gray-600">Levels:</span>
                                  <span className="ml-1 font-bold">{attr.n_levels}</span>
                                </div>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </Card>

                    {/* Interpretation Guide */}
                    <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                        <div>
                          <h3 className="font-bold text-gray-900 mb-3">
                            📖 คำแนะนำการตีความผล NCA
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-3 bg-white rounded-lg border border-gray-200">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                                <span className="font-bold text-sm">ต่ำ (d &lt; 0.1)</span>
                              </div>
                              <p className="text-xs text-gray-600">
                                ไม่ใช่เงื่อนไขที่จำเป็น อาจเป็นปัจจัยเสริมเท่านั้น
                              </p>
                            </div>
                            
                            <div className="p-3 bg-white rounded-lg border border-blue-300">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                <span className="font-bold text-sm">ปานกลาง (0.1 ≤ d &lt; 0.3)</span>
                              </div>
                              <p className="text-xs text-gray-600">
                                มีความจำเป็นระดับกลาง ควรพิจารณาเป็นปัจจัยสนับสนุน
                              </p>
                            </div>
                            
                            <div className="p-3 bg-white rounded-lg border border-orange-300">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                                <span className="font-bold text-sm">สูง (0.3 ≤ d &lt; 0.5)</span>
                              </div>
                              <p className="text-xs text-gray-600">
                                เป็นเงื่อนไขที่จำเป็น ผลิตภัณฑ์ควรมีคุณลักษณะนี้
                              </p>
                            </div>
                            
                            <div className="p-3 bg-white rounded-lg border border-red-300">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                <span className="font-bold text-sm">สูงมาก (d ≥ 0.5)</span>
                              </div>
                              <p className="text-xs text-gray-600">
                                ขาดไม่ได้! เป็นเงื่อนไขที่จำเป็นอย่างยิ่งสำหรับความสำเร็จ
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </>
                )}

                {/* NCA Explanation */}
                <Card className="p-6 bg-blue-50 border-2 border-blue-200 mt-6">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="font-bold text-gray-900 mb-2">
                        💡 เกี่ยวกับ NCA
                      </h3>
                      <p className="text-sm text-gray-700 mb-3">
                        NCA (Necessary Condition Analysis) เป็นเทคนิคที่ใช้ระบุว่าคุณลักษณะใดเป็น
                        "เงื่อนไขที่จำเป็น" สำหรับความสำเร็จของผลิตภัณฑ์
                      </p>
                      <ul className="text-sm text-gray-700 space-y-2">
                        <li className="flex items-start gap-2">
                          <span className="text-blue-600">•</span>
                          <span><strong>Ceiling Line:</strong> แสดงขีดจำกัดบนของความสัมพันธ์</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-600">•</span>
                          <span><strong>Effect Size (d):</strong> ขนาดของเงื่อนไขที่จำเป็น (0-1)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-blue-600">•</span>
                          <span><strong>Necessity:</strong> ระดับความจำเป็นของแต่ละคุณลักษณะ</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {/* fsQCA Analysis */}
            {advancedTechnique === 'fsqca' && (
              <>
                {/* fsQCA Header */}
                <Card className="p-6 bg-gradient-to-r from-indigo-100 to-purple-100 border-2 border-indigo-300 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-indigo-600 rounded-xl">
                      <Network className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl font-black text-gray-900 mb-2">
                        Fuzzy-Set Qualitative Comparative Analysis (fsQCA)
                      </h2>
                      <p className="text-gray-700 text-sm sm:text-base">
                        วิเคราะห์หาชุดคุณลักษณะ (configurations) ที่นำไปสู่ความสำเร็จ 
                        โดยใช้ fuzzy-set membership และ Boolean algebra
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Run fsQCA Button */}
                {!fsqcaResults && (
                  <Card className="p-6 text-center border-2 border-indigo-200 mb-6">
                    <div className="mb-4">
                      <Sparkles className="w-16 h-16 text-indigo-600 mx-auto mb-3" />
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        พร้อมวิเคราะห์ fsQCA
                      </h3>
                      <p className="text-gray-600 mb-6">
                        คลิกปุ่มด้านล่างเพื่อค้นหาชุดคุณลักษณะที่เพียงพอ (sufficient) สำหรับความสำเร็จ
                      </p>
                    </div>
                    <Button
                      onClick={handleRunFsQCA}
                      disabled={loadingFsQCA}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold px-8 py-3"
                    >
                      {loadingFsQCA ? (
                        <span className="flex items-center gap-2">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          กำลังวิเคราะห์...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5" />
                          เริ่มวิเคราะห์ fsQCA
                        </span>
                      )}
                    </Button>
                  </Card>
                )}

                {/* fsQCA Results */}
                {fsqcaResults && fsqcaResults.sufficient_configurations && (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <Card className="p-4 bg-gradient-to-br from-indigo-50 to-white border-2 border-indigo-200">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">พบ Configurations</p>
                            <p className="text-2xl font-black text-indigo-600">
                              {fsqcaResults.n_configurations}
                            </p>
                            <p className="text-xs text-gray-500">ชุดที่เพียงพอ</p>
                          </div>
                        </div>
                      </Card>
                      
                      <Card className="p-4 bg-gradient-to-br from-purple-50 to-white border-2 border-purple-200">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center">
                            <TrendingUp className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">Consistency</p>
                            <p className="text-2xl font-black text-purple-600">
                              {(fsqcaResults.solution_consistency * 100).toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-500">ความสอดคล้อง</p>
                          </div>
                        </div>
                      </Card>
                      
                      <Card className="p-4 bg-gradient-to-br from-pink-50 to-white border-2 border-pink-200">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-pink-600 rounded-full flex items-center justify-center">
                            <PieChartIcon className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-600">Coverage</p>
                            <p className="text-2xl font-black text-pink-600">
                              {(fsqcaResults.solution_coverage * 100).toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-500">ความครอบคลุม</p>
                          </div>
                        </div>
                      </Card>
                    </div>

                    {/* Sufficient Configurations */}
                    <Card className="p-6 border-2 border-indigo-200 mb-6">
                      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Star className="w-5 h-5 text-indigo-600" />
                        ชุดคุณลักษณะที่เพียงพอ (Sufficient Configurations)
                      </h3>
                      
                      <div className="space-y-4">
                        {fsqcaResults.sufficient_configurations.length === 0 ? (
                          <Card className="p-8 text-center bg-gray-50 border-2 border-gray-300">
                            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                            <p className="text-gray-700 font-semibold">
                              ไม่พบชุดคุณลักษณะที่เพียงพอ (sufficient configurations)
                            </p>
                            <p className="text-sm text-gray-600 mt-2">
                              ลองปรับเกณฑ์ consistency หรือ coverage threshold
                            </p>
                          </Card>
                        ) : (
                          fsqcaResults.sufficient_configurations.map((config, idx) => (
                            <Card key={idx} className="p-5 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200">
                              <div className="mb-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
                                    {idx + 1}
                                  </div>
                                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-600 text-white">
                                    {config.n_cases} กรณี
                                  </span>
                                </div>
                                
                                {/* Configuration Expression */}
                                <div className="mb-3 p-3 bg-white rounded-lg border border-indigo-300">
                                  <p className="text-xs text-gray-600 mb-1 font-semibold">สูตรคุณลักษณะ:</p>
                                  <p className="text-base font-mono font-bold text-indigo-900">
                                    {config.configuration}
                                  </p>
                                </div>
                                
                                {/* Human Interpretation */}
                                <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                                  <p className="text-xs text-gray-600 mb-1 font-semibold">💡 ความหมาย:</p>
                                  <p className="text-sm text-gray-900 font-semibold">
                                    {config.interpretation}
                                  </p>
                                  <p className="text-xs text-gray-600 mt-2">
                                    ชุดนี้เป็นเงื่อนไขที่เพียงพอสำหรับความสำเร็จของผลิตภัณฑ์
                                  </p>
                                </div>
                              </div>
                            
                              <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-white rounded-lg border border-indigo-200">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs text-gray-600 font-semibold">Consistency</p>
                                    <p className="text-xs text-gray-500">(ความสอดคล้อง)</p>
                                  </div>
                                  <p className="text-2xl font-bold text-indigo-600">
                                    {(config.consistency * 100).toFixed(1)}%
                                  </p>
                                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                                    <div
                                      className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all"
                                      style={{ width: `${config.consistency * 100}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-gray-600 mt-1">
                                    {config.consistency >= 0.85 ? '✅ สูงมาก' : 
                                     config.consistency >= 0.75 ? '✅ เพียงพอ' : 
                                     '⚠️ ต่ำ'}
                                  </p>
                                </div>
                                
                                <div className="p-3 bg-white rounded-lg border border-purple-200">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs text-gray-600 font-semibold">Coverage</p>
                                    <p className="text-xs text-gray-500">(ความครอบคลุม)</p>
                                  </div>
                                  <p className="text-2xl font-bold text-purple-600">
                                    {(config.coverage * 100).toFixed(1)}%
                                  </p>
                                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                                    <div
                                      className="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full transition-all"
                                      style={{ width: `${config.coverage * 100}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-gray-600 mt-1">
                                    {config.coverage >= 0.5 ? '📊 สูง' : 
                                     config.coverage >= 0.3 ? '📊 ปานกลาง' : 
                                     '📊 ต่ำ'}
                                  </p>
                                </div>
                              </div>
                            </Card>
                          ))
                        )}
                      </div>
                    </Card>

                    {/* Explanation Guide */}
                    <Card className="p-6 bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200">
                      <div className="flex items-start gap-3 mb-4">
                        <Lightbulb className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 mb-3 text-lg">
                            📖 คู่มือการอ่านผล fsQCA
                          </h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Left Column */}
                            <div className="space-y-3">
                              <div className="p-3 bg-white rounded-lg border border-blue-200">
                                <h4 className="font-bold text-sm text-blue-900 mb-2">🎯 Sufficient Configuration</h4>
                                <p className="text-xs text-gray-700">
                                  ชุดคุณลักษณะที่<strong>เพียงพอ</strong>ที่จะทำให้ผลิตภัณฑ์ประสบความสำเร็จ 
                                  ถ้ามีครบตามสูตร = มีโอกาสสูงที่จะสำเร็จ
                                </p>
                              </div>
                              
                              <div className="p-3 bg-white rounded-lg border border-indigo-200">
                                <h4 className="font-bold text-sm text-indigo-900 mb-2">📊 Consistency (ความสอดคล้อง)</h4>
                                <p className="text-xs text-gray-700 mb-2">
                                  วัดว่าชุดนี้นำไปสู่ผลลัพธ์บ่อยแค่ไหน
                                </p>
                                <ul className="text-xs text-gray-600 space-y-1">
                                  <li>• ≥0.85 = <strong>สูงมาก</strong> (เชื่อถือได้มาก)</li>
                                  <li>• ≥0.75 = <strong>เพียงพอ</strong> (ใช้ได้)</li>
                                  <li>• &lt;0.75 = <strong>ไม่เพียงพอ</strong></li>
                                </ul>
                              </div>
                            </div>
                            
                            {/* Right Column */}
                            <div className="space-y-3">
                              <div className="p-3 bg-white rounded-lg border border-purple-200">
                                <h4 className="font-bold text-sm text-purple-900 mb-2">📈 Coverage (ความครอบคลุม)</h4>
                                <p className="text-xs text-gray-700 mb-2">
                                  วัดว่าชุดนี้อธิบายความสำเร็จได้เท่าไหร่
                                </p>
                                <ul className="text-xs text-gray-600 space-y-1">
                                  <li>• สูง (≥0.5) = อธิบายได้เยอะ</li>
                                  <li>• ปานกลาง (0.3-0.5) = อธิบายได้บางส่วน</li>
                                  <li>• ต่ำ (&lt;0.3) = อธิบายได้น้อย</li>
                                </ul>
                              </div>
                              
                              <div className="p-3 bg-white rounded-lg border border-pink-200">
                                <h4 className="font-bold text-sm text-pink-900 mb-2">🔤 สัญลักษณ์</h4>
                                <ul className="text-xs text-gray-700 space-y-1">
                                  <li>• <code className="bg-gray-100 px-1 py-0.5 rounded">*</code> = AND (และ)</li>
                                  <li>• <code className="bg-gray-100 px-1 py-0.5 rounded">+</code> = OR (หรือ)</li>
                                  <li>• <code className="bg-gray-100 px-1 py-0.5 rounded">~</code> = NOT (ไม่มี/ขาด)</li>
                                </ul>
                                <p className="text-xs text-gray-600 mt-2">
                                  <strong>ตัวอย่าง:</strong> A*~B*C = มี A และ C แต่ไม่มี B
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
      
      {/* Share as Content Modal */}
      <ShareConjointModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        onShare={handleShareAsContent}
        conjointData={{
          study: study,
          respondent_count: results?.respondent_count || 0,
          current_results: currentResults,
          ai_interpretation: aiInterpretation
        }}
        loading={sharingContent}
      />
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-md w-full mx-4 bg-white">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              ⚠️ ยืนยันการย้ายไปถังขยะ
            </h3>
            <p className="text-gray-700 mb-6">
              คุณต้องการลบการศึกษา <strong>&quot;{study?.title || study?.name || 'นี้'}&quot;</strong> ({results?.respondent_count || 0} คำตอบ) ใช่หรือไม่?
              <br />
              <span className="text-sm text-gray-600 mt-1 inline-block">
                รายการจะถูกย้ายไปยังถังขยะและสามารถกู้คืนได้ภายใน 30 วัน ก่อนถูกลบถาวร
              </span>
            </p>
            <div className="flex gap-4">
              <Button
                onClick={handleDeleteStudy}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {deleting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    กำลังลบ...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    ยืนยันลบ
                  </span>
                )}
              </Button>
              <Button
                onClick={() => setShowDeleteConfirm(false)}
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

      <ExternalAiWorkflowModal
        open={externalAiInterpOpen}
        onClose={() => setExternalAiInterpOpen(false)}
        title="ตีความผล Conjoint Analysis ด้วย AI ภายนอก (ฟรี)"
        subtitle="คัดลอก Prompt ที่มีผลสถิติและ Part-worth Utilities จริงไปวางใน ChatGPT / Gemini / Claude แล้วนำบทวิเคราะห์กลับมาบันทึกในระบบ"
        fetchPrompt={fetchConjointInterpPrompt}
        validatePayload={validateConjointInterp}
        applyPayload={applyConjointInterp}
        renderPreview={(preview) => (
          <div className="space-y-1">
            <div><strong>ความยาวบทวิเคราะห์:</strong> {preview.char_count?.toLocaleString()} ตัวอักษร</div>
            <div className="text-gray-700 whitespace-pre-wrap">{preview.excerpt}</div>
          </div>
        )}
      />
    </div>
  );
};

export default ConjointResultsPage;
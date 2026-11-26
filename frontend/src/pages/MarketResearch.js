import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BookOpen, ExternalLink, FileText, GraduationCap, Briefcase, Info,
  ClipboardList, Map as MapIcon, BarChart3, Eye, TrendingUp, Layers, Scale,
  Target, Users, KanbanSquare, Newspaper, Sparkles,
} from 'lucide-react';
import Navigation from '@/components/Navigation';
import { useLlmPolicy } from '@/hooks/useLlmPolicy';

/**
 * /market-research — the research hub.
 *
 * Tools are grouped by the QUESTION a researcher is trying to answer, not by
 * the name of the method. Every card states what the tool is for, what you
 * need before you start, what you get out, whether a thesis-format (.docx)
 * export exists, and a status badge that matches reality:
 *
 *   ready     the tool is routed and works end to end
 *   partial   part of the tool is live (the card says which part)
 *   trial     works but is an external / experimental app
 *   planned   no page exists yet — the card is not clickable
 *
 * Facts on each card come from the code (routes in App.js, thresholds in
 * backend/routes/*.py). Time figures are rough planning guidance, labelled so.
 *
 * `aiKeys`  = feature keys (memory/LLM_EXTERNAL_CONTRACT.md) of the tool's AI actions.
 * `aiPath`  = 'external' when the tool's main AI actions have a copy-prompt / paste-answer path
 *             (so it still works when the admin switches the system LLM off — see
 *             memory/LLM_EXTERNAL_CONTRACT.md; `aiNote` names the exceptions, e.g. images);
 *             'system' when the AI actions need the system LLM; undefined = no AI.
 */

const STATUS = {
  ready:   { label: 'พร้อมใช้งาน',        cls: 'bg-[#0E5538]/10 text-[#0E5538] border-[#0E5538]/30' },
  partial: { label: 'ใช้ได้บางส่วน',       cls: 'bg-amber-100 text-amber-900 border-amber-400' },
  trial:   { label: 'ทดลอง · แอปภายนอก',   cls: 'bg-amber-100 text-amber-900 border-amber-400' },
  planned: { label: 'ยังไม่เปิดให้ใช้',      cls: 'bg-[#E5E0D8] text-[#3B3D43] border-[#A6A8AF]' },
};

const GROUPS = [
  {
    id: 'value',
    question: 'ลูกค้าให้คุณค่ากับอะไร · ยอมแลกอะไรกับอะไร',
    hint: 'ก่อนออกแบบสินค้า บริการ หรือตั้งราคา',
    tools: [
      {
        id: 'conjoint-analysis',
        icon: TrendingUp,
        tag: 'Choice-Based Conjoint',
        title: 'Conjoint Analysis',
        answers: 'คุณสมบัติและราคาแบบไหนที่ลูกค้าเลือก — และยอมจ่ายเพิ่มเท่าไรเพื่ออะไร',
        needs: 'ผู้ตอบ ≥ 30 คน (วิเคราะห์เต็มรูปแบบ) · ขั้นต่ำ 10 คนสำหรับ AI ตีความและส่งออกวิทยานิพนธ์',
        time: 'ตั้งค่า 1–2 ชม. + เวลาเก็บข้อมูลตามการกระจายลิงก์',
        gives: 'Part-worth utilities, ความสำคัญของแต่ละ attribute, Market Simulator, วิเคราะห์ Hierarchical Bayes, รายงานผล',
        thesis: 'เอกสารบท 3–4 แบบไม่ใช้ AI (.docx) เจ้าของ study ส่งออกได้เลย · ส่วนที่ใช้ AI (บท 3–5 ด้วย AI ของระบบหรือชุด prompt) ต้องขอสิทธิ์ "ส่งออกวิทยานิพนธ์" จากผู้ดูแลระบบก่อน',
        thesisYes: true,
        needsRespondents: true,
        aiKeys: ['conjoint.interpretation', 'conjoint.qualitative', 'conjoint.thesis', 'conjoint.images'],
        aiPath: 'external',
        status: 'ready',
        path: '/market-research/conjoint-analysis',
        cta: 'เริ่มศึกษา Conjoint',
      },
      {
        id: 'customer-value',
        icon: Scale,
        tag: 'Customer Value = Benefit − Cost',
        title: 'Customer Value Lab',
        answers: 'คุณค่าที่ลูกค้าได้รับจากแบรนด์เรา เทียบกับคู่แข่ง สูงหรือต่ำกว่า และควรเพิ่ม/ลดอะไร',
        needs: 'ไม่ต้องมีผู้ตอบ — ประเมินเองหรือทำเวิร์กช็อปในทีม (ผลคือการประเมินของผู้ใช้ ไม่ใช่ข้อมูลผู้บริโภคจริง)',
        time: 'ประมาณ 30–60 นาทีต่อการศึกษา',
        gives: 'คะแนน Net Value เทียบคู่แข่ง, Need→Want→Demand, 5-Step Process, ภาพจำลองสินค้า (AI)',
        thesis: 'ยังไม่มีส่งออกวิทยานิพนธ์',
        thesisYes: false,
        needsRespondents: false,
        aiKeys: ['cv.ai', 'cv.image'],
        aiPath: 'external',
        aiNote: 'ภาพจำลอง: ถ้า AI ของระบบปิด จะได้พรอมต์ไปใช้กับเครื่องมือสร้างภาพของคุณเอง (ไม่มีการนำภาพกลับเข้าระบบ)',
        status: 'ready',
        path: '/market-research/customer-value',
        cta: 'เปิด Customer Value Lab',
      },
    ],
  },
  {
    id: 'brand',
    question: 'แบรนด์สุขภาพดีไหม · ภาพในใจลูกค้าเป็นอย่างไร',
    hint: 'วัดแบรนด์ด้วยตัวเลข หรือเข้าใจทัศนคติเชิงลึก',
    tools: [
      {
        id: 'brand-equity',
        icon: BarChart3,
        tag: 'Brand Equity · Aaker',
        title: 'Brand Health Check',
        answers: 'แบรนด์แข็งแรงแค่ไหนใน 4 มิติ: Awareness · Perceived Quality · Identity · Loyalty (เทียบหลายรอบได้)',
        needs: 'ผู้ตอบ ≥ 30 คนจึงสรุปผลได้ · ≥ 10 คนเพื่อเผยแพร่ใน Showcase และส่งออกบท 3–5',
        time: 'ตั้งค่า ~1 ชม. (AI ช่วยร่างคำถามได้) + เวลาเก็บข้อมูล',
        gives: 'คะแนน 4 มิติ + dashboard, เปรียบเทียบกลุ่ม/รอบ, AI insights, ส่งออกข้อมูลดิบ, หน้าเผยแพร่สาธารณะ',
        thesis: 'เอกสารผลวิเคราะห์แบบไม่ใช้ AI (.docx) เจ้าของ study ส่งออกได้เลย · บท 3–5 ที่เขียนด้วย AI ต้องขอสิทธิ์ "ส่งออกวิทยานิพนธ์" จากผู้ดูแลระบบก่อน',
        thesisYes: true,
        needsRespondents: true,
        aiKeys: ['be.ai_analyze', 'be.questions', 'be.thesis', 'be.visual_identity'],
        aiPath: 'external',
        status: 'ready',
        path: '/brand-equity',
        cta: 'เริ่มวัดสุขภาพแบรนด์',
      },
      {
        id: 'customer-perception',
        icon: Eye,
        tag: 'Perception · เชิงคุณภาพ',
        title: 'Customer Perception',
        answers: 'ลูกค้ารับรู้และรู้สึกอย่างไรกับแบรนด์/สินค้า — จากบทสัมภาษณ์',
        needs: 'ข้อความสัมภาษณ์ที่ถอดความแล้ว (วางลงในช่องได้เลย) · Phase 2 เชิงปริมาณยังไม่เปิด',
        time: 'ไม่กี่นาทีต่อรอบการวิเคราะห์',
        gives: 'คำถามสัมภาษณ์, สรุปธีมและข้อค้นพบ, ข้อเสนอแนะ, ภาพประกอบ, บันทึกเป็นเนื้อหา',
        thesis: 'ไม่มีส่งออกวิทยานิพนธ์ (บันทึกเป็นเนื้อหาในระบบเท่านั้น)',
        thesisYes: false,
        needsRespondents: false,
        aiKeys: ['perception.ai', 'perception.image'],
        aiPath: 'external',
        aiNote: 'ภาพประกอบต้องใช้ AI ของระบบ',
        status: 'partial',
        partialNote: 'Phase 1 (เชิงคุณภาพ) ใช้ได้ · Phase 2 (เชิงปริมาณ) ยังไม่เปิด',
        path: '/market-research/customer-perception',
        cta: 'เปิด Perception (Phase 1)',
      },
    ],
  },
  {
    id: 'journey',
    question: 'ลูกค้าตัดสินใจและใช้บริการอย่างไร · หลุดที่จุดไหน',
    hint: 'ตั้งแต่รู้จักจนถึงหลังซื้อ',
    tools: [
      {
        id: 'customer-journey',
        icon: MapIcon,
        tag: 'Journey · เชิงปริมาณ + เชิงคุณภาพ',
        title: 'Customer Journey',
        answers: 'ลูกค้าผ่านขั้นตอนไหน ติดขัดตรงไหน (pain point) และควรแก้จุดใดก่อน',
        needs: 'เชิงปริมาณ: กำหนด ≥ 3 ขั้นตอน และควรมีผู้ตอบ ≥ 30 คน · เชิงคุณภาพ: วางข้อมูลวิจัยเป็นข้อความ',
        time: 'ตั้งค่า ~1 ชม. + เวลาเก็บข้อมูล (เชิงคุณภาพใช้เวลาไม่กี่นาที)',
        gives: 'แผนผังเส้นทางพร้อมจำนวนคนที่หลุดแต่ละขั้น, จัดลำดับ pain point, codebook ถอดรหัสคำตอบเปิด, แผนที่เส้นทางจาก AI (เชิงคุณภาพ)',
        thesis: 'ยังไม่มีส่งออกวิทยานิพนธ์ (ดูผลบนหน้า dashboard)',
        thesisYes: false,
        needsRespondents: true,
        aiKeys: ['journey.ai'],
        aiPath: 'external',
        aiNote: 'ส่วนเชิงปริมาณไม่ใช้ AI',
        status: 'ready',
        path: '/market-research/customer-journey',
        cta: 'เปิด Customer Journey',
      },
      {
        id: 'customer-behavior',
        icon: Layers,
        tag: 'Behavior · เชิงคุณภาพ',
        title: 'Customer Behavior',
        answers: 'ลูกค้ามีรูปแบบพฤติกรรม แรงจูงใจ และอุปสรรคแบบไหน — จากข้อมูลวิจัยที่คุณมีอยู่แล้ว',
        needs: 'ข้อมูลวิจัยเป็นข้อความ (บันทึกภาคสนาม บทสัมภาษณ์ รีวิว) วางลงในช่อง',
        time: 'ไม่กี่นาทีต่อรอบการวิเคราะห์',
        gives: 'บทวิเคราะห์พฤติกรรม, ข้อค้นพบ 3–5 ข้อ, ข้อเสนอแนะ, ภาพประกอบ, บันทึกเป็นเนื้อหา',
        thesis: 'ไม่มีส่งออกวิทยานิพนธ์',
        thesisYes: false,
        needsRespondents: false,
        aiKeys: ['behavior.ai', 'behavior.image'],
        aiPath: 'external',
        aiNote: 'ภาพประกอบต้องใช้ AI ของระบบ',
        status: 'ready',
        path: '/market-research/customer-behavior',
        cta: 'เปิด Customer Behavior',
      },
    ],
  },
  {
    id: 'collect',
    question: 'อยากเก็บข้อมูลเองด้วยแบบสอบถาม',
    hint: 'เมื่อไม่มีเครื่องมือเฉพาะทางที่ตรงกับโจทย์',
    tools: [
      {
        id: 'survey-builder',
        icon: ClipboardList,
        tag: 'Survey',
        title: 'Survey Builder',
        answers: 'สร้างแบบสอบถามทั่วไป ส่งลิงก์ให้ผู้ตอบ และดูคำตอบ',
        needs: 'ไม่มีขั้นต่ำ — กำหนดเองตามแผนการวิจัย',
        time: 'ประมาณ 10–30 นาทีต่อชุด (เริ่มจากเทมเพลตหรือให้ AI ร่างได้)',
        gives: 'ลิงก์แบบสอบถาม (ตอบแบบไม่ระบุตัวตนได้), หลายชนิดคำถาม, ดูคำตอบ, ส่งออก CSV',
        thesis: 'ส่งออก CSV เพื่อวิเคราะห์ต่อ (ไม่มีรายงานวิทยานิพนธ์อัตโนมัติ)',
        thesisYes: false,
        needsRespondents: true,
        aiKeys: ['survey.ai'],
        aiPath: 'external',
        status: 'ready',
        path: '/surveys',
        cta: 'เปิด Survey Builder',
      },
    ],
  },
  {
    id: 'publish',
    question: 'เขียนและเผยแพร่งานวิชาการ',
    hint: 'หลังได้ผลวิจัยแล้ว',
    tools: [
      {
        id: 'journal-finder',
        icon: BookOpen,
        tag: 'Academic',
        title: 'Journal Finder',
        answers: 'ควรส่งงานไปตีพิมพ์วารสารไหน',
        needs: 'หัวข้อวิจัยและ Abstract (โหมด AI) หรือชื่อ/เกณฑ์วารสาร (โหมดเรียกดูฐานข้อมูล)',
        time: 'ไม่กี่นาที',
        gives: 'รายชื่อวารสารพร้อม quartile และสถานะ Scopus/ISI/ABDC/AJG — ควรตรวจกับแหล่งทางการของวารสารก่อนส่งงานทุกครั้ง',
        thesis: 'ไม่เกี่ยวกับการส่งออกวิทยานิพนธ์',
        thesisYes: false,
        needsRespondents: false,
        aiKeys: ['docs.journal_finder'],
        aiPath: 'system',
        aiNote: 'โหมดเรียกดูฐานข้อมูลใช้ได้เสมอ ไม่ต้องใช้ AI',
        status: 'ready',
        path: '/market-research/journal-finder',
        cta: 'เปิด Journal Finder',
      },
      {
        id: 'academic-format-editor',
        icon: FileText,
        tag: 'Academic',
        title: 'Academic Format Editor',
        answers: 'จัดรูปแบบบทความตามรูปแบบอ้างอิงและ Author Guidelines ของวารสาร',
        needs: 'ไฟล์ .docx ของบทความ',
        time: 'ขึ้นกับความยาวบทความ',
        gives: 'ตอนนี้เปิดเป็นแอปทดลองบน Google AI Studio (นอกแพลตฟอร์มนี้ — ข้อมูลที่ใส่ไปอยู่ที่บริการนั้น) · เวอร์ชันในระบบยังไม่เปิด (หน้า /market-research/academic-format-editor แสดง Coming Soon)',
        thesis: 'ไม่เกี่ยวกับการส่งออกวิทยานิพนธ์',
        thesisYes: false,
        needsRespondents: false,
        status: 'trial',
        external: 'https://ai.studio/apps/drive/1VWUh_KqffdKZObgFBgmHCQv_To1din-l?fullscreenApplet=true',
        cta: 'เปิดแอปทดลอง (แท็บใหม่)',
      },
    ],
  },
  {
    id: 'manage',
    question: 'จัดการทีมและโครงการวิจัย',
    hint: 'วางแผนงาน ติดตามความคืบหน้า',
    tools: [
      {
        id: 'projects',
        icon: KanbanSquare,
        tag: 'Workflow',
        title: 'Kanban Projects',
        answers: 'งานวิจัยของทีมไปถึงไหนแล้ว ใครทำอะไร',
        needs: 'ไม่ต้องมีข้อมูลวิจัย',
        time: 'ตั้งบอร์ดได้ทันที',
        gives: 'บอร์ดงานแบบ Kanban สำหรับโครงการวิจัย',
        thesis: 'ไม่เกี่ยวกับการส่งออกวิทยานิพนธ์',
        thesisYes: false,
        needsRespondents: false,
        status: 'ready',
        path: '/projects',
        cta: 'เปิด Kanban',
      },
    ],
  },
  {
    id: 'planned',
    question: 'อยู่ในแผน — ยังไม่เปิดให้ใช้',
    hint: 'ยังไม่มีหน้าใช้งาน จึงยังกดเข้าไม่ได้',
    tools: [
      {
        id: 'segmentation',
        icon: Users,
        tag: 'STP',
        title: 'Market Segmentation',
        answers: 'แบ่งกลุ่มลูกค้าและเลือกกลุ่มเป้าหมาย',
        needs: '—',
        time: '—',
        gives: 'ระหว่างนี้ใช้ Survey Builder เก็บข้อมูลแล้ววิเคราะห์กลุ่มเองด้วยโปรแกรมสถิติ',
        thesis: '—',
        thesisYes: false,
        needsRespondents: false,
        status: 'planned',
      },
      {
        id: 'competitor-analysis',
        icon: Target,
        tag: 'Competitive',
        title: 'Competitor Analysis',
        answers: 'คู่แข่งอยู่ตรงไหนเมื่อเทียบกับเรา',
        needs: '—',
        time: '—',
        gives: 'ระหว่างนี้ใช้ Customer Value Lab (เทียบคู่แข่งได้) หรือ Brand Health Check (เทียบหลายแบรนด์ได้)',
        thesis: '—',
        thesisYes: false,
        needsRespondents: false,
        status: 'planned',
      },
    ],
  },
];

const ALL_TOOLS = GROUPS.flatMap((g) => g.tools);

const ROLES = {
  practitioner: {
    label: 'นักการตลาด / เจ้าของธุรกิจ',
    icon: Briefcase,
    intro: 'เริ่มจากคำถามทางธุรกิจ แล้วเลือกเครื่องมือที่ตอบคำถามนั้น',
    steps: [
      { t: 'เลือกคำถามที่อยากรู้', d: 'ดูหัวข้อด้านล่าง เช่น "ลูกค้าให้คุณค่ากับอะไร" → Conjoint หรือ "แบรนด์สุขภาพดีไหม" → Brand Health Check', to: '#groups', hash: true },
      { t: 'เก็บข้อมูลจากลูกค้าจริง', d: 'Conjoint, Brand Health Check และ Customer Journey ให้ลิงก์แบบสอบถามส่งต่อได้เลย ผู้ตอบไม่ต้องสมัครสมาชิก', to: '/market-research/conjoint-analysis' },
      { t: 'อ่านผลและนำไปตัดสินใจ', d: 'ดู dashboard ผลการศึกษาของคุณได้ที่ Dashboard — Brand Health Check เผยแพร่เป็นหน้า Showcase สาธารณะได้', to: '/dashboard' },
    ],
  },
  student: {
    label: 'นิสิต / นักวิจัยที่ทำวิทยานิพนธ์',
    icon: GraduationCap,
    intro: 'เลือกวิธีให้ตรงสมมติฐาน เก็บข้อมูลให้ถึงขนาดตัวอย่าง แล้วส่งออกเป็นบทตามรูปแบบวิทยานิพนธ์',
    steps: [
      { t: 'เลือกวิธีให้ตรงกับสมมติฐาน', d: 'ความชอบ/การแลกเปลี่ยน (trade-off) → Conjoint · สุขภาพแบรนด์ 4 มิติ → Brand Health Check · อ่านวิธีวิจัยเพิ่มได้ที่คลังความรู้', to: '/learn' },
      { t: 'เก็บข้อมูลให้ถึงเกณฑ์', d: 'ผู้ตอบ ≥ 30 คนสำหรับ Conjoint และ Brand Health Check (ขั้นต่ำ 10 คนเพื่อส่งออกบท 3–5)', to: '#groups', hash: true },
      { t: 'ส่งออกบท 3–5 เป็น .docx', d: 'มีเฉพาะ Conjoint และ Brand Health Check · เอกสารแบบไม่ใช้ AI เจ้าของ study ส่งออกได้เลย · ส่วนที่ใช้ AI ต้องขอสิทธิ์ "ส่งออกวิทยานิพนธ์" จากผู้ดูแลระบบ (เปิดให้เป็นรายบุคคล) · เครื่องมืออื่นส่งออกข้อมูลดิบหรือ CSV', to: '/brand-equity' },
      { t: 'เลือกวารสารเผยแพร่', d: 'ใช้ Journal Finder ช่วยเลือก แล้วตรวจสถานะวารสารกับแหล่งทางการอีกครั้ง', to: '/market-research/journal-finder' },
    ],
  },
};

const FILTERS = [
  { id: 'all', label: 'ทั้งหมด', test: () => true },
  { id: 'thesis', label: 'ส่งออกวิทยานิพนธ์ได้', test: (t) => t.thesisYes },
  { id: 'norespondent', label: 'ไม่ต้องมีผู้ตอบแบบสอบถาม', test: (t) => !t.needsRespondents && t.status !== 'planned' },
];

const Chip = ({ children, className = '' }) => (
  <span className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>
);

const Row = ({ label, children }) => (
  <div className="grid grid-cols-[88px_1fr] gap-x-3 text-sm leading-relaxed sm:grid-cols-[104px_1fr]">
    <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#5C5F66] pt-0.5">{label}</dt>
    <dd className="text-[#2B2B2B]">{children}</dd>
  </div>
);

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A0A0A]';

const ToolCard = ({ tool, aiLabel }) => {
  const st = STATUS[tool.status];
  const Icon = tool.icon;
  const disabled = tool.status === 'planned';
  const ctaClass = `mt-auto inline-flex min-h-[44px] w-full items-center justify-between gap-2 border px-4 py-2.5 text-sm font-bold transition-colors ${focusRing}`;

  let cta = null;
  if (!disabled) {
    if (tool.external) {
      cta = (
        <a href={tool.external} target="_blank" rel="noopener noreferrer"
           className={`${ctaClass} border-[#0A0A0A] bg-white text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#F4F0EA]`}
           data-testid={`mr-open-${tool.id}`}>
          <span>{tool.cta}</span><ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      );
    } else {
      cta = (
        <Link to={tool.path}
              className={`${ctaClass} border-[#0A0A0A] bg-[#0A0A0A] text-[#F4F0EA] hover:bg-white hover:text-[#0A0A0A]`}
              data-testid={`mr-open-${tool.id}`}>
          <span>{tool.cta}</span><ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      );
    }
  } else {
    cta = (
      <div className="mt-auto border border-dashed border-[#A6A8AF] px-4 py-2.5 text-sm font-semibold text-[#3B3D43]" aria-disabled="true">
        ยังไม่เปิดให้ใช้
      </div>
    );
  }

  return (
    <article className={`flex flex-col gap-4 border border-black/15 p-5 sm:p-6 ${disabled ? 'bg-[#EFEAE0]' : 'bg-white'}`}
             data-testid={`mr-card-${tool.id}`} data-status={tool.status}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 inline-flex h-10 w-10 flex-none items-center justify-center border border-black/15 ${disabled ? 'bg-transparent text-[#3B3D43]' : 'bg-[#F4F0EA] text-[#0A0A0A]'}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#5C5F66]">{tool.tag}</p>
            <h3 className="font-['IBM_Plex_Serif',serif] text-xl font-medium leading-tight text-[#0A0A0A] sm:text-2xl">{tool.title}</h3>
          </div>
        </div>
        <Chip className={`flex-none ${st.cls}`} >{st.label}</Chip>
      </header>

      <p className="text-[15px] leading-relaxed text-[#2B2B2B]">
        <span className="font-semibold text-[#0A0A0A]">ตอบคำถามว่า: </span>{tool.answers}
      </p>

      {tool.partialNote && (
        <p className="flex items-start gap-2 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <Info className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />{tool.partialNote}
        </p>
      )}

      <dl className="space-y-2.5 border-t border-black/10 pt-4">
        <Row label="ต้องมี">{tool.needs}</Row>
        <Row label="เวลา">{tool.time}{tool.time !== '—' && <span className="text-[#5C5F66]"> (โดยประมาณ)</span>}</Row>
        <Row label="ได้อะไร">{tool.gives}</Row>
        <Row label="วิทยานิพนธ์">
          {tool.thesisYes
            ? <span className="font-semibold text-[#0E5538]">✓ {tool.thesis}</span>
            : <span>{tool.thesis}</span>}
        </Row>
        {aiLabel && <Row label="AI">{aiLabel}</Row>}
      </dl>

      {cta}
    </article>
  );
};

const MarketResearch = () => {
  const [role, setRole] = useState('practitioner');
  const [filter, setFilter] = useState('all');
  const { loading: policyLoading, policy, systemAllowed, hint } = useLlmPolicy();

  const roleCfg = ROLES[role];
  const activeFilter = FILTERS.find((f) => f.id === filter) || FILTERS[0];

  // One line per card about AI, derived from the live admin switch.
  const aiLabelFor = (tool) => {
    if (!tool.aiKeys) return null;
    if (policyLoading || !policy) return null;
    const anySystem = tool.aiKeys.some((k) => systemAllowed(k));
    if (tool.aiPath === 'external') {
      const note = tool.aiNote ? ` · ${tool.aiNote}` : '';
      return anySystem
        ? `ใช้ AI ของระบบ หรือคัดลอกพรอมต์ไปใช้กับ AI ของคุณเอง (ChatGPT / Claude / Gemini) ก็ได้${note}`
        : `AI ของระบบปิดอยู่ — ใช้ AI ของคุณเองผ่านพรอมต์ที่ระบบสร้างให้${note}`;
    }
    return anySystem
      ? `มีส่วนที่ใช้ AI ของระบบ${tool.aiNote ? ` · ${tool.aiNote}` : ''}`
      : `AI ของระบบปิดอยู่ — ส่วนที่ใช้ AI ใช้งานไม่ได้ในตอนนี้ (ส่วนอื่นยังใช้ได้)${tool.aiNote ? ` · ${tool.aiNote}` : ''}`;
  };

  const visibleGroups = useMemo(() => GROUPS
    .map((g) => ({ ...g, tools: g.tools.filter((t) => activeFilter.test(t)) }))
    .filter((g) => g.tools.length > 0), [activeFilter]);

  const readyCount = ALL_TOOLS.filter((t) => t.status === 'ready' || t.status === 'partial').length;

  return (
    <div className="min-h-screen bg-[#F4F0EA] font-['IBM_Plex_Sans_Thai',sans-serif] text-[#0A0A0A]" data-testid="market-research-hub">
      <Navigation active="tools" />

      <main id="main" className="mx-auto w-full max-w-[1280px] px-4 pb-20 pt-8 sm:px-8 md:pt-14">
        {/* ---------- Hero ---------- */}
        <section className="grid grid-cols-1 gap-8 border-b border-black/15 pb-10 md:grid-cols-12 md:pb-14">
          <div className="md:col-span-8">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#C8102E]">Research hub · เครื่องมือวิจัยตลาด</p>
            <h1 className="mt-3 font-['IBM_Plex_Serif',serif] text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
              เลือกเครื่องมือจาก<br className="hidden sm:block" />สิ่งที่อยากรู้
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#3B3D43] sm:text-lg">
              {readyCount} เครื่องมือที่ใช้งานได้จริง จัดกลุ่มตามคำถามที่คุณอยากตอบ แต่ละการ์ดบอกว่าต้องเตรียมอะไร
              ได้ผลลัพธ์แบบไหน และส่งออกเป็นรูปแบบวิทยานิพนธ์ได้หรือไม่ — ไม่มีเครื่องมือที่ติดป้ายว่าพร้อมแต่ใช้ไม่ได้
            </p>
          </div>
          <aside className="self-end md:col-span-4" aria-label="สถานะ AI ของระบบ">
            <div className="border border-black/15 bg-white p-5" data-testid="mr-ai-status">
              <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#5C5F66]">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI ของระบบ
              </p>
              {policyLoading || !policy ? (
                <p className="mt-2 text-sm text-[#3B3D43]">
                  {policyLoading ? 'กำลังตรวจสอบสถานะ…' : 'เข้าสู่ระบบเพื่อดูสถานะ AI ที่คุณใช้ได้'}
                </p>
              ) : policy.system_llm_enabled ? (
                <p className="mt-2 text-sm leading-relaxed text-[#2B2B2B]">
                  <b className="text-[#0E5538]">เปิดอยู่</b> — ฟังก์ชัน AI ส่วนใหญ่ใช้ของระบบได้ และเลือกใช้ AI ของคุณเองแทนก็ได้
                </p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-[#2B2B2B]">
                  <b className="text-amber-900">ปิดอยู่</b> — ฟังก์ชัน AI ใช้ผ่านพรอมต์ที่คัดลอกไปวางใน ChatGPT / Claude / Gemini
                  แล้วนำคำตอบกลับมาวาง (ไม่มีค่าใช้จ่ายฝั่งระบบ)
                  {hint ? <span className="mt-1 block text-[#3B3D43]">{hint}</span> : null}
                </p>
              )}
            </div>
          </aside>
        </section>

        {/* ---------- Where to start ---------- */}
        <section className="py-10 md:py-14" aria-labelledby="mr-start-title" data-testid="mr-start">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#5C5F66]">Start here</p>
              <h2 id="mr-start-title" className="mt-1 font-['IBM_Plex_Serif',serif] text-3xl font-medium tracking-tight">เริ่มจากตรงไหนดี</h2>
            </div>
            <div role="tablist" aria-label="เลือกบทบาทของคุณ" className="inline-flex w-full flex-col border border-black/30 sm:w-auto sm:flex-row">
              {Object.entries(ROLES).map(([key, r]) => {
                const RoleIcon = r.icon;
                const on = role === key;
                return (
                  <button key={key} type="button" role="tab" aria-selected={on}
                          onClick={() => setRole(key)}
                          data-testid={`mr-role-${key}`}
                          className={`inline-flex min-h-[44px] items-center gap-2 px-4 py-2 text-left text-sm font-bold transition-colors ${focusRing} ${on ? 'bg-[#0A0A0A] text-[#F4F0EA]' : 'bg-white text-[#0A0A0A] hover:bg-[#EBE7DD]'}`}>
                    <RoleIcon className="h-4 w-4 flex-none" aria-hidden="true" />{r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div role="tabpanel" className="mt-6 border border-black/15 bg-white p-5 sm:p-8" data-testid={`mr-role-panel-${role}`}>
            <p className="max-w-3xl text-base leading-relaxed text-[#2B2B2B]">{roleCfg.intro}</p>
            <ol className={`mt-6 grid grid-cols-1 gap-px bg-black/15 sm:grid-cols-2 ${roleCfg.steps.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
              {roleCfg.steps.map((s, i) => (
                <li key={s.t} className="flex flex-col gap-2 bg-[#F4F0EA] p-5">
                  <span className="font-mono text-xs font-bold text-[#C8102E]">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="text-base font-bold leading-snug">{s.t}</h3>
                  <p className="text-sm leading-relaxed text-[#3B3D43]">{s.d}</p>
                  {s.hash ? (
                    <a href={s.to} className={`mt-auto inline-flex min-h-[44px] items-center gap-1 pt-2 text-sm font-bold underline underline-offset-4 ${focusRing}`}>ดูเครื่องมือ <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
                  ) : (
                    <Link to={s.to} className={`mt-auto inline-flex min-h-[44px] items-center gap-1 pt-2 text-sm font-bold underline underline-offset-4 ${focusRing}`}>ไปที่หน้านี้ <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-5 flex items-start gap-2 text-sm text-[#3B3D43]">
              <Info className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
              ต้องเข้าสู่ระบบเพื่อสร้างการศึกษา · ผู้ตอบแบบสอบถามที่ได้รับลิงก์ไม่ต้องสมัครสมาชิก
            </p>
          </div>
        </section>

        {/* ---------- Tools by question ---------- */}
        <section id="groups" className="scroll-mt-24" aria-labelledby="mr-tools-title">
          <div className="flex flex-col justify-between gap-4 border-t border-black/30 pt-8 sm:flex-row sm:items-end">
            <h2 id="mr-tools-title" className="font-['IBM_Plex_Serif',serif] text-3xl font-medium tracking-tight">เครื่องมือตามคำถามวิจัย</h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label="กรองเครื่องมือ">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id}
                        onClick={() => setFilter(f.id)}
                        data-testid={`mr-filter-${f.id}`}
                        className={`min-h-[44px] border px-3 py-1.5 text-sm font-semibold transition-colors ${focusRing} ${filter === f.id ? 'border-[#0A0A0A] bg-[#0A0A0A] text-[#F4F0EA]' : 'border-black/30 bg-white text-[#0A0A0A] hover:bg-[#EBE7DD]'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 space-y-14">
            {visibleGroups.map((g, gi) => (
              <section key={g.id} aria-labelledby={`mr-group-${g.id}`} data-testid={`mr-group-${g.id}`}>
                <div className="mb-5 flex flex-col gap-1">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#C8102E]">{String(gi + 1).padStart(2, '0')} · {g.hint}</p>
                  <h3 id={`mr-group-${g.id}`} className="font-['IBM_Plex_Serif',serif] text-2xl font-medium italic leading-snug tracking-tight sm:text-3xl">{g.question}</h3>
                </div>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {g.tools.map((t) => <ToolCard key={t.id} tool={t} aiLabel={aiLabelFor(t)} />)}
                </div>
              </section>
            ))}
            {visibleGroups.length === 0 && (
              <p className="border border-dashed border-black/30 p-8 text-center text-[#3B3D43]">ไม่มีเครื่องมือที่ตรงกับตัวกรองนี้</p>
            )}
          </div>
        </section>

        {/* ---------- Beyond the tools ---------- */}
        <section className="mt-16 grid grid-cols-1 gap-px border border-black/15 bg-black/15 md:grid-cols-3" aria-label="ลิงก์ที่เกี่ยวข้อง">
          {[
            { to: '/dashboard', icon: BarChart3, t: 'งานวิจัยของฉัน', d: 'ดูการศึกษาและแบบสอบถามล่าสุดที่คุณสร้าง' },
            { to: '/showcase', icon: Newspaper, t: 'ตัวอย่างผลงานจริง', d: 'ดูรายงานที่เผยแพร่แล้ว ก่อนตัดสินใจเริ่มศึกษาของตัวเอง' },
            { to: '/learn', icon: BookOpen, t: 'คลังความรู้การตลาด', d: 'อ่านทฤษฎีและวิธีวิจัย แล้วกลับมาเลือกเครื่องมือ' },
          ].map((l) => {
            const LinkIcon = l.icon;
            return (
              <Link key={l.to} to={l.to} className={`group flex items-start gap-4 bg-white p-6 transition-colors hover:bg-[#EBE7DD] ${focusRing}`}>
                <LinkIcon className="mt-1 h-5 w-5 flex-none" aria-hidden="true" />
                <span>
                  <span className="block text-base font-bold">{l.t} <ArrowRight className="inline h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
                  <span className="mt-1 block text-sm leading-relaxed text-[#3B3D43]">{l.d}</span>
                </span>
              </Link>
            );
          })}
        </section>
      </main>
    </div>
  );
};

export default MarketResearch;

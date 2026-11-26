/**
 * Long-format data export (replaces the old one-cell-JSON CSV).
 * GET export-long?format=xlsx|csv — one row per alternative, with codebook, design and
 * a Thai README of R / Stata / Python commands, so the study can be re-estimated outside.
 */
import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Download, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { API } from '@/App';
import { saveBlob } from './cjFormat';
import { apiErrorTextAsync } from '@/lib/apiError';

const ConjointExportMenu = ({ studyId, token, className = '' }) => {
  const [busy, setBusy] = useState('');
  const run = async (format) => {
    setBusy(format);
    try {
      const r = await axios.get(`${API}/conjoint/studies/${studyId}/export-long`, {
        params: { format }, headers: { Authorization: `Bearer ${token}` }, responseType: 'blob', timeout: 120000,
      });
      saveBlob(r.data, `conjoint_${studyId.slice(0, 8)}_long.${format}`);
      toast.success(format === 'xlsx' ? 'ดาวน์โหลด Excel แล้ว — มีชีต README และ codebook' : 'ดาวน์โหลด CSV แล้ว');
    } catch (e) {
      toast.error(await apiErrorTextAsync(e, 'ดาวน์โหลดข้อมูลไม่สำเร็จ'));
    } finally { setBusy(''); }
  };
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button className={`bg-green-600 text-white hover:bg-green-700 ${className}`} disabled={!!busy} data-testid="export-long-btn">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          ดาวน์โหลดข้อมูลดิบ <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="px-2 py-1.5 text-xs text-gray-600">
          รูปแบบ long (1 แถวต่อ 1 ทางเลือก) พร้อม codebook — นำไปประมาณซ้ำใน R / Stata / Python ได้ และให้ผลตรงกับ MNL ในระบบ
        </div>
        <DropdownMenuItem onSelect={() => run('xlsx')} data-testid="export-long-xlsx">Excel (.xlsx) — แนะนำ: มี README, codebook, design, คุณภาพข้อมูล</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run('csv')} data-testid="export-long-csv">CSV — เฉพาะตารางข้อมูล</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ConjointExportMenu;

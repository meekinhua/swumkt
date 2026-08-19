import React, { useState, lazy, Suspense } from 'react';
import '../brand-equity/brand-equity-styles.css';
import './journey-styles.css';
import { BeTopbar, BeLoading } from '../brand-equity/be-components';
import JourneyListPage from './JourneyListPage';

const CustomerJourneyTool = lazy(() => import('@/pages/CustomerJourneyTool'));

/**
 * Shell for the two halves of the journey module: the qualitative AI map
 * (unchanged, embedded) and the quantitative study list.
 */
const CustomerJourneyHub = () => {
  const [tab, setTab] = useState('quant');

  return (
    <div className="be-root jy-root">
      <BeTopbar subtitle="CUSTOMER JOURNEY" active="customer_journey" />
      <div className="be-page">
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <button className={`be-chip ${tab === 'quant' ? 'solid' : ''}`} aria-pressed={tab === 'quant'} data-testid="journey-tab-quant"
                  onClick={() => setTab('quant')}>เชิงปริมาณ (เก็บข้อมูลจริง)</button>
          <button className={`be-chip ${tab === 'qual' ? 'solid' : ''}`} aria-pressed={tab === 'qual'} data-testid="journey-tab-qual"
                  onClick={() => setTab('qual')}>เชิงคุณภาพ (สร้างแผนที่ด้วย AI)</button>
        </div>

        {tab === 'quant' ? (
          <JourneyListPage />
        ) : (
          <Suspense fallback={<BeLoading text="กำลังโหลดเครื่องมือ…" />}>
            <div data-testid="journey-qual-embed" style={{ margin: '0 -32px' }}>
              <CustomerJourneyTool embedded />
            </div>
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default CustomerJourneyHub;

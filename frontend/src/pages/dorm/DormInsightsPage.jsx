import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import DormLayout, { PageHead, SkeletonPage } from './DormLayout';
import { API, labelOf, useDormMeta } from './dormApi';

const TH_M = { '06': 'มิ.ย.', '07': 'ก.ค.', '08': 'ส.ค.', '09': 'ก.ย.', '10': 'ต.ค.', '11': 'พ.ย.' };

const Bars = ({ rows, value, label, fmt = (x) => x }) => {
  const max = Math.max(...rows.map((r) => r[value]), 1);
  return (
    <div className="dm-hbars">
      {rows.map((r) => (
        <div key={r[label]} className="dm-hbar">
          <span>{fmt(r[label])}</span><i style={{ width: `${(r[value] / max) * 100}%` }} /><b>{r[value]}</b>
        </div>
      ))}
    </div>
  );
};

export default function DormInsightsPage() {
  const meta = useDormMeta();
  const [s, setS] = useState(null);
  useEffect(() => { axios.get(`${API}/stats`).then((r) => setS(r.data)).catch(() => setS({})); }, []);
  const ins = s?.insights;

  return (
    <DormLayout title="ตลาดที่พักรอบ มศว">
      <PageHead title="ตลาดที่พักรอบ มศว ประสานมิตร" sub="สรุปจากแชทกลุ่มหาที่พัก มิ.ย. ถึง พ.ย. 2569" />
      {!s ? <SkeletonPage /> : !ins ? <p className="dm-muted">ยังไม่มีข้อมูล</p> : (
        <>
          <p className="dm-lede">
            เราอ่านแชทกลุ่ม OpenChat “พี่ มศว พาน้องหาที่พัก หารูมเมท” ซึ่งมีสมาชิกราว 7,500 คน ช่วง มิ.ย. ถึง พ.ย. 2569
            รวม {ins.messages_total} ข้อความ เหลือ {ins.messages_unique} ข้อความหลังตัดโพสต์ซ้ำ แล้วจัดหมวดด้วยคำค้น
            หนึ่งข้อความนับได้หลายหมวด เราไม่เก็บชื่อหรือช่องทางติดต่อของใคร
          </p>

          <section className="dm-sec">
            <h2>สิ่งที่คนในกลุ่มเจอ และสิ่งที่เว็บนี้ทำให้</h2>
            <div className="dm-finds" style={{ marginTop: 10 }}>
              {ins.pains.map((p) => (
                <div key={p.id} className="dm-find">
                  <b>{p.count}</b>
                  <p>{p.label}<small>ที่นี่ช่วยด้วย{p.fix}</small></p>
                </div>
              ))}
            </div>
            <p className="dm-small dm-muted" style={{ marginTop: 10 }}>
              ตัวเลขคือจำนวนโพสต์ที่พูดถึงเรื่องนั้น มีคน {ins.repost.people_seeking_mates} คนโพสต์หาเมท
              {' '}{ins.repost.posted_3plus_times} คนต้องโพสต์ซ้ำตั้งแต่ 3 ครั้งขึ้นไป และมากที่สุดคือ {ins.repost.max_posts_one_person} ครั้ง
            </p>
          </section>

          <section className="dm-sec dm-cols">
            <div>
              <h2>งบต่อคนต่อเดือนที่ถูกพูดถึง</h2>
              <p className="dm-small dm-muted">ส่วนใหญ่อยู่ที่ 4,000 ถึง 6,000 บาท</p>
              <Bars rows={ins.budget_per_person_hist} value="n" label="band" fmt={(b) => `${b} บาท`} />
            </div>
            <div>
              <h2>โซนที่ถูกพูดถึง</h2>
              <p className="dm-small dm-muted">อโศกกับพระราม 9 นำห่าง</p>
              <Bars rows={ins.zone_mentions} value="n" label="zone" fmt={(z) => labelOf(meta?.zones, z)} />
            </div>
          </section>

          <section className="dm-sec">
            <h2>ข้อความต่อเดือน</h2>
            <p className="dm-small dm-muted">
              คึกที่สุดช่วง มิ.ย. ก่อนเปิดเทอม แล้วมีระลอกเล็กช่วง ต.ค. ถึง พ.ย. ซึ่งเป็นช่วงส่งต่อสัญญาเพื่อเข้าอยู่ ม.ค.
              ส่วนคนเข้ากลุ่มใหม่มีราว 100 ถึง 200 คนทุกเดือน
            </p>
            <Bars rows={ins.monthly} value="messages" label="month" fmt={(m) => TH_M[m.slice(5)] || m} />
          </section>

          {s.live && (
            <p className="dm-live" style={{ marginTop: 28 }}>
              บนเว็บนี้ตอนนี้มี <b>{s.live.listings} ประกาศห้อง</b>, <b>{s.live.mates} โปรไฟล์หาเมท</b> และ <b>{s.live.reviews} รีวิวตึก</b>
            </p>
          )}
          <p style={{ marginTop: 14 }}><Link to="/dorm" className="dm-btn dm-btn-primary">เริ่มหาห้องหรือหาเมท</Link></p>
        </>
      )}
    </DormLayout>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import { Topbar, Footer, Eyebrow } from './swumkt/SwumktComponents';
import useDocumentMeta from '@/hooks/useDocumentMeta';
import useSiteText from '@/hooks/useSiteText';

/**
 * /privacy — plain-language summary of what this platform stores (PDPA).
 *
 * NOT the department's official policy: the page says so at the top. The owner can
 * reword the contact line and the status note without a deploy through site settings
 * (`privacy.contact`, `privacy.status_note`, `privacy.updated`) — see useSiteText.
 * Keep the lists below in step with what the backend actually stores.
 */
const Section = ({ id, title, children }) => (
  <section id={id} aria-labelledby={`${id}-h`} style={{ marginTop: 40 }}>
    <h2 id={`${id}-h`} className="h-section" style={{ fontSize: 'clamp(22px, 4vw, 30px)', lineHeight: 1.25 }}>{title}</h2>
    <div style={{ marginTop: 14, fontSize: 16, lineHeight: 1.8, maxWidth: '72ch' }}>{children}</div>
  </section>
);

const ul = { paddingLeft: 22, listStyle: 'disc', display: 'grid', gap: 6 };

const PrivacyPage = () => {
  const t = useSiteText();
  useDocumentMeta({
    title: 'ความเป็นส่วนตัวและข้อมูลส่วนบุคคล · SWU MKT',
    description: 'สรุปภาษาง่ายว่าแพลตฟอร์ม SWU MKT เก็บข้อมูลส่วนบุคคลอะไร ใช้ทำอะไร ใครเห็นได้ และขอลบได้อย่างไร',
  });

  return (
    <div data-testid="privacy-page">
      <Topbar active="about" />
      <main className="swu-container" style={{ padding: '48px 16px 80px', maxWidth: 920 }}>
        <Eyebrow red dot>PRIVACY · PDPA</Eyebrow>
        <h1 className="h-display" style={{ marginTop: 18, fontSize: 'clamp(30px, 6vw, 52px)', lineHeight: 1.15 }}>
          ความเป็นส่วนตัวและข้อมูลส่วนบุคคล
        </h1>

        <div role="note" data-testid="privacy-status-note"
             style={{ marginTop: 24, border: '2px solid #B8860B', background: '#FFF8E6', padding: '14px 16px', fontSize: 15, lineHeight: 1.7 }}>
          <b>หน้านี้เป็นสรุปภาษาง่าย ยังไม่ใช่นโยบายความเป็นส่วนตัวฉบับทางการ</b> —{' '}
          {t('privacy.status_note', 'อยู่ระหว่างรอข้อความนโยบายฉบับทางการจากสาขาวิชาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ เมื่อมีฉบับทางการ ฉบับทางการจะมีผลเหนือหน้านี้')}
          {t('privacy.updated', '') ? <> · ปรับปรุงล่าสุด {t('privacy.updated', '')}</> : null}
        </div>

        <Section id="what" title="เราเก็บข้อมูลอะไรบ้าง">
          <ul style={ul}>
            <li><b>บัญชีผู้ใช้</b> — ชื่อ อีเมล รหัสผ่าน (เก็บแบบเข้ารหัสทางเดียว) บทบาท (เช่น นักศึกษา ศิษย์เก่า อาจารย์) และข้อมูลที่คุณกรอกเองในโปรไฟล์ เช่น รหัสนิสิต ปีที่จบ รูปโปรไฟล์ หากเข้าสู่ระบบด้วย Google จะได้รับชื่อ อีเมล และรูปโปรไฟล์จาก Google</li>
            <li><b>งานวิจัยที่คุณสร้าง</b> — แบบสอบถาม การศึกษา Conjoint / Brand Health Check / Customer Value / Customer Journey ไฟล์ที่อัปโหลด และผลวิเคราะห์ รวมถึงข้อความที่ได้จาก AI (ทั้ง AI ของระบบและข้อความที่คุณนำเข้าจาก AI ของคุณเอง)</li>
            <li><b>คำตอบแบบสอบถาม</b> — คำตอบของผู้ตอบ ข้อมูลประชากรที่ผู้สร้างแบบสอบถามขอ (เช่น ช่วงอายุ เพศ) เวลาที่ใช้ตอบ และตัวบ่งชี้คุณภาพคำตอบ (เช่น ตอบเร็วผิดปกติ) ผู้ตอบไม่จำเป็นต้องมีบัญชี</li>
            <li><b>โปรไฟล์ศิษย์เก่า (สายเทค)</b> — ชื่อเล่น รุ่น ตำแหน่ง/ที่ทำงาน ความสนใจ คำเรียกในสายที่คุณเลือก ความสัมพันธ์พี่เทค–น้องเทค คะแนน XP และการแจ้งเตือน</li>
            <li>
              <b>ชื่อที่สมาชิกคนอื่นเพิ่มแทนคนที่ยังไม่ได้สมัคร</b> (เช่น “พี่เทคของฉันคือพี่หมู รุ่น 61”) —
              เก็บ<b>เฉพาะชื่อเล่น/ชื่อที่แสดงและรุ่น</b> (และเลขขึ้นต้นรหัสหรือเพศ ถ้าผู้เพิ่มใส่) <b>ไม่เก็บอีเมลหรือเบอร์โทร</b>
              เห็นได้เฉพาะสมาชิกที่เข้าสู่ระบบ และเจ้าตัวขอลบได้ทุกเมื่อ
            </li>
            <li><b>ข้อมูลทางเทคนิค</b> — โทเค็นเข้าสู่ระบบในเบราว์เซอร์ของคุณ (localStorage) และบันทึกการทำงานของเซิร์ฟเวอร์ตามปกติ เว็บไซต์นี้ไม่ใช้คุกกี้โฆษณา</li>
          </ul>
        </Section>

        <Section id="why" title="ใช้ข้อมูลเพื่ออะไร">
          <ul style={ul}>
            <li>ให้บริการเครื่องมือวิจัย การเรียนการสอน และการทำวิทยานิพนธ์</li>
            <li>แสดงผลวิเคราะห์ให้เจ้าของงานวิจัย และเผยแพร่ผลสรุปเมื่อเจ้าของงานเลือกเผยแพร่เอง</li>
            <li>เชื่อมต่อเครือข่ายศิษย์เก่า (ต่อสายเทค ยืนยันความสัมพันธ์ นัดเลี้ยงสาย แจ้งเตือน)</li>
            <li>ดูแลความปลอดภัยและแก้ปัญหาของระบบ</li>
          </ul>
        </Section>

        <Section id="who" title="ใครเห็นข้อมูลได้บ้าง">
          <ul style={ul}>
            <li><b>ข้อมูลบัญชี</b> — คุณ และผู้ดูแลระบบ</li>
            <li><b>คำตอบแบบสอบถามรายคน</b> — เจ้าของงานวิจัยนั้น และผู้ดูแลระบบ</li>
            <li><b>หน้าแสดงผลสาธารณะ / Showcase</b> — ทุกคน แต่เฉพาะเมื่อเจ้าของงานกดเผยแพร่ และแสดงเฉพาะผลรวม (ไม่แสดงคำตอบรายคน) อาจมีข้อความสรุปที่เขียนโดย AI ซึ่งเจ้าของงานนำเข้าไว้</li>
            <li><b>โปรไฟล์ศิษย์เก่าและผังสายเทค</b> — สมาชิกที่เข้าสู่ระบบ ผู้ที่ไม่ได้เป็นสมาชิกจะเห็นชื่อที่ยังไม่ได้สมัครเป็น “สมาชิกที่ยังไม่ลงทะเบียน”</li>
            <li>
              <b>AI</b> — เมื่อผู้ดูแลระบบเปิดใช้ AI ของระบบและคุณกดใช้ ข้อมูลที่จำเป็นต่องานนั้น (เช่น ตารางผลวิเคราะห์ หรือคำตอบปลายเปิดของแบบสอบถาม) จะถูกส่งไปยังผู้ให้บริการ AI ภายนอก
              หากคุณเลือก “ใช้ AI ของฉันเอง” คุณเป็นผู้คัดลอกพรอมต์ไปวางในบริการ AI ที่คุณเลือกเอง ซึ่งอยู่ภายใต้เงื่อนไขของบริการนั้น
            </li>
          </ul>
        </Section>

        <Section id="remove" title="ขอดู แก้ไข หรือลบข้อมูล">
          <ul style={ul}>
            <li>แก้ไขโปรไฟล์และโปรไฟล์ศิษย์เก่าได้เองในหน้าโปรไฟล์ ลบงานวิจัยของตัวเองได้จากหน้างานวิจัยนั้น</li>
            <li>หากมีคนเพิ่มชื่อคุณในสายเทคโดยที่คุณยังไม่ได้สมัคร คุณขอลบชื่อนั้นได้ (ในหน้าสายเทคมีตัวเลือก “นี่คือฉัน — ลบชื่อนี้”) หรือแจ้งผู้ดูแลระบบ</li>
            <li>ขอสำเนาข้อมูล ขอลบบัญชี หรือสอบถามเรื่องข้อมูลส่วนบุคคล:{' '}
              <span data-testid="privacy-contact">
                {t('privacy.contact', 'ติดต่อสาขาวิชาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ ผ่านช่องทางในหน้า')}
              </span>{' '}
              <Link to="/people" style={{ textDecoration: 'underline' }}>ติดต่อคณาจารย์</Link>
            </li>
          </ul>
        </Section>

        <p style={{ marginTop: 48, fontSize: 14, color: '#555' }}>
          <Link to="/" style={{ textDecoration: 'underline' }}>← กลับหน้าแรก</Link>
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default PrivacyPage;

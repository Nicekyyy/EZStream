"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ezstream/ui";

/**
 * Hook สำหรับแจ้งเตือนผู้ใช้หากมีความพยายามจะออกจากหน้าเว็บ (ปิดแท็บ, รีเฟรช, สลับหน้า)
 * ในขณะที่ยังมีข้อมูลที่ยังไม่ได้บันทึก (isDirty = true)
 */
export function useUnsavedChangesWarning(
  isDirty: boolean,
  onSaveAndLeave?: () => Promise<boolean | void>,
  warningMessage: string = "คุณมีการตั้งค่าที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?"
) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [targetHref, setTargetHref] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isDirty) return;

    // 1. ดักจับการปิดแท็บ, รีเฟรช, หรือกดไปลิงก์ภายนอก
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = warningMessage;
      return warningMessage;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    // 2. ดักจับการคลิกที่ <a> tag สำหรับการนำทางด้วย Next.js Link ใน App Router
    const handleClick = (e: MouseEvent) => {
      // หา <a> tag ที่ใกล้ที่สุดที่ถูกคลิก
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      
      // ข้ามถ้าไม่มี href, เป็นลิงก์ภายนอก, หรือเปิดแท็บใหม่
      if (!href || href.startsWith("http") || target.getAttribute("target") === "_blank") return;

      // ข้ามถ้าเป็นลิงก์หน้าปัจจุบัน
      if (href === window.location.pathname + window.location.search) return;

      // ป้องกันการแจ้งเตือนซ้ำซ้อนใน event เดียวกัน (กรณีมีหลาย Hook ทำงานพร้อมกัน)
      if ((e as any)._unsavedWarningShown) return;
      (e as any)._unsavedWarningShown = true;

      // ป้องกันการทำงานของ Link ทันที
      e.preventDefault();
      e.stopPropagation();

      // เก็บ URL เป้าหมายแล้วเปิด Modal
      setTargetHref(href);
      setShowModal(true);
    };

    // ใช้ capture: true เพื่อดักจับ event ก่อนที่ Next.js Link จะจัดการ
    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, [isDirty, warningMessage]);

  const confirmLeave = () => {
    setShowModal(false);
    if (targetHref) {
      router.push(targetHref);
    }
  };

  const cancelLeave = () => {
    setShowModal(false);
    setTargetHref("");
  };

  const handleSaveAndLeave = async () => {
    if (!onSaveAndLeave) return;
    setIsSaving(true);
    try {
      const result = await onSaveAndLeave();
      if (result !== false) {
        setShowModal(false);
        if (targetHref) {
          router.push(targetHref);
        }
      }
    } catch (err) {
      console.error("Save and leave failed:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const UnsavedChangesModal = showModal ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm border-2 border-border-base bg-surface-base p-6 shadow-brutal-md animate-in zoom-in-95 duration-200">
        <h3 className="text-lg font-bold text-rose-400 mb-2">ยังไม่ได้บันทึกการเปลี่ยนแปลง</h3>
        <p className="text-sm text-ink-muted mb-6">
          {warningMessage}
        </p>
        <div className="flex flex-col gap-3">
          {onSaveAndLeave && (
            <Button disabled={isSaving} className="bg-emerald-600 text-white hover:bg-emerald-500 border-emerald-500 shadow-emerald-900/20" onClick={() => void handleSaveAndLeave()}>
              {isSaving ? "กำลังบันทึก..." : "บันทึกและออกจากหน้า"}
            </Button>
          )}
          <Button disabled={isSaving} className="bg-rose-600 text-white hover:bg-rose-500 border-rose-500 shadow-rose-900/20" onClick={confirmLeave}>
            ละทิ้งการเปลี่ยนแปลง
          </Button>
          <Button disabled={isSaving} variant="secondary" onClick={cancelLeave}>
            อยู่หน้านี้ต่อ
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return { UnsavedChangesModal };
}

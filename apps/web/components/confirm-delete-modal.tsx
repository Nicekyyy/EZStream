"use client";

import { useEffect, useState } from "react";
import { Button } from "@ezstream/ui";
import { Input } from "./ui-kit";

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemName,
  description
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  itemName: string;
  description?: string;
}) {
  const [input, setInput] = useState("");

  useEffect(() => {
    if (isOpen) {
      setInput("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm border-2 border-border-base bg-surface-base p-6 shadow-brutal-md animate-in zoom-in-95 duration-200">
        <h3 className="text-lg font-bold text-rose-400 mb-2">{title}</h3>
        {description && <p className="text-sm text-ink-muted mb-4">{description}</p>}
        <p className="text-sm text-ink-muted mb-2">
          พิมพ์ <span className="font-bold text-white select-all">{itemName}</span> เพื่อยืนยัน
        </p>
        <Input 
          className="mb-4"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={itemName}
          autoFocus
        />
        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            className="flex-1 bg-rose-600 text-white hover:bg-rose-500 border-rose-500 shadow-rose-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={input !== itemName}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            ยืนยันการลบ
          </Button>
          <Button className="flex-1" variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
        </div>
      </div>
    </div>
  );
}

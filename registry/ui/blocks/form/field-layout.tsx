import type { ReactNode } from "react";
import { useReadOnly } from "@/components/form/form-hook";

/**
 * 页面为录入态写的排版层（多列栅格、行内 flex、纵向间距），查看态下退成 Fragment。
 *
 * 查看态每个字段已经是一行「键 / 值」。包裹层留着会有三个后果：行被并排、值不再排成一条竖线；
 * 发丝线落在包裹层上而不是每一行上；包裹层自己的内边距与行的 `px-3` 叠加，行和行对不齐。
 * 退成 Fragment 让行重新成为键值卡的直系子节点，这三件事一起消失。
 */
export function FieldLayout(props: { className: string; children: ReactNode }) {
  const readOnly = useReadOnly();
  if (readOnly) return <>{props.children}</>;
  return <div className={props.className}>{props.children}</div>;
}

/**
 * 填写指引，查看态不渲染。
 *
 * 它说的是「该怎么填」，读记录的人用不上；而且它不是 `FieldRow`，留在查看态的键值卡里会直接
 * 贴到卡片边框上。派生值（算出来的窗口、关联记录摘要）不属于这里，用 `FieldRow` 排进键值列。
 */
export function FieldHint(props: { children: ReactNode }) {
  const readOnly = useReadOnly();
  if (readOnly) return null;
  return <p className="text-sm text-muted-foreground">{props.children}</p>;
}

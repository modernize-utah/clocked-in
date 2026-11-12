"use client";

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { DialogFooter } from "@/components/ui/dialog";

const DialogActionsContext = createContext<{
  target: HTMLElement | null;
  setTarget: (node: HTMLElement | null) => void;
  plain: boolean;
} | null>(null);

export function DialogActionsProvider({ children, plain = false }: { children: ReactNode; plain?: boolean }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ target, setTarget, plain }), [target, plain]);
  return <DialogActionsContext.Provider value={value}>{children}</DialogActionsContext.Provider>;
}

export function DialogActionsSlot({ className }: { className?: string }) {
  const context = useContext(DialogActionsContext);
  if (!context) return null;
  return <div ref={(node) => context.setTarget(node)} className={cn("empty:hidden", className)} />;
}

export function DialogActions({
  children,
  className,
  form,
}: {
  children: ReactNode;
  className?: string;
  form?: string;
}) {
  const context = useContext(DialogActionsContext);
  const actions = form ? withForm(children, form) : children;
  if (context) {
    if (!context.target) return null;
    if (context.plain) {
      return createPortal(<div className={cn("flex flex-wrap justify-end gap-2", className)}>{actions}</div>, context.target);
    }
    return createPortal(<DialogFooter className={className}>{actions}</DialogFooter>, context.target);
  }

  return <div className={cn("flex justify-end gap-2", className)}>{actions}</div>;
}

function withForm(children: ReactNode, form: string) {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<{ form?: string }>;
    return element.props.form ? element : cloneElement(element, { form });
  });
}

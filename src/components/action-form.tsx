"use client";
import * as React from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { ActionState } from "@/lib/errors";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const FormStateContext = React.createContext<ActionState>(null);
export const useFormState = () => React.useContext(FormStateContext);

/** Field errors of the enclosing ActionForm, for a given field name. */
export function useFieldError(name: string): string[] | undefined {
  return useFormState()?.fieldErrors?.[name];
}

export function ActionForm({
  action, children, className, resetOnSuccess = false, successToast = true, showInlineError = true, onSuccess,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  successToast?: boolean;
  showInlineError?: boolean;
  onSuccess?: (state: ActionState) => void;
}) {
  const [state, formAction] = React.useActionState(action, null);
  const ref = React.useRef<HTMLFormElement>(null);
  const onSuccessRef = React.useRef(onSuccess);
  React.useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (successToast && state.message) toast.success(state.message);
      if (resetOnSuccess) ref.current?.reset();
      onSuccessRef.current?.(state);
    } else if (state.message && !showInlineError) {
      toast.error(state.message);
    }
  }, [state, successToast, resetOnSuccess, showInlineError]);

  return (
    <FormStateContext.Provider value={state}>
      <form ref={ref} action={formAction} className={className} noValidate>
        {showInlineError && state && !state.ok && state.message && (
          <Alert tone="danger" className="mb-4">
            {state.message}
          </Alert>
        )}
        {children}
      </form>
    </FormStateContext.Provider>
  );
}

export function SubmitButton({ children, pendingText = "Memproses…", ...props }: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? pendingText : children}
    </Button>
  );
}

/** Stable per-form idempotency key: a resubmission of the same form reuses it. */
export function IdempotencyKey() {
  const [key] = React.useState(() => crypto.randomUUID());
  return <input type="hidden" name="idempotency_key" value={key} />;
}

export function FieldError({ name }: { name: string }) {
  const err = useFieldError(name);
  if (!err?.length) return null;
  return <p className="text-xs font-medium text-danger">{err[0]}</p>;
}
